const test = require('node:test');
const assert = require('node:assert/strict');
const { backend } = require('./ai-tutor-fixture.cjs');
const K = require('../services/tutorKnowledge');
const { businessCreativeRequest, creativeReplyMismatch } = require('../services/businessCreativeRequest');
const saved = require('./fixtures/business-poster-live-mismatch.json');
const { course } = require('../scripts/eval/local-business-registration/real-metadata.json');
const user = { _id: '6e0000000000000000000051', purchasedCourses: [course._id] };
const pack = K.packFor(course);
const make = options => backend({ courses: [course], user, reply: 'Use the real business photo and only the supplied name, location and products.', ...options });

test('saved incident: model copied a festival example embedded in the selected lesson overview', () => {
  assert.ok(saved.retrievedChunkIds.some(id => id.includes('lesson-overview:Offer and Festival Posters')));
  assert.ok(!saved.retrievedChunkIds.some(id => id.endsWith('exact-template:045')));
  assert.match(saved.providerPayload.messages[0].content, /Example prompt: Offer poster[\s\S]*Tyohaar greeting poster[\s\S]*Make a warm \[festival\] greeting/);
  assert.match(saved.response.answer, /Tyohaar greeting poster/);
  assert.equal(saved.response.provider, 'fal-openrouter');
  assert.equal(K.findPackTemplate(pack, saved.request.message, saved.request.history), null);
});

test('original native question now assembles general-poster constraints without the bundled template', async () => {
  const api = make();
  const r = await api.chat({ ...saved.request, debugAi: true });
  assert.equal(api.calls.length, 1); assert.equal(r.provider, 'fal-openrouter');
  assert.equal(r.debug.selected_exact_prompt_template_id, '');
  const system = api.calls[0].messages[0].content;
  assert.match(system, /"genres":\["general_business"\]/);
  assert.match(system, /Return the concise usable prompt or caption/);
  assert.match(system, /latest explicit corrections win/);
  assert.doesNotMatch(system, /Example prompt: Offer poster|Make a warm \[festival\] greeting|\[Happy Diwali\]|Galat example — AI khud offer/);
  assert.match(api.calls[0].messages.at(-1).content, /Response language for this answer: english/);
  assert.ok(r.debug.retrieved_course_ids.every(id => id === course._id));
});

test('replaying the exact saved bad answer permits one repair and then a task-specific limitation', async () => {
  const api = make({ reply: saved.response.answer });
  const r = await api.chat({ ...saved.request });
  assert.equal(api.calls.length, 2); assert.equal(r.provider, 'course-response-policy');
  assert.equal(r.outcome.liveModelAnswer, false); assert.equal(r.outcome.responseIssue, 'course_business_task_preserving_correction');
  assert.doesNotMatch(r.answer, /Happy Diwali|Tyohaar greeting poster/);
  assert.match(r.answer, /requested prompt/);
});

for (const [message, expected] of [
  ['Write a regular Instagram poster prompt for Cedar Cycle Repairs in Nashik; no festival, discounts or invented prices.', 'general_business'],
  ['Meri pottery studio ka poster prompt do, koi discount nahi hai.', 'general_business'],
  ['साइकिल की दुकान के लिए पोस्टर बनाओ। कोई छूट नहीं है।', 'general_business'],
  ['Create a poster featuring our owner-approved product price of INR 250; do not invent an offer.', 'general_business'],
  ['Make an Eid greeting poster using my actual tailoring shop photo. No sale.', 'festival_greeting'],
  ['Holi ke liye greeting poster banao, koi discount nahi.', 'festival_greeting'],
  ['Create a discount poster for an approved 12% offer on repairs.', 'discount_promotion'],
  ['Approved sale ka Instagram poster banao. Festival theme mat add karna.', 'discount_promotion'],
  ['Create a menu advertisement listing idli and dosa, no discounts.', 'menu_advertisement'],
  ['Menu poster banao for my juice stall. Prices owner baad mein dega.', 'menu_advertisement'],
]) test(`creative purpose is explicit and negation-aware: ${message}`, async () => {
  const request = businessCreativeRequest(message);
  assert.ok(request); assert.deepEqual(request.genres, [expected]);
  const api = make(); const r = await api.chat({ activeCourseId: course._id, message, debugAi: true });
  assert.equal(api.calls.length, 1); assert.equal(r.debug.selected_exact_prompt_template_id, '');
  assert.ok(api.calls[0].messages[0].content.includes(`"genres":["${expected}"]`));
  assert.doesNotMatch(api.calls[0].messages[0].content, /Example prompt: Offer poster|\[Happy Diwali\]/);
});

test('promotion and festival can coexist only when both are requested', () => {
  assert.deepEqual(businessCreativeRequest('Write a Diwali greeting poster with the approved 10% discount.').genres, ['festival_greeting', 'discount_promotion']);
});

test('a requested greeting cannot invent a named occasion or substitute another festival', () => {
  assert.equal(creativeReplyMismatch('Happy Diwali from the shop!', businessCreativeRequest('Create a festival greeting poster.')), true);
  assert.equal(creativeReplyMismatch('Warm [festival] wishes from the shop.', businessCreativeRequest('Create a festival greeting poster.')), false);
  assert.equal(creativeReplyMismatch('Happy Diwali from the shop!', businessCreativeRequest('Create an Eid greeting poster.')), true);
  assert.equal(creativeReplyMismatch('Happy Diwali from the shop!', businessCreativeRequest('Create a Deepavali greeting poster.')), false);
});

test('a provided product list does not turn a general poster into a menu advertisement', () => {
  assert.deepEqual(businessCreativeRequest('My shop sells notebooks, pens and paper. Create a general Instagram poster.').genres, ['general_business']);
});

test('assistant festival framing cannot establish the next creative purpose', () => {
  const history = [{ role: 'user', content: 'Create a general business poster prompt.' }, { role: 'assistant', content: saved.response.answer }];
  assert.deepEqual(businessCreativeRequest('Now give a caption for the same shop.', history).genres, ['general_business']);
  assert.deepEqual(businessCreativeRequest('Give a short caption for that campaign.', [{ role: 'user', content: 'Create an Eid greeting poster.' }]).genres, ['festival_greeting']);
  assert.deepEqual(businessCreativeRequest('Write a general poster instead.', [{ role: 'user', content: 'Create an Eid greeting poster.' }]).genres, ['general_business']);
});

test('genre validation respects negative constraints and separates the actual deliverable from prose', () => {
  const general = businessCreativeRequest('Write a general business poster prompt.');
  for (const reply of ['Use the real photo. No festival, discounts or invented prices.', 'Do not add prices, offers or festivals.',
    'Do not invent any festive theme. Show only the supplied business details.', 'Do not use a festival greeting.\n```text\nCreate a clean general business poster.\n```']) {
    assert.equal(creativeReplyMismatch(reply, general), false, reply);
  }
  assert.equal(creativeReplyMismatch('Create a menu poster listing the dishes.', general), true);
  assert.equal(creativeReplyMismatch('Announce a limited sale!', general), true);
  assert.equal(creativeReplyMismatch('Make a warm Eid greeting.', general), true);
  assert.equal(creativeReplyMismatch('Make an Eid greeting; no offers.', businessCreativeRequest('Create an Eid poster.')), false);
});

test('generic Hinglish prompt requests and adaptations never become raw-copy template selections', () => {
  for (const message of ['Instagram poster prompt do for my repair business in Indore.', 'Modern menu poster prompt chahiye.',
    'Offer poster prompt bhejo for my shop.', 'I need an offer poster prompt for an owner-approved price.',
    'Create a festival greeting poster prompt using my original shop photo and exact business details.',
    'Adapt the approved Lesson 05 Offer poster prompt for a confirmed sale.']) assert.equal(K.findPackTemplate(pack, message), null, message);
  assert.ok(K.findPackTemplate(pack, 'Give the exact approved Lesson 05 Offer poster prompt unchanged.'));
});

test('same-conversation correction survives relevance filtering; failed assistant claims are not business facts', async () => {
  const first = 'My shop is Amber Loom in Vadodara. We sell cotton scarves and handmade bags. Create an Instagram poster prompt.';
  const firstAnswer = 'Create a clean poster using the actual photo of Amber Loom.';
  const api = make({ reply: firstAnswer, sessions: new Map() });
  const scope = { activeCourseId: course._id, conversationId: 'unseen-correction' };
  await api.chat({ ...scope, message: first });
  const message = 'Actually the shop is Amber Thread. Same location and products. Give a short Hinglish caption.';
  await api.chat({ ...scope, message, history: [{ role: 'user', content: first }, { role: 'assistant', content: firstAnswer }] });
  assert.equal(api.calls.length, 2);
  const second = api.calls[1].messages;
  assert.ok(second.some(m => m.role === 'user' && m.content === first));
  assert.ok(second.some(m => m.role === 'assistant' && m.content === firstAnswer));
  assert.match(second[0].content, /Amber Thread|Vadodara|cotton scarves/);
  assert.match(second[0].content, /"output":"caption","genres":\["general_business"\]/);
});

test('explanation requests retain course examples and exact source assets stay byte-for-byte unchanged', async () => {
  assert.equal(businessCreativeRequest('Explain the Lesson 05 poster prompt.'), null);
  const api = make(); const r = await api.chat({ activeCourseId: course._id, message: 'Give the exact approved Lesson 05 Tyohaar greeting poster prompt unchanged.' });
  const original = pack.records.find(record => record.heading === 'Lesson 05 — Tyohaar greeting poster');
  assert.equal(r.answer.match(/```text\n([\s\S]*?)\n```/)[1], original.content); assert.equal(api.calls.length, 0);
});
