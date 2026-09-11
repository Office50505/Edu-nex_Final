// Live developer evaluation. Uses fixture identity/subscription in an isolated route harness;
// never logs in as a learner or writes to the database. Makes four billable provider calls.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
if (!process.env.FAL_API_KEY && !process.env.FAL_KEY) throw new Error('Set FAL_API_KEY or FAL_KEY before running live evaluations.');
const routes = {};
const course = { _id: '6a9e67c46bcb631b8118d341', title: 'AI Influencer Course', slug: 'ai-influencer', description: 'Create AI characters and consistent videos, write prompts, and troubleshoot voice and realism.', videos: [] };
const query = { select() { return this; }, populate() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => [course] };
const sandbox = {
  require(name) {
    if (name.includes('aiTutorService')) return serviceModule.exports;
    if (name === 'express') return { Router: () => ({ get() {}, post(url, auth, handler) { routes[url] = handler; } }) };
    if (name.includes('tutorKnowledge')) return require('../services/tutorKnowledge');
    if (name.includes('Subscription')) return { findOne: () => ({ lean: async () => ({ status: 'active', currentPeriodEnd: new Date(Date.now() + 60000) }) }) };
    if (name.includes('Course')) return { find: () => query };
    return { requireCompatibleAuth: () => () => {} };
  },
  module: { exports: {} }, process, console, fetch, AbortSignal,
};
const serviceModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../services/aiTutorService.js"), "utf8"), { ...sandbox, module: serviceModule });
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../routes/ai.js"), "utf8"), sandbox);
async function chat(message, history = []) {
  let result;
  await routes['/chat']({ body: { message, history }, compatUser: { _id: 'evaluation-fixture' } }, { json(data) { result = data; }, status() { return this; } });
  assert.equal(result.provider, 'fal-openrouter', 'Evaluation must exercise the model, not fallback');
  return result;
}
(async () => {
  const question = 'My AI character face changes in every clip. How can I keep the same face? Cite the lesson material.';
  const first = await chat(question);
  assert.ok(first.sources.some(source => source.kind === 'course-material'), 'Troubleshooting must cite retrieved course material');
  assert.match(first.reply, /reference|still|image.to.video|same face/i);
  assert.doesNotMatch(first.reply, /\b(aapke|aapko|karein|karna|hamesha|chahiye)\b/i, 'English questions should receive English explanations');
  console.log('PASS grounded troubleshooting:', first.reply);
  if (process.argv.includes('--grounding-only')) return;
  const history = [{ role: 'user', content: question }, { role: 'assistant', content: first.reply }];
  const second = await chat('Isko simple Hinglish mein samjhao', history);
  assert.match(second.reply, /face|chehra|reference|still/i);
  assert.doesNotMatch(second.reply, /[\u0900-\u097f]/, 'Roman Hinglish should not contain Devanagari');
  console.log('PASS follow-up and Roman script:', second.reply);
  const quiz = await chat('Give me a three-question practice quiz on that. Do not show the answers yet.', [...history, { role: 'user', content: 'Isko simple Hinglish mein samjhao' }, { role: 'assistant', content: second.reply }]);
  console.log('Quiz (review question count and withheld solutions):', quiz.reply);
  const refusal = await chat('Who will win the next cricket world cup?');
  assert.match(refusal.reply, /do not know|course|curriculum|help.*learn|outside/i);
  console.log('PASS unrelated question:', refusal.reply);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
