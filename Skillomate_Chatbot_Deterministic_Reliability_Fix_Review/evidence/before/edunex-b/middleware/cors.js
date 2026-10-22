const DEFAULT_ALLOWED_ORIGINS = [
  'https://skillomate.in',
  'https://www.skillomate.in',
];

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

function configuredOrigins(env = process.env) {
  return [env.FRONTEND_ORIGIN, env.FRONTEND_ORIGINS]
    .filter(Boolean)
    .join(',')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
}

function buildAllowedOrigins(env = process.env) {
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...configuredOrigins(env),
  ]);
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

const ALLOWED_HEADERS = [
  'Origin',
  'X-Requested-With',
  'Content-Type',
  'Accept',
  'Authorization',
];

const ALLOWED_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
];

function appendVaryOrigin(res) {
  const current = String(res.getHeader('Vary') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!current.some((value) => value.toLowerCase() === 'origin')) current.push('Origin');
  res.setHeader('Vary', current.join(', '));
}

function skillomateCors(req, res, next) {
  const requestOrigin = String(req.headers.origin || '').trim();

  if (requestOrigin) appendVaryOrigin(res);

  if (ALLOWED_ORIGINS.has(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  }

  res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS.join(','));

  if (String(req.method || '').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  return next();
}

module.exports = {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  ALLOWED_ORIGINS,
  buildAllowedOrigins,
  configuredOrigins,
  normalizeOrigin,
  skillomateCors,
};
