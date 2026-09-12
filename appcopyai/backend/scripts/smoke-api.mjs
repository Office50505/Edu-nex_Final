#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import dotenv from 'dotenv';

const initialNodeEnv = process.env.NODE_ENV;

if (process.env.SMOKE_ENV_PATH) {
  dotenv.config({ path: process.env.SMOKE_ENV_PATH, override: false, quiet: true });
} else {
  dotenv.config({ path: '.env', override: false, quiet: true });
  if (initialNodeEnv !== 'production') {
    dotenv.config({ path: '.env.local', override: true, quiet: true });
  }
  if (!process.env.MONGODB_URI) {
    dotenv.config({ path: '../../edunex-b/.env', override: true, quiet: true });
  }
}

const args = new Set(process.argv.slice(2));
const startServer = args.has('--start') || process.env.SMOKE_START_SERVER === 'true';
const allowDbUnavailable = args.has('--allow-db-unavailable') || process.env.SMOKE_REQUIRE_DB === 'false';
const requireDb = !allowDbUnavailable;
const port = Number(process.env.SMOKE_PORT || (startServer ? 3100 : process.env.PORT || 3000));
const baseUrl = stripTrailingSlash(
  process.env.SMOKE_API_BASE_URL || `http://127.0.0.1:${port}`
);
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || (requireDb ? 30000 : 10000));
const results = [];
let serverProcess = null;
let accessToken = '';
let userId = process.env.SMOKE_USER_ID || '';
let sessionId = process.env.SMOKE_SESSION_ID || '';

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || timeoutMs);
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      redirect: options.redirect || 'follow',
    });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');

    return {
      status: response.status,
      ok: response.ok,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function expectStatus(result, allowed, message) {
  if (!allowed.includes(result.status)) {
    throw new Error(`${message}. Expected ${allowed.join('/')} but got ${result.status}: ${formatBody(result.body)}`);
  }
}

function formatBody(body) {
  if (!body) return '';
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

async function check(name, fn, options = {}) {
  try {
    const detail = await fn();
    results.push({
      name,
      status: options.optional ? 'optional-pass' : 'pass',
      detail,
    });
  } catch (error) {
    results.push({
      name,
      status: options.optional ? 'skip' : 'fail',
      detail: error.message,
    });
  }
}

async function waitForHealth() {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const result = await request('/api/health', { timeoutMs: 1200 });
      if (result.status === 200) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(300);
  }

  throw new Error(`Server did not become healthy in ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ''}`);
}

async function waitForDbHealth() {
  const deadline = Date.now() + timeoutMs;
  let lastResult = null;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const result = await request('/api/health/db', { timeoutMs: 1200 });
      if (result.status === 200) return result;
      lastResult = result;
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }

  if (lastResult) return lastResult;
  throw new Error(`DB health check could not be reached in ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ''}`);
}

async function startLocalServer() {
  const childEnv = {
    ...process.env,
    PORT: String(port),
    SERVE_FRONTEND: process.env.SERVE_FRONTEND || 'false',
    DISABLE_BACKGROUND_JOBS: process.env.SMOKE_ENABLE_BACKGROUND_JOBS === 'true'
      ? process.env.DISABLE_BACKGROUND_JOBS || 'false'
      : 'true',
  };
  if (allowDbUnavailable && !childEnv.MONGODB_URI) {
    childEnv.MONGODB_URI = 'disabled';
  }

  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (chunk) => {
    process.stdout.write(`[server] ${chunk}`);
  });
  serverProcess.stderr.on('data', (chunk) => {
    process.stderr.write(`[server] ${chunk}`);
  });

  serverProcess.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      process.stderr.write(`[server] exited with code ${code}\n`);
    }
    if (signal) {
      process.stderr.write(`[server] exited with signal ${signal}\n`);
    }
  });

  await waitForHealth();
}

function stopLocalServer() {
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill('SIGTERM');
}

async function main() {
  console.log(`Skillomate smoke test target: ${baseUrl}`);
  console.log(`DB required: ${requireDb ? 'yes' : 'no'}`);

  if (startServer) {
    await startLocalServer();
  }

  await check('GET /api/health', async () => {
    const result = await request('/api/health');
    expectStatus(result, [200], 'Health check failed');
    if (result.body?.ok !== true) {
      throw new Error(`Health body did not return ok=true: ${formatBody(result.body)}`);
    }
    return 'API process is alive';
  });

  await check('GET /api/health/db', async () => {
    const result = requireDb ? await waitForDbHealth() : await request('/api/health/db');
    expectStatus(result, requireDb ? [200] : [200, 503], 'DB health check failed');
    return result.status === 200
      ? `Mongo connected to ${result.body?.database || 'database'}`
      : 'Mongo unavailable, allowed for this run';
  });

  await check('GET /api/bunny/videos blocks unauthenticated access', async () => {
    const result = await request('/api/bunny/videos');
    expectStatus(result, [401], 'Bunny video library should require admin auth');
    return 'Admin-only Bunny route rejected anonymous request';
  });

  await check('POST /api/admin/login rejects bad password', async () => {
    const result = await request('/api/admin/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: { username: '__wrong_smoke_admin__', password: '__wrong_smoke_password__' },
    });
    expectStatus(result, [401], 'Bad admin login should fail');
    return 'Bad admin login rejected';
  });

  await check('GET /api/image-proxy blocks private target', async () => {
    const result = await request('/api/image-proxy?url=http%3A%2F%2F127.0.0.1%3A1%2Fimage.png');
    expectStatus(result, [400, 403], 'Private image proxy target should be blocked');
    return 'Private image proxy target rejected';
  });

  await check('GET /api/courses', async () => {
    const result = await request('/api/courses');
    expectStatus(result, [200], 'Courses endpoint failed');
    return Array.isArray(result.body)
      ? `${result.body.length} courses returned`
      : 'Courses response returned';
  }, { optional: !requireDb });

  await check('GET /api/categories', async () => {
    const result = await request('/api/categories');
    expectStatus(result, [200], 'Categories endpoint failed');
    return Array.isArray(result.body)
      ? `${result.body.length} categories returned`
      : 'Categories response returned';
  }, { optional: !requireDb });

  const loginId = process.env.SMOKE_LOGIN_ID || '';
  const password = process.env.SMOKE_PASSWORD || '';
  await check('POST /api/auth/login', async () => {
    if (!loginId || !password) {
      throw new Error('Set SMOKE_LOGIN_ID and SMOKE_PASSWORD to test auth');
    }

    const result = await request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: { loginId, password },
    });
    expectStatus(result, [200], 'Login failed');
    accessToken = result.body?.accessToken || result.body?.token || '';
    userId = String(result.body?.user?._id || result.body?.user?.id || result.body?._id || userId || '');
    sessionId = String(result.body?.sessionId || result.body?.user?.sessionId || sessionId || '');
    if (!accessToken || !userId) {
      throw new Error(`Login response missing token/user id: ${formatBody(result.body)}`);
    }
    return `Logged in user ${userId}`;
  }, { optional: !loginId || !password });

  await check('GET /api/auth/me', async () => {
    if (!accessToken) throw new Error('Login token unavailable');
    const result = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expectStatus(result, [200], 'Current user check failed');
    return 'Bearer JWT auth works';
  }, { optional: !accessToken });

  await check('GET /api/auth/sessions', async () => {
    if (!accessToken) throw new Error('Login token unavailable');
    const result = await request('/api/auth/sessions', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expectStatus(result, [200], 'Session listing failed');
    return Array.isArray(result.body?.sessions)
      ? `${result.body.sessions.length} active sessions returned`
      : 'Session response returned';
  }, { optional: !accessToken });

  await check('GET /api/auth/validate/:id', async () => {
    if (!userId) throw new Error('SMOKE_USER_ID or login result required');
    const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    const query = !accessToken && sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    const result = await request(`/api/auth/validate/${encodeURIComponent(userId)}${query}`, { headers });
    expectStatus(result, [200], 'Compatibility auth validation failed');
    return accessToken ? 'Compatibility route accepts JWT' : 'Compatibility route accepts sessionId';
  }, { optional: !userId || (!accessToken && !sessionId) });

  await check('GET /api/user/:id/subscription', async () => {
    if (!userId) throw new Error('SMOKE_USER_ID or login result required');
    const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    const query = !accessToken && sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    const result = await request(`/api/user/${encodeURIComponent(userId)}/subscription${query}`, { headers });
    expectStatus(result, [200], 'Compatibility subscription check failed');
    return `Status: ${result.body?.subscriptionStatus || 'unknown'}`;
  }, { optional: !userId || (!accessToken && !sessionId) });

  await check('GET /api/user/:id/progress', async () => {
    if (!userId) throw new Error('SMOKE_USER_ID or login result required');
    const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    const query = !accessToken && sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    const result = await request(`/api/user/${encodeURIComponent(userId)}/progress${query}`, { headers });
    expectStatus(result, [200], 'Compatibility progress check failed');
    return 'Progress response returned';
  }, { optional: !userId || (!accessToken && !sessionId) });

  await check('GET /api/payment/subscription-status', async () => {
    if (!accessToken) throw new Error('Login token unavailable');
    const result = await request('/api/payment/subscription-status', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expectStatus(result, [200], 'Current payment subscription status failed');
    return 'Current protected payment route works';
  }, { optional: !accessToken });

  const courseId = process.env.SMOKE_COURSE_ID || '';
  const lessonId = process.env.SMOKE_LESSON_ID || '';
  const videoId = process.env.SMOKE_VIDEO_ID || '';

  await check('GET /api/courses/:id/videos', async () => {
    if (!courseId || !accessToken) throw new Error('Set SMOKE_COURSE_ID and auth credentials');
    const result = await request(`/api/courses/${encodeURIComponent(courseId)}/videos`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expectStatus(result, [200, 403], 'Compatibility course videos check failed');
    return result.status === 403 ? 'Route is protected by subscription as expected' : 'Course videos returned';
  }, { optional: !courseId || !accessToken });

  await check('POST /api/user/progress/update-video', async () => {
    if (!userId || !courseId || !videoId || !accessToken) {
      throw new Error('Set auth credentials, SMOKE_COURSE_ID, and SMOKE_VIDEO_ID');
    }
    const result = await request('/api/user/progress/update-video', {
      method: 'POST',
      headers: jsonHeaders({ Authorization: `Bearer ${accessToken}` }),
      body: { userId, courseId, videoId, currentTime: 12, duration: 100 },
    });
    expectStatus(result, [200], 'Compatibility progress update failed');
    return 'Mobile progress update route works';
  }, { optional: !userId || !courseId || !videoId || !accessToken });

  await check('POST /api/progress', async () => {
    if (!courseId || !lessonId || !accessToken) {
      throw new Error('Set auth credentials, SMOKE_COURSE_ID, and SMOKE_LESSON_ID');
    }
    const result = await request('/api/progress', {
      method: 'POST',
      headers: jsonHeaders({ Authorization: `Bearer ${accessToken}` }),
      body: { course: courseId, lesson: lessonId, watchedSeconds: 12, completed: false },
    });
    expectStatus(result, [200], 'Current web progress route failed');
    return 'Web progress route works and sync bridge ran';
  }, { optional: !courseId || !lessonId || !accessToken });

  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || '';
  let adminToken = '';
  await check('POST /api/admin/login', async () => {
    if (!adminPassword) throw new Error('Set SMOKE_ADMIN_PASSWORD to test admin routes');
    const result = await request('/api/admin/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: { password: adminPassword },
    });
    expectStatus(result, [200], 'Admin login failed');
    adminToken = result.body?.adminToken || result.body?.token || '';
    if (!adminToken) throw new Error('Admin login response missing token');
    return 'Admin token received';
  }, { optional: !adminPassword });

  await check('GET /api/bunny/videos with admin auth', async () => {
    if (!adminToken) throw new Error('Admin token unavailable');
    const result = await request('/api/bunny/videos', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expectStatus(result, [200, 500], 'Admin Bunny route failed unexpectedly');
    return result.status === 500
      ? 'Admin auth passed, Bunny provider not configured'
      : 'Admin Bunny route returned library data';
  }, { optional: !adminToken });

  await check('GET /api/admin/course-progress', async () => {
    if (!adminToken) throw new Error('Admin token unavailable');
    const result = await request('/api/admin/course-progress', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expectStatus(result, [200], 'Admin compatibility progress route failed');
    return Array.isArray(result.body) ? `${result.body.length} progress rows` : 'Progress rows returned';
  }, { optional: !adminToken });

  const bunnyGuid = process.env.SMOKE_BUNNY_GUID || '';
  await check('GET /api/bunny/thumbnail/:guid', async () => {
    if (!bunnyGuid) throw new Error('Set SMOKE_BUNNY_GUID to test Bunny thumbnail');
    const result = await request(`/api/bunny/thumbnail/${encodeURIComponent(bunnyGuid)}`, {
      redirect: 'manual',
    });
    expectStatus(result, [302, 307, 404], 'Bunny thumbnail route failed');
    return result.status === 404 ? 'Route reachable, thumbnail not found' : 'Thumbnail redirect returned';
  }, { optional: !bunnyGuid });

  console.log('\nSmoke results:');
  for (const result of results) {
    const label = result.status === 'pass'
      ? 'PASS'
      : result.status === 'optional-pass'
        ? 'PASS optional'
        : result.status === 'skip'
          ? 'SKIP'
          : 'FAIL';
    console.log(`${label} ${result.name} - ${result.detail}`);
  }

  const failures = results.filter((result) => result.status === 'fail');
  if (failures.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`Smoke runner failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    stopLocalServer();
  });
