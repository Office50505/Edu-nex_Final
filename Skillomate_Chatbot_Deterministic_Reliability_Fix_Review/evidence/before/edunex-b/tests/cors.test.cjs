const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ALLOWED_HEADERS,
  ALLOWED_METHODS,
  buildAllowedOrigins,
  skillomateCors,
} = require('../middleware/cors');

function runCors({ method = 'GET', origin } = {}) {
  const headers = new Map();
  let ended = false;
  let nextCalled = false;
  const req = { method, headers: origin ? { origin } : {} };
  const res = {
    statusCode: 200,
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    end() {
      ended = true;
    },
  };

  skillomateCors(req, res, () => {
    nextCalled = true;
  });

  return { ended, headers, nextCalled, statusCode: res.statusCode };
}

for (const origin of ['https://skillomate.in', 'https://www.skillomate.in']) {
  test(`allows production GET origin ${origin}`, () => {
    const result = runCors({ origin });

    assert.equal(result.nextCalled, true);
    assert.equal(result.ended, false);
    assert.equal(result.headers.get('access-control-allow-origin'), origin);
    assert.equal(result.headers.get('access-control-allow-headers'), ALLOWED_HEADERS.join(', '));
    assert.equal(result.headers.get('access-control-allow-methods'), ALLOWED_METHODS.join(','));
    assert.equal(result.headers.get('vary'), 'Origin');
  });

  test(`allows production OPTIONS preflight origin ${origin}`, () => {
    const result = runCors({ method: 'OPTIONS', origin });

    assert.equal(result.statusCode, 204);
    assert.equal(result.ended, true);
    assert.equal(result.nextCalled, false);
    assert.equal(result.headers.get('access-control-allow-origin'), origin);
    assert.equal(result.headers.get('access-control-allow-headers'), ALLOWED_HEADERS.join(', '));
    assert.equal(result.headers.get('access-control-allow-methods'), ALLOWED_METHODS.join(','));
  });
}

test('does not emit a wildcard or reflect an untrusted origin', () => {
  const result = runCors({ origin: 'https://attacker.example' });

  assert.equal(result.nextCalled, true);
  assert.equal(result.headers.has('access-control-allow-origin'), false);
  assert.notEqual(result.headers.get('access-control-allow-origin'), '*');
  assert.equal(result.headers.get('vary'), 'Origin');
});


test('includes configured admin origins from environment allowlist', () => {
  const origins = buildAllowedOrigins({
    FRONTEND_ORIGIN: 'https://edunexadmin.vercel.app',
    FRONTEND_ORIGINS: 'https://admin.skillomate.in, https://preview-admin.vercel.app/',
  });

  assert.equal(origins.has('https://skillomate.in'), true);
  assert.equal(origins.has('https://edunexadmin.vercel.app'), true);
  assert.equal(origins.has('https://admin.skillomate.in'), true);
  assert.equal(origins.has('https://preview-admin.vercel.app'), true);
});
