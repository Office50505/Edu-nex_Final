const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Account = require('../models/AdminAccount');
const { roles, publicAccount } = require('../services/adminIdentity');
const { protectAdmin, protectAdminRoles } = require('../middleware/adminAuth');
const router = express.Router();
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const run = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    res.status(error.code === 11000 ? 409 : error.statusCode || 500).json({ error: error.code === 11000 ? 'This username is already in use.' : error.statusCode ? error.message : 'Could not update the workspace account.' });
  }
};
function password(value) {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value) > 72) throw fail('Use a password with at least 12 characters and at most 72 bytes.');
  return value;
}
router.get('/me', protectAdmin, (req, res) => res.json({ admin: req.admin }));
router.use('/team', protectAdminRoles);
router.get('/team', run(async (_req, res) => {
  const accounts = await Account.find().sort({ createdAt: -1 }).lean();
  res.json({ accounts: accounts.map(publicAccount) });
}));
router.post('/team', run(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  if (!/^[a-z0-9][a-z0-9._@-]{2,79}$/.test(username) || username === 'owner') throw fail('Choose a unique username of 3–80 letters, digits, dots, @, hyphens or underscores. Owner is reserved.');
  if (!name || name.length > 100 || !roles.includes(req.body.role)) throw fail('Enter a name and a valid role.');
  const passwordHash = await bcrypt.hash(password(req.body.password), 12);
  await Account.createIndexes();
  const account = await Account.create({ username, name, role: req.body.role, passwordHash });
  res.status(201).json({ account: publicAccount(account) });
}));
router.patch('/team/:id', run(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw fail('Invalid account id.');
  const updates = {};
  if (Object.hasOwn(req.body, 'role')) {
    if (!roles.includes(req.body.role)) throw fail('Choose Admin, Developer or Viewer.');
    if (req.params.id === req.admin.id && req.body.role !== 'admin') throw fail('Use another admin account to change your own role.');
    updates.role = req.body.role;
  }
  if (Object.hasOwn(req.body, 'isActive')) {
    if (typeof req.body.isActive !== 'boolean') throw fail('Invalid account status.');
    if (req.params.id === req.admin.id && !req.body.isActive) throw fail('You cannot disable your own account.');
    updates.isActive = req.body.isActive;
  }
  if (Object.hasOwn(req.body, 'password')) updates.passwordHash = await bcrypt.hash(password(req.body.password), 12);
  if (!Object.keys(updates).length) throw fail('No supported account changes supplied.');
  const account = await Account.findByIdAndUpdate(req.params.id, { $set: updates, $inc: { sessionVersion: 1 } }, { new: true, runValidators: true });
  if (!account) throw fail('Account not found.', 404);
  res.json({ account: publicAccount(account) });
}));
module.exports = router;
