'use strict';

const SSM_REGION = 'ap-south-1';
const SSM_PATH = '/skillomate/prod/';
const EXPECTED_PARAMETER_COUNT = 73;
const REQUIRED_KEYS = Object.freeze([
  'MONGODB_URI',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_SIGNUP_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'CLOUDFRONT_PRIVATE_KEY',
  'CLOUDFRONT_PUBLIC_KEY_ID',
]);
const BOOTSTRAP_MARKER = Symbol.for('skillomate.ssm.bootstrap');
const RETRYABLE_ERROR_NAMES = new Set([
  'Throttling',
  'ThrottlingException',
  'TooManyRequestsException',
  'RequestLimitExceeded',
  'ProvisionedThroughputExceededException',
  'InternalServerError',
  'InternalServerErrorException',
  'ServiceUnavailable',
  'ServiceUnavailableException',
]);

class SsmConfigError extends Error {
  constructor(type, names = [], count = 0) {
    super(type);
    this.name = 'SsmConfigError';
    this.type = type;
    this.names = names;
    this.count = count;
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function isRetryable(error) {
  return RETRYABLE_ERROR_NAMES.has(error?.name)
    || error?.$retryable?.throttling === true
    || error?.$retryable?.transient === true;
}

async function sendWithRetry(client, command, pause = wait) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await client.send(command);
    } catch (error) {
      if (attempt === 4 || !isRetryable(error)) throw error;
      await pause(Math.min(2000, 200 * (2 ** (attempt - 1))));
    }
  }
}

function validateParameters(parameters) {
  const missing = REQUIRED_KEYS.filter((name) => {
    const value = parameters.get(name);
    return typeof value !== 'string' || value.trim() === '';
  });
  if (missing.length) {
    throw new SsmConfigError('MissingRequiredParameters', missing, parameters.size);
  }
  if (parameters.size !== EXPECTED_PARAMETER_COUNT) {
    throw new SsmConfigError('ParameterCountMismatch', [], parameters.size);
  }
  return parameters;
}

async function readSsmConfig({ client, pause = wait } = {}) {
  // Import only in SSM mode so the existing server entrypoint has no AWS startup dependency.
  const { SSMClient, GetParametersByPathCommand } = require('@aws-sdk/client-ssm');
  const ownsClient = !client;
  const ssm = client || new SSMClient({ region: SSM_REGION, retryMode: 'standard', maxAttempts: 3 });
  const parameters = new Map();
  const seenTokens = new Set();
  let nextToken;

  try {
    for (let page = 0; page < 100; page += 1) {
      const response = await sendWithRetry(ssm, new GetParametersByPathCommand({
        Path: SSM_PATH,
        Recursive: true,
        WithDecryption: true,
        MaxResults: 10,
        ...(nextToken ? { NextToken: nextToken } : {}),
      }), pause);

      for (const parameter of response?.Parameters || []) {
        const fullName = parameter?.Name;
        const name = typeof fullName === 'string' && fullName.startsWith(SSM_PATH)
          ? fullName.slice(SSM_PATH.length)
          : '';
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
          throw new SsmConfigError('InvalidParameterName', [String(fullName || '')], parameters.size);
        }
        if (parameter.Type !== 'SecureString') {
          throw new SsmConfigError('InvalidParameterType', [name], parameters.size);
        }
        if (typeof parameter.Value !== 'string') {
          throw new SsmConfigError('MissingParameterValue', [name], parameters.size);
        }
        if (parameters.has(name)) {
          throw new SsmConfigError('DuplicateParameterName', [name], parameters.size);
        }
        parameters.set(name, parameter.Value);
      }

      nextToken = response?.NextToken;
      if (!nextToken) return validateParameters(parameters);
      if (seenTokens.has(nextToken)) {
        throw new SsmConfigError('RepeatedNextToken', [], parameters.size);
      }
      seenTokens.add(nextToken);
    }
    throw new SsmConfigError('PaginationLimitExceeded', [], parameters.size);
  } catch (error) {
    if (error.count === undefined) error.count = parameters.size;
    throw error;
  } finally {
    if (ownsClient) ssm.destroy();
  }
}

function injectIntoEnvironment(parameters, env = process.env) {
  validateParameters(parameters);
  for (const [name, value] of parameters) env[name] = value;
}

function safeName(name) {
  return String(name).replace(/[^A-Za-z0-9_./-]/g, '?').slice(0, 128);
}

function safeErrorType(error) {
  return String(error?.type || error?.name || 'UnknownError')
    .replace(/[^A-Za-z0-9_]/g, '')
    .slice(0, 80) || 'UnknownError';
}

async function main({ args = process.argv.slice(2), env = process.env, client, log = console, startServer = () => require('./server') } = {}) {
  const checkOnly = args.includes('--check');
  if (!checkOnly && env.SKILLOMATE_CONFIG_SOURCE !== 'ssm') {
    startServer();
    return true;
  }

  let parameters;
  try {
    parameters = await readSsmConfig({ client });
  } catch (error) {
    if (checkOnly) {
      log.log(`parameter count: ${Number.isInteger(error.count) ? error.count : 0}`);
      if (error.names?.length) log.log(`parameter names: ${error.names.map(safeName).join(', ')}`);
      log.error('SSM CONFIG CHECK FAILURE');
    } else {
      log.error(`SSM_CONFIG_STARTUP_FAILURE: ${safeErrorType(error)}`);
      if (error.names?.length) log.error(`parameter names: ${error.names.map(safeName).join(', ')}`);
    }
    return false;
  }

  if (checkOnly) {
    log.log(`parameter count: ${parameters.size}`);
    log.log('SSM CONFIG CHECK SUCCESS');
    return true;
  }

  injectIntoEnvironment(parameters, env);
  globalThis[BOOTSTRAP_MARKER] = true;
  startServer();
  return true;
}

if (require.main === module) {
  main().then((success) => {
    if (!success) process.exitCode = 1;
  }).catch((error) => {
    // Never log AWS exception messages: they can contain request context.
    console.error(`SSM_CONFIG_STARTUP_FAILURE: ${safeErrorType(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  EXPECTED_PARAMETER_COUNT,
  REQUIRED_KEYS,
  SSM_PATH,
  SSM_REGION,
  SsmConfigError,
  injectIntoEnvironment,
  main,
  readSsmConfig,
  sendWithRetry,
  validateParameters,
};
