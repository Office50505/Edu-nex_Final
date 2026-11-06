const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const express = require('express');
const mongoose = require('mongoose');
const id = '507f1f77bcf86cd799439011';
function fixture() {
  let account = { _id: id, username: 'staff', name: 'Staff', role: 'viewer', isActive: true, sessionVersion: 0, passwordHash: bcrypt.hashSync('long-test-password', 4) };
  let writes = 0;
  const Account = {
    findOne: () => ({ select: async () => account }),
    findById: () => ({ select: async () => account }),
    find: () => ({ sort: () => ({ lean: async () => account ? [account] : [] }) }),
    createIndexes: async () => {},
    create: async data => { writes++; return { _id: id, isActive: true, ...data }; },
    findByIdAndUpdate: async (_id, update) => { writes++; Object.assign(account, update.$set); account.sessionVersion += update.$inc.sessionVersion; return account; },
  };
  const env = { ADMIN_TOKEN_SECRET: 'rbac-test-secret', ADMIN_PASSWORD: 'owner-test-password', NODE_ENV: 'test' };
  function load(file, deps) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve(file), 'utf8'), { module, exports: module.exports, Buffer, process: { env }, require: name => { if (name in deps) return deps[name]; throw Error('Unexpected dependency '+name); } });
    return module.exports;
  }
  const identity = load('../services/adminIdentity', { 'node:crypto': crypto, jsonwebtoken: jwt, bcryptjs: bcrypt, '../models/AdminAccount': Account });
  const guards = load('../middleware/adminAuth', { '../services/adminIdentity': identity });
  const router = load('../routes/adminAccounts', { express, bcryptjs: bcrypt, mongoose, '../models/AdminAccount': Account, '../services/adminIdentity': identity, '../middleware/adminAuth': guards });
  return { identity, guards, router, env, account, writes: () => writes, remove: () => { account = null; }, token(role = account.role) { return jwt.sign({ sub: id, role, sessionVersion: account.sessionVersion }, env.ADMIN_TOKEN_SECRET, { audience: 'skillomate-admin' }); } };
}
function invoke(guard, token, method = 'GET') {
  return new Promise(resolve => {
    const req = { headers: { authorization: `Bearer ${token}` }, method };
    const res = { code: 200, set() { return this; }, status(code) { this.code = code; return this; }, json(body) { resolve({ code: this.code, body }); } };
    guard(req, res, () => resolve({ code: 200, admin: req.admin }));
  });
}
function request(router, token, method, url, body = {}) {
  return new Promise((resolve, reject) => {
    const req = { headers: { authorization: `Bearer ${token}` }, method, url, body };
    const res = { code: 200, set() { return this; }, status(code) { this.code = code; return this; }, json(body) { resolve({ code: this.code, body }); } };
    router.handle(req, res, error => error ? reject(error) : resolve({ code: 404 }));
  });
}
for (const role of ['admin', 'developer', 'viewer']) {
  for (const method of ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE']) {
    test(`${role}: ${method} enforces workspace permissions`, async () => {
      const f = fixture(); f.account.role = role;
      assert.equal((await invoke(f.guards.protectAdmin, f.token(), method)).code, role === 'viewer' && !['GET', 'HEAD'].includes(method) ? 403 : 200);
    });
  }
  for (const method of ['GET', 'POST', 'PATCH']) {
    test(`${role}: team ${method} is restricted to admins`, async () => {
      const f = fixture(); f.account.role = role;
      const result = await request(f.router, f.token(), method, method === 'PATCH' ? '/team/'+id : '/team', { username: 'newuser', name: 'New', password: 'a-valid-long-password', role: 'viewer' });
      assert.equal(result.code, role === 'admin' ? method === 'PATCH' ? 400 : method === 'POST' ? 201 : 200 : 403);
      if (role !== 'admin') { assert.equal(f.writes(), 0); assert.equal(result.body.accounts, undefined); }
      if (method === 'GET' && role === 'admin') assert.equal(result.body.accounts[0].passwordHash, undefined);
    });
  }
}
test('viewer can request read-only previews', async () => {
  const f = fixture(); assert.equal((await invoke(f.guards.protectAdminRead, f.token(), 'POST')).code, 200);
});
test('database roles override token claims, and account changes invalidate existing sessions', async () => {
  const f = fixture(); const token = f.token('admin');
  assert.equal((await invoke(f.guards.protectAdmin, token, 'DELETE')).code, 403);
  f.account.sessionVersion++;
  assert.equal((await invoke(f.guards.protectAdmin, token)).code, 401);
});
test('disabled, removed, forged and legacy sessions cannot enter the workspace', async () => {
  const f = fixture(); const token = f.token();
  f.account.isActive = false; assert.equal((await invoke(f.guards.protectAdmin, token)).code, 401);
  f.remove(); assert.equal((await invoke(f.guards.protectAdmin, token)).code, 401);
  assert.equal((await invoke(f.guards.protectAdmin, token+'x')).code, 401);
  const legacy = jwt.sign({ role: 'admin' }, f.env.ADMIN_TOKEN_SECRET);
  assert.equal((await invoke(f.guards.protectAdmin, legacy)).code, 401);
});
test('staff login verifies the hash; client-supplied role cannot grant authority', async () => {
  const f = fixture();
  await assert.rejects(f.identity.login('staff', 'wrong-password'), { statusCode: 401 });
  const result = await f.identity.login('staff', 'long-test-password');
  assert.equal(result.admin.role, 'viewer');
  assert.equal(result.admin.passwordHash, undefined);
  assert.equal((await f.identity.authenticate(result.token)).role, 'viewer');
});
test('owner login preserves access and password rotation invalidates its session', async () => {
  const f = fixture(); const result = await f.identity.login('owner', f.env.ADMIN_PASSWORD);
  assert.equal((await f.identity.authenticate(result.token)).role, 'admin');
  f.env.ADMIN_PASSWORD = 'rotated-owner-password';
  await assert.rejects(f.identity.authenticate(result.token), { statusCode: 401 });
});
test('admin changes to another account revoke existing sessions and persist hashed passwords', async () => {
  const f = fixture(); const token = f.token(); const owner = await f.identity.login('owner', f.env.ADMIN_PASSWORD);
  const result = await request(f.router, owner.token, 'PATCH', '/team/'+id, { role: 'developer', password: 'changed-long-password' });
  assert.equal(result.code, 200); assert.equal(result.body.account.role, 'developer');
  assert.equal(result.body.account.passwordHash, undefined);
  assert.equal(await bcrypt.compare('changed-long-password', f.account.passwordHash), true);
  assert.equal((await invoke(f.guards.protectAdmin, token)).code, 401);
});
