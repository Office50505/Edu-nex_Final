// Live platform-knowledge evaluation for Nex AI.
// Uses fixture identity/subscription in an isolated route harness. No learner login
// and no database writes. Non-deterministic model answers are checked with broad
// must-contain / must-not-contain assertions.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

if (!process.env.FAL_API_KEY && !process.env.FAL_KEY) {
  throw new Error('Set FAL_API_KEY or FAL_KEY before running live platform AI evaluation.');
}

const routes = {};
const course = {
  _id: '6abe5bb2bced21d7211be185',
  title: 'AI Filmmaking Course',
  slug: 'ai-filmmaking-course',
  description: 'Create AI short films with story, shots, voice, and editing.',
  videos: [
    { _id: 'intro-video', title: 'What Is AI Filmmaking?', description: 'Understand AI filmmaking and the course workflow.' },
    { _id: 'tools-video', title: 'Tools Setup', description: 'Set up Google Flow, ChatGPT, ElevenLabs, and CapCut.' },
  ],
};
const query = {
  select() { return this; },
  populate() { return this; },
  sort() { return this; },
  limit() { return this; },
  lean: async () => [course],
};

const serviceModule = { exports: {} };
const sandbox = {
  require(name) {
    if (name === 'node:crypto') return require('node:crypto');
    if (name === 'mongoose') return { Types: { ObjectId: { isValid: () => false } } };
    if (name.includes('aiTutorService')) return serviceModule.exports;
    if (name === 'express') return { Router: () => ({ get() {}, put() {}, delete() {}, post(url, ...handlers) { routes[url] = handlers.at(-1); } }) };
    if (name.includes('compatAuth')) return { requireCompatibleAuth: () => (_req, _res, next) => next() };
    if (name.includes('aiCompliance')) return require('../services/aiCompliance');
    if (name.includes('tutorKnowledge')) return require('../services/tutorKnowledge');
    if (name.endsWith('/subscriptionAccess')) return require('../services/subscriptionAccess');
    if (name.endsWith('/AppleSubscription')) return { findOne: () => ({ lean: async () => null }) };
    if (name.endsWith('/GooglePlaySubscription')) return { findOne: () => ({ lean: async () => null }) };
    if (name.endsWith('/Subscription')) return { findOne: () => ({ lean: async () => ({ status: 'active', currentPeriodEnd: new Date(Date.now() + 86400000) }) }) };
    if (name.endsWith('/Order')) return { findOne: () => ({ select() { return this; }, sort() { return this; }, lean: async () => null }) };
    if (name.includes('AiTutorSession')) return { findOne: () => ({ select: () => ({ lean: async () => null }) }), findOneAndUpdate: async () => ({}) };
    if (name.includes('AiResponseReport')) return { create: async () => ({}) };
    if (name.includes('Course')) return { find: () => query };
    return {};
  },
  module: { exports: {} },
  process,
  console,
  fetch,
  AbortSignal,
};

vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/aiTutorService.js'), 'utf8'), { ...sandbox, module: serviceModule });
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/ai.js'), 'utf8'), sandbox);

async function chat(message, history = []) {
  let result;
  let statusCode = 200;
  await routes['/chat']({
    body: { message, history, assistantName: 'Nex AI' },
    compatUser: { _id: 'platform-evaluation-fixture', fullName: 'Evaluation Learner' },
    compatAuth: { userId: 'platform-evaluation-fixture' },
    ip: '127.0.0.1',
  }, {
    json(data) { result = data; return data; },
    status(code) { statusCode = code; return this; },
  });
  assert.equal(statusCode, 200, message);
  assert.ok(result?.reply, `Missing reply for: ${message}`);
  return result;
}

const cases = [
  {
    id: 'price_all_courses',
    message: '499 me all course access milta hai kya?',
    must: [/₹499/, /30 days/i, /all Skillomate courses/i, /one-time|one time/i],
    mustNot: [/specific course prices.*nahi/i, /check.*website/i],
  },
  {
    id: 'login_profile',
    message: 'How do I create account and setup profile on Skillomate?',
    must: [/mobile|phone/i, /OTP/i, /profile/i, /avatar|email|age|gender/i],
  },
  {
    id: 'payment_not_active',
    message: 'I paid but course access is not active. What should I do?',
    must: [/refresh|log in|same mobile|support|payment/i],
    mustNot: [/your payment is successful/i, /I can see/i],
  },
  {
    id: 'refund',
    message: 'Refund kab mil sakta hai?',
    must: [/duplicate|access.*not delivered|payment|support/i],
    mustNot: [/guaranteed refund/i],
  },
  {
    id: 'certificate',
    message: 'What is Skillomate certificate and is it professional accreditation?',
    must: [/course-completion|completion/i, /not.*professional accreditation|not.*accreditation/i],
  },
  {
    id: 'support',
    message: 'Skillomate support email and timing batao',
    must: [/support@skillomate\.in/i, /Monday-Friday/i, /10:00 AM.*6:00 PM/i, /5 business days/i],
  },
  {
    id: 'out_of_scope',
    message: 'Who will win the next cricket world cup?',
    must: [/Skillomate courses|platform navigation|subscriptions|payments|learning support|curriculum/i],
    mustNot: [/India will win|Australia will win|prediction/i],
  },
];

(async () => {
  let passed = 0;
  for (const testCase of cases) {
    const result = await chat(testCase.message);
    for (const pattern of testCase.must || []) assert.match(result.reply, pattern, `${testCase.id} missing ${pattern}\n${result.reply}`);
    for (const pattern of testCase.mustNot || []) assert.doesNotMatch(result.reply, pattern, `${testCase.id} should not contain ${pattern}\n${result.reply}`);
    passed += 1;
    console.log(`PASS ${testCase.id} [${result.provider}]: ${result.reply.replace(/\s+/g, ' ').slice(0, 260)}`);
  }
  console.log(`\nPlatform AI evaluation passed ${passed}/${cases.length}.`);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
