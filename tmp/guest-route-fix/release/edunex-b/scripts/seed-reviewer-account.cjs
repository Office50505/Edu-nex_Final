#!/usr/bin/env node
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env'), quiet: true });

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { getMongoConnectionOptions } = require('../config/mongodb');

const User = require('../models/User');
const Subscription = require('../models/Subscription');

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const uri = requiredEnv('MONGODB_URI');
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) throw new Error('MONGODB_URI is invalid.');

  const mobileNumber = cleanPhone(requiredEnv('REVIEWER_MOBILE'));
  const password = requiredEnv('REVIEWER_PASSWORD');
  const fullName = String(process.env.REVIEWER_NAME || 'Skillomate Reviewer').trim();
  const email = String(process.env.REVIEWER_EMAIL || '').trim().toLowerCase() || null;
  const days = Number(process.env.REVIEWER_ACCESS_DAYS || 90);
  const accessDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 90;

  if (mobileNumber.length !== 10) throw new Error('REVIEWER_MOBILE must contain a 10 digit mobile number.');
  if (password.length < 8) throw new Error('REVIEWER_PASSWORD must be at least 8 characters.');

  await mongoose.connect(uri, getMongoConnectionOptions());

  const now = new Date();
  const expiry = new Date(now.getTime() + accessDays * 24 * 60 * 60 * 1000);
  const passwordHash = await bcrypt.hash(password, 12);
  const query = {
    $or: [
      { mobileNumber },
      ...(email ? [{ email }] : []),
    ],
  };

  let user = await User.findOne(query).select('+activeSessionId +activeSessions');
  if (!user) {
    user = await User.create({
      fullName,
      email,
      mobileNumber,
      passwordHash,
      isMobileVerified: true,
      isEmailVerified: Boolean(email),
      isActive: true,
      subscriptionStatus: 'active',
      subscriptionExpiry: expiry,
      avatar: 'a1',
      age: 18,
      gender: 'other',
      isTester: true,
      testerSince: now,
      testerAssignedBy: 'seed-reviewer-account',
      testerNotes: 'Stable reviewer/test learner account for App Store, Play Store, and device QA.',
      activeSessionId: null,
      activeSessions: [],
    });
  } else {
    user.fullName = fullName;
    user.email = email;
    user.mobileNumber = mobileNumber;
    user.passwordHash = passwordHash;
    user.isMobileVerified = true;
    user.isEmailVerified = Boolean(email);
    user.isActive = true;
    user.deletedAt = null;
    user.deletedBy = null;
    user.deletionReason = null;
    user.bannedAt = null;
    user.banReason = null;
    user.subscriptionStatus = 'active';
    user.subscriptionExpiry = expiry;
    user.avatar = user.avatar || 'a1';
    user.age = user.age && user.age >= 13 ? user.age : 18;
    user.gender = user.gender || 'other';
    user.isTester = true;
    user.testerSince = user.testerSince || now;
    user.testerAssignedBy = 'seed-reviewer-account';
    user.testerNotes = 'Stable reviewer/test learner account for App Store, Play Store, and device QA.';
    await user.save();
  }

  const subscription = await Subscription.findOneAndUpdate(
    { user: user._id },
    {
      $set: {
        gateway: 'admin',
        adminBillingSubscriptionId: `reviewer-${user._id}`,
        phonePeMerchantId: process.env.PHONEPE_MERCHANT_ID || 'reviewer-seed',
        status: 'active',
        subscriptionType: 'monthly',
        frequency: 'monthly',
        currentPeriodStart: now,
        currentPeriodEnd: expiry,
        nextBillingAt: expiry,
        cancelledAt: null,
        cancelReason: null,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { new: true, upsert: true }
  );

  if (String(user.subscriptionId || '') !== String(subscription._id)) {
    user.subscriptionId = subscription._id;
    await user.save();
  }

  console.log(JSON.stringify({
    ok: true,
    userId: String(user._id),
    fullName: user.fullName,
    mobileNumber: user.mobileNumber,
    email: user.email,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionExpiry: user.subscriptionExpiry,
    tester: user.isTester,
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
