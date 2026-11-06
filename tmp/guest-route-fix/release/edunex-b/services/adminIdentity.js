const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Account = require('../models/AdminAccount');
const audience = 'skillomate-admin';
const roles = ['admin', 'developer', 'viewer'];
const secret = () => process.env.ADMIN_TOKEN_SECRET || (process.env.NODE_ENV !== 'production' ? 'edunex-development-admin-secret' : '');
const bootstrapPassword = () => process.env.ADMIN_PASSWORD || (process.env.NODE_ENV !== 'production' ? 'Sdbc@123' : '');
const fingerprint = () => crypto.createHmac('sha256', secret()).update(bootstrapPassword()).digest('hex');
const fail = (message, statusCode = 401) => Object.assign(new Error(message), { statusCode });
function safeEqual(a, b) {
  const left = Buffer.from(String(a || '')), right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function publicAccount(account) {
  return { id: String(account._id), username: account.username, name: account.name, role: account.role, isActive: account.isActive };
}
async function login(username, password) {
  if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) throw fail('Invalid username or password.');
  const loginId = String(username || '').trim().toLowerCase();
  let admin, claims;
  if (loginId === 'owner' || !loginId) {
    if (!bootstrapPassword() || !safeEqual(password, bootstrapPassword())) throw fail('Invalid username or password.');
    admin = { id: 'bootstrap', username: 'owner', name: 'Workspace owner', role: 'admin', isActive: true };
    claims = { sub: 'bootstrap', credentialVersion: fingerprint() };
  } else {
    const account = await Account.findOne({ username: loginId }).select('+passwordHash +sessionVersion');
    if (!account?.isActive || !await bcrypt.compare(password, account.passwordHash)) throw fail('Invalid username or password.');
    admin = publicAccount(account);
    claims = { sub: admin.id, sessionVersion: account.sessionVersion };
  }
  const token = jwt.sign({ ...claims, role: admin.role }, secret(), { audience, expiresIn: '8h' });
  return { token, adminToken: token, admin };
}
async function authenticate(token) {
  let decoded;
  try { decoded = jwt.verify(token, secret(), { audience, algorithms: ['HS256'] }); }
  catch { throw fail('Session expired. Please sign in again.'); }
  if (decoded.sub === 'bootstrap') {
    if (!bootstrapPassword() || !safeEqual(decoded.credentialVersion, fingerprint())) throw fail('Session expired. Please sign in again.');
    return { id: 'bootstrap', sub: 'bootstrap', username: 'owner', name: 'Workspace owner', role: 'admin' };
  }
  if (!/^[a-f0-9]{24}$/i.test(decoded.sub || '')) throw fail('Invalid account session.');
  const account = await Account.findById(decoded.sub).select('+sessionVersion');
  if (!account?.isActive || !roles.includes(account.role) || decoded.sessionVersion !== account.sessionVersion) throw fail('Session expired. Please sign in again.');
  return { ...publicAccount(account), sub: String(account._id) };
}
module.exports = { login, authenticate, roles, publicAccount };
