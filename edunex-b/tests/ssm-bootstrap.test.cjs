const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  REQUIRED_KEYS,
  SSM_PATH,
  main,
  readSsmConfig,
} = require('../ssm-bootstrap');

const SECRET = 'never-print-this-secret';
const EXISTING_PRODUCTION_PARAMETER_COUNT = 73;
const CURRENT_PRODUCTION_PARAMETER_COUNT = EXISTING_PRODUCTION_PARAMETER_COUNT + 2;

function productionParameters() {
  const names = [...REQUIRED_KEYS];
  while (names.length < CURRENT_PRODUCTION_PARAMETER_COUNT) names.push(`OPTIONAL_${names.length}`);
  return names.map((name) => ({
    Name: `${SSM_PATH}${name}`,
    Type: name === 'CLARITY_NUM_DAYS' ? 'String' : 'SecureString',
    Value: name === 'CLARITY_NUM_DAYS' ? '3' : SECRET,
  }));
}

function pagedClient(parameters = productionParameters()) {
  const pages = [];
  for (let offset = 0; offset < parameters.length; offset += 10) {
    pages.push(parameters.slice(offset, offset + 10));
  }
  const calls = [];
  return {
    calls,
    async send(command) {
      calls.push(command.input);
      const index = command.input.NextToken ? Number(command.input.NextToken) : 0;
      return { Parameters: pages[index], ...(index + 1 < pages.length ? { NextToken: String(index + 1) } : {}) };
    },
  };
}

function logger() {
  const lines = [];
  return { lines, log: (line) => lines.push(line), error: (line) => lines.push(line) };
}

test('reads all pages with decryption and validates 75 mixed String and SecureString parameters', async () => {
  const client = pagedClient();
  const parameters = await readSsmConfig({ client });
  assert.equal(parameters.size, 75);
  assert.equal(client.calls.length, 8);
  for (const input of client.calls) {
    assert.equal(input.Path, '/skillomate/prod/');
    assert.equal(input.Recursive, true);
    assert.equal(input.WithDecryption, true);
    assert.equal(input.MaxResults, 10);
  }
  assert.equal(client.calls[1].NextToken, '1');
  assert.equal(parameters.get('MONGODB_URI'), SECRET);
  assert.equal(parameters.get('CLARITY_API_TOKEN'), SECRET);
  assert.equal(parameters.get('CLARITY_NUM_DAYS'), '3');
});

test('retries throttling before accepting a page', async () => {
  const client = pagedClient();
  const send = client.send.bind(client);
  let attempts = 0;
  client.send = async (command) => {
    if (++attempts === 1) throw Object.assign(new Error('do not log this detail'), { name: 'ThrottlingException' });
    return send(command);
  };
  const pauses = [];
  const parameters = await readSsmConfig({ client, pause: async (milliseconds) => pauses.push(milliseconds) });
  assert.equal(parameters.size, 75);
  assert.deepEqual(pauses, [200]);
});

test('SSM values override existing environment only after complete validation', async () => {
  const env = { SKILLOMATE_CONFIG_SOURCE: 'ssm', MONGODB_URI: 'stale-local-value' };
  let starts = 0;
  assert.equal(await main({ env, client: pagedClient(), startServer: () => { starts += 1; } }), true);
  assert.equal(env.MONGODB_URI, SECRET);
  assert.equal(starts, 1);
});

test('incomplete SSM set fails closed without changing environment or starting server', async () => {
  const env = { SKILLOMATE_CONFIG_SOURCE: 'ssm', MONGODB_URI: 'stale-local-value' };
  const log = logger();
  const parameters = productionParameters().filter((parameter) => !parameter.Name.endsWith('/JWT_SECRET'));
  let starts = 0;
  const result = await main({ env, client: pagedClient(parameters), log, startServer: () => { starts += 1; } });
  assert.equal(result, false);
  assert.equal(starts, 0);
  assert.equal(env.MONGODB_URI, 'stale-local-value');
  assert.ok(log.lines.some((line) => line.includes('JWT_SECRET')));
  assert.ok(!log.lines.join('\n').includes(SECRET));
});

test('missing critical key fails closed and logs only its name', async () => {
  const parameters = productionParameters();
  parameters[0] = { Name: `${SSM_PATH}EXTRA_KEY`, Type: 'SecureString', Value: SECRET };
  const log = logger();
  const result = await main({ env: { SKILLOMATE_CONFIG_SOURCE: 'ssm' }, client: pagedClient(parameters), log, startServer: () => assert.fail('server started') });
  assert.equal(result, false);
  assert.ok(log.lines.join('\n').includes('MONGODB_URI'));
  assert.ok(!log.lines.join('\n').includes(SECRET));
});

test('check mode validates without injecting values or starting HTTP server', async () => {
  const env = { MONGODB_URI: 'original' };
  const log = logger();
  const result = await main({ args: ['--check'], env, client: pagedClient(), log, startServer: () => assert.fail('server started') });
  assert.equal(result, true);
  assert.deepEqual(log.lines, ['parameter count: 75', 'SSM CONFIG CHECK SUCCESS']);
  assert.equal(env.MONGODB_URI, 'original');
});

test('check mode failure prints count and failure marker without secret values', async () => {
  const log = logger();
  const result = await main({
    args: ['--check'],
    client: pagedClient(productionParameters().filter((parameter) => !parameter.Name.endsWith('/JWT_SECRET'))),
    log,
    startServer: () => assert.fail('server started'),
  });
  assert.equal(result, false);
  assert.deepEqual(log.lines, ['parameter count: 74', 'parameter names: JWT_SECRET', 'SSM CONFIG CHECK FAILURE']);
});

test('check mode requires CLARITY_API_TOKEN without logging the sensitive key name or value', async () => {
  const log = logger();
  const result = await main({
    args: ['--check'],
    client: pagedClient(productionParameters().filter((parameter) => !parameter.Name.endsWith('/CLARITY_API_TOKEN'))),
    log,
    startServer: () => assert.fail('server started'),
  });
  assert.equal(result, false);
  assert.deepEqual(log.lines, ['parameter count: 74', 'SSM CONFIG CHECK FAILURE']);
  assert.ok(!log.lines.join('\n').includes('CLARITY_API_TOKEN'));
  assert.ok(!log.lines.join('\n').includes(SECRET));
});

test('check mode reports missing CLARITY_NUM_DAYS by name without secret values', async () => {
  const log = logger();
  const result = await main({
    args: ['--check'],
    client: pagedClient(productionParameters().filter((parameter) => !parameter.Name.endsWith('/CLARITY_NUM_DAYS'))),
    log,
    startServer: () => assert.fail('server started'),
  });
  assert.equal(result, false);
  assert.deepEqual(log.lines, ['parameter count: 74', 'parameter names: CLARITY_NUM_DAYS', 'SSM CONFIG CHECK FAILURE']);
  assert.ok(!log.lines.join('\n').includes(SECRET));
});

test('rejects String parameters except explicitly allowed non-secret keys', async () => {
  const parameters = productionParameters();
  const mongodb = parameters.find((parameter) => parameter.Name.endsWith('/MONGODB_URI'));
  mongodb.Type = 'String';
  const log = logger();
  const result = await main({
    args: ['--check'],
    client: pagedClient(parameters),
    log,
    startServer: () => assert.fail('server started'),
  });
  assert.equal(result, false);
  assert.deepEqual(log.lines, ['parameter count: 0', 'parameter names: MONGODB_URI', 'SSM CONFIG CHECK FAILURE']);
  assert.ok(!log.lines.join('\n').includes(SECRET));
});

test('no SSM flag keeps the existing startup path', async () => {
  let starts = 0;
  assert.equal(await main({ env: {}, startServer: () => { starts += 1; } }), true);
  assert.equal(starts, 1);
});

test('direct server.js startup with SSM flag fails before dotenv or HTTP startup', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, NODE_ENV: 'production', SKILLOMATE_CONFIG_SOURCE: 'ssm' },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BootstrapRequired/);
  assert.ok(!result.stderr.includes(SECRET));
});
