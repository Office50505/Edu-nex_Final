const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');

for (const root of [path.resolve(__dirname, '..'), path.resolve(__dirname, '../../appcopyai/backend')]) {
  function setup() {
    const user = { _id: '507f1f77bcf86cd799439011', activeSessionId: 'old', activeSessions: ['old'], isActive: true };
    const sessions = new Map([['old', { sessionId: 'old', loggedOutAt: null }]]);
    const query = value => ({ select: () => ({ lean: async () => value, then: resolve => Promise.resolve(value).then(resolve) }) });
    const User = {
      findById: () => query({ ...user }), findOne: () => query({ ...user }),
      findByIdAndUpdate: async (_, update) => { Object.assign(user, update.$set); },
      updateOne: async (filter, update) => {
        if (filter.activeSessionId !== user.activeSessionId) return;
        Object.assign(user, update.$set);
        user.activeSessions = user.activeSessions.filter(s => s !== update.$pull.activeSessions);
      },
    };
    const Session = {
      findOne: ({ sessionId }) => query(sessions.get(sessionId)),
      findOneAndUpdate: async ({ sessionId }, update) => { sessions.set(sessionId, { sessionId, ...update.$set }); },
      updateMany: async (filter, update) => {
        for (const [sid, record] of sessions) if (sid !== filter.sessionId.$ne) Object.assign(record, update.$set);
      },
      updateOne: async ({ sessionId }, update) => { Object.assign(sessions.get(sessionId), update.$set); },
    };
    const routes = new Map();
    const router = Object.fromEntries(['get', 'post', 'patch', 'delete'].map(method => [method, (url, ...handlers) => routes.set(`${method} ${url}`, handlers.at(-1))]));
    function load(file) {
      const context = { module: { exports: {} }, process: { env: { DISABLE_AUTH_RATE_LIMIT: 'true' } }, console, require(name) {
        if (name === 'express') return { Router: () => router };
        if (name === 'jsonwebtoken') return jwt;
        if (name === 'crypto') return crypto;
        if (name === 'bcryptjs') return { compare: async value => value === 'valid' };
        if (name === 'mongoose') return { Types: { ObjectId: { isValid: () => true } } };
        if (name.endsWith('/User')) return User;
        if (name.endsWith('/Session')) return Session;
        if (name.endsWith('/auth')) return { protect: () => {} };
        if (name.endsWith('/compatAuth')) return { requireCompatibleAuth: () => () => {} };
        if (name.endsWith('/otpService')) return { normalizeMobileNumber: () => '' };
        if (name.endsWith('/accountDeletionService')) return {};
        if (name.endsWith('/rateLimitToggle')) return { isAuthRateLimitDisabled: () => true };
        if (name.endsWith('/sensitiveRateLimit')) return { sensitiveRateLimit: () => (_req, _res, next) => next() };
        throw Error(name);
      } };
      vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
      return context.module.exports;
    }
    load('routes/auth.js');
    const protect = load('middleware/auth.js').protect;
    const compat = load('middleware/compatAuth.js');
    const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
    async function call(route, body, extra = {}) {
      const res = response();
      await routes.get(`post ${route}`)({ body, headers: {}, ip: '127.0.0.1', ...extra }, res);
      return res;
    }
    async function authorize(token) {
      const res = response(); let accepted = false;
      await protect({ headers: { authorization: `Bearer ${token}` } }, res, () => { accepted = true; });
      return accepted;
    }
    return { user, sessions, call, authorize, compat };
  }
  test(`${path.relative(process.cwd(), root)}: second login revokes access, legacy sessions and refresh`, async () => {
    const ctx = setup();
    const login = () => ctx.call('/login', { email: 'test@example.com', password: 'valid' });
    const first = await login(); assert.equal(first.code, 200);
    assert.equal(await ctx.authorize(first.body.accessToken), true);
    const rejected = await ctx.call('/login', { email: 'test@example.com', password: 'wrong' });
    assert.equal(rejected.code, 401); assert.equal(await ctx.authorize(first.body.accessToken), true);
    const second = await login(); assert.equal(second.code, 200);
    assert.equal(ctx.user.activeSessions.length, 1);
    assert.ok(ctx.sessions.get(first.body.sessionId).loggedOutAt);
    // Historical records and arrays must never restore a revoked login.
    ctx.sessions.get(first.body.sessionId).loggedOutAt = null;
    ctx.user.activeSessions.push(first.body.sessionId);
    assert.equal(await ctx.authorize(first.body.accessToken), false);
    assert.equal(await ctx.authorize(second.body.accessToken), true);
    assert.equal(await ctx.compat.isSessionValidForUser(ctx.user, first.body.sessionId), false);
    const legacyReq = sid => ({ headers: {}, query: { userId: ctx.user._id, sessionId: sid } });
    await assert.rejects(ctx.compat.authenticateCompatible(legacyReq(first.body.sessionId)), /Invalid session/);
    assert.equal((await ctx.compat.authenticateCompatible(legacyReq(second.body.sessionId))).sessionId, second.body.sessionId);
    assert.equal((await ctx.call('/refresh', { refreshToken: first.body.refreshToken })).code, 401);
    assert.equal((await ctx.call('/refresh', { refreshToken: second.body.refreshToken })).code, 200);
    const missingSession = jwt.sign({ userId: ctx.user._id }, 'edunex-development-access-secret');
    await assert.rejects(ctx.compat.authenticateCompatible({ headers: { authorization: `Bearer ${missingSession}` } }), /Session expired/);
    const oldRefresh = jwt.sign({ userId: ctx.user._id }, 'edunex-development-refresh-secret');
    assert.equal((await ctx.call('/refresh', { refreshToken: oldRefresh })).code, 401);
    // A logout that passed auth just before a new login must not log out that new login.
    await ctx.call('/logout', {}, { authSessionId: first.body.sessionId, user: { ...ctx.user, activeSessionId: first.body.sessionId } });
    assert.equal(await ctx.authorize(second.body.accessToken), true);
    await ctx.call('/logout', {}, { authSessionId: second.body.sessionId, user: { ...ctx.user } });
    assert.equal(await ctx.authorize(second.body.accessToken), false);
  });
  test(`${path.relative(process.cwd(), root)}: concurrent logins leave exactly one usable session`, async () => {
    const ctx = setup();
    const results = await Promise.all(Array.from({ length: 4 }, () => ctx.call('/login', { email: 'test@example.com', password: 'valid' })));
    results.forEach(result => assert.equal(result.code, 200));
    const accepted = await Promise.all(results.map(result => ctx.authorize(result.body.accessToken)));
    assert.equal(accepted.filter(Boolean).length, 1);
  });
}
