require('./helpers/deny-network.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBusinessContract } = require('../services/businessRequestContract');
const { assessBusinessResponse } = require('../services/businessResponsePipeline');
const { backend } = require('./ai-tutor-fixture.cjs');
const { course } = require('../scripts/eval/local-business-registration/real-metadata.json');
const user = { _id: '6addcefc5d47d548973c29b9', purchasedCourses: [course._id] };
const contract = (message, extra = {}) => buildBusinessContract({ message, course, authorized: true, language: 'english', ...extra });
const published = text => text.replace(/\[[^\]]*\]/gu, '');

test('natural Hindi facts, corrections and output requests retain their provenance', () => {
  const first = 'मेरी दुकान का नाम नन्ही खुशी है। हम मग और फोटो फ्रेम बेचते हैं। मुझे एक कैप्शन लिख दो।';
  const c = contract('अब दुकान का नाम नन्ही खुशी से गिफ्ट नेस्ट कर दो। सामान वही रहेगा। एक पोस्टर का प्रॉम्प्ट बना दो। नकली रिव्यू मत जोड़ना।', {
    history: [{ role: 'user', content: first }], language: 'hindi',
  });
  assert.equal(c.task, 'creative_deliverable');
  assert.equal(c.format, 'prompt');
  assert.equal(c.facts.business_name?.value, 'गिफ्ट नेस्ट');
  assert.equal(c.facts.services?.value, 'मग और फोटो फ्रेम');
  assert.ok(c.constraints.some(s => s.text.includes('नकली रिव्यू')));
  assert.ok(!c.statements.some(s => s.text.includes('नकली रिव्यू')));
});

test('a Hindi budget question is a plan rather than a new poster request', () => {
  const c = contract('मेरी स्टेशनरी की दुकान है। कुल मार्केटिंग बजट ₹500 है। केवल तीन तस्वीरें हैं। पोस्टर, रील या विज्ञापन में क्या चुनूं? सात दिन की योजना बताओ।', { language: 'hindi' });
  assert.equal(c.task, 'planning');
  assert.equal(c.format, 'plan');
  assert.equal(c.facts.budget?.value, '₹500');
});

test('a Hindi troubleshooting request can ask for a customized prompt', () => {
  const c = contract('पोस्टर में दुकान का रंग बदल रहा है। इसे कैसे ठीक करूं? असली रंग वही रखकर एक प्रॉम्प्ट बना दो।', { language: 'hindi' });
  assert.equal(c.task, 'troubleshooting');
  assert.equal(c.format, 'prompt');
});

test('a scoped short follow-up retains the task after the rolling transcript ages out', () => {
  const options = { conversationId: 'poster-followup' };
  const previousState = contract('Our shop is called Paper Lantern. We sell prints. Write an English poster prompt.', options);
  const next = contract('Isko thoda chhota kar do.', { ...options, previousState });
  assert.equal(next.task, 'creative_deliverable');
  assert.equal(next.format, 'prompt');
  assert.equal(next.facts.business_name?.value, 'Paper Lantern');
  const fresh = contract('Isko thoda chhota kar do.', { conversationId: 'other-chat', previousState });
  assert.equal(fresh.facts.business_name, undefined);
  assert.notEqual(fresh.task, 'creative_deliverable');
});

for (const unsafe of [
  'Use a warm design and free Wi-Fi.',
  'Call to action: Get free delivery.',
  'Do not invent reviews, and our shop offers free delivery.',
  'Use a friendly tone. Our staff are experienced technicians.',
]) test(`formatting and disclaimers cannot excuse a factual claim: ${unsafe}`, () => {
  const c = contract('Our shop is called Paper Lantern. We sell prints. Write an English poster prompt. Delivery and Wi-Fi are unconfirmed.');
  const raw = `\`\`\`text\nCreate a poster for Paper Lantern.\n${unsafe}\nKeep the supplied shop photograph.\n\`\`\``;
  const result = assessBusinessResponse({ reply: raw, contract: c });
  assert.ok(result.issues.length, 'unsupported assertion must be detected');
  assert.doesNotMatch(published(result.answer), /free (?:delivery|Wi-Fi)|experienced technicians/iu);
  assert.match(result.answer, /Create a poster for Paper Lantern/);
  assert.match(result.answer, /Keep the supplied shop photograph/);
});

test('a Hindi refusal does not excuse an affirmative capability in the same sentence', () => {
  const c = contract('मेरी दुकान का नाम किरण है। पोस्टर का प्रॉम्प्ट बना दो। डिलीवरी की पुष्टि नहीं है।', { language: 'hindi' });
  const result = assessBusinessResponse({ reply: '```text\nकिरण के लिए पोस्टर बनाओ।\nनकली रिव्यू मत जोड़ो, लेकिन हमारी दुकान मुफ्त डिलीवरी देती है।\nअसली फोटो रखो।\n```', contract: c });
  assert.ok(result.issues.length);
  assert.doesNotMatch(published(result.answer), /हमारी दुकान मुफ्त डिलीवरी देती है/);
  assert.match(result.answer, /असली फोटो रखो/);
});

test('unknown Hindi staff credentials are qualified while design preferences survive', () => {
  const c = contract('मेरे क्लिनिक का नाम किरण है। पोस्टर का प्रॉम्प्ट बना दो। स्टाफ की योग्यता अभी नहीं बताई है।', { language: 'hindi' });
  const result = assessBusinessResponse({ reply: '```text\nकिरण के लिए पोस्टर बनाओ।\nहमारे डॉक्टर अनुभवी और प्रमाणित हैं।\nहल्के रंग और साफ डिजाइन रखो।\n```', contract: c });
  assert.ok(result.issues.length);
  assert.doesNotMatch(published(result.answer), /डॉक्टर अनुभवी और प्रमाणित/);
  assert.match(result.answer, /हल्के रंग और साफ डिजाइन/);
});

test('safe style cannot retain a superseded business identity', () => {
  const c = contract('Change the shop name from Silver Leaf to Paper Lantern. Write an English poster prompt.', {
    history: [{ role: 'user', content: 'Our shop is called Silver Leaf. We sell prints.' }],
  });
  const result = assessBusinessResponse({ reply: '```text\nCreate a poster for Paper Lantern.\nUse warm colours for Silver Leaf.\n```', contract: c });
  assert.doesNotMatch(result.answer, /Silver Leaf/);
  assert.match(result.answer, /Use warm colours for Paper Lantern/);
});

test('an unrelated feedback template cannot pass as the requested poster repair', async () => {
  const api = backend({ courses: [course], user, replies: [
    'Our shop offers lifetime warranties. Use the supplied photo to make the poster.',
    'Create a feedback request for Paper Lantern. Ask customers for honest reviews.',
  ] });
  const result = await api.chat({ activeCourseId: course._id, message: 'Our shop is called Paper Lantern. Give an English poster prompt. Warranty is unconfirmed.', debugAi: true });
  assert.equal(api.calls.length, 2);
  assert.equal(result.debug.task_assessment.delivery, 'relevant_limitation');
  assert.match(result.answer, /requested prompt.*Paper Lantern/);
  assert.doesNotMatch(result.answer, /Create a feedback request/);
});

test('a planning task cannot accept a generic feedback message as its answer', () => {
  const c = contract('My marketing budget is ₹500. Give a seven-day plan comparing posters, reels and paid ads.');
  const result = assessBusinessResponse({ reply: 'Feedback message: Please share your experience with our shop.', contract: c });
  assert.equal(result.needsRepair, true);
});

test('affirmative Hindi facts remain usable and are not replaced just because of script', () => {
  const c = contract('मेरी दुकान का नाम किरण है। हम मग बेचते हैं। एक कैप्शन लिख दो।', { language: 'hindi' });
  const reply = 'किरण में मग मिलते हैं। अपना पसंदीदा डिजाइन चुनें।';
  const result = assessBusinessResponse({ reply, contract: c });
  assert.equal(result.answer, reply);
  assert.equal(result.issues.length, 0);
});

test('a Hindi retraction removes old delivery support from persistent state', () => {
  const options = { conversationId: 'hindi-delivery', language: 'hindi' };
  const previousState = contract('हम मुफ्त डिलीवरी देते हैं।', options);
  const c = contract('अब डिलीवरी की पुष्टि नहीं है। एक पोस्टर का प्रॉम्प्ट बना दो।', { ...options, previousState });
  assert.equal(c.facts.services, undefined);
  const result = assessBusinessResponse({ reply: '```text\nपोस्टर बनाओ।\nहम मुफ्त डिलीवरी देते हैं।\n```', contract: c });
  assert.ok(result.issues.length);
  assert.doesNotMatch(published(result.answer), /मुफ्त डिलीवरी/);
});

test('an exact approved quote cannot protect a claim appended outside its bytes', () => {
  const c = contract('Give the exact approved course poster prompt and then customize it.');
  const approved = 'Create a poster.\nKeep the supplied photo.';
  const reply = `\`\`\`text\n${approved} Our shop offers free delivery.\n\`\`\``;
  const result = assessBusinessResponse({ reply, contract: c, templates: [{ content: approved }] });
  assert.ok(result.issues.length);
  assert.ok(result.answer.includes(approved), 'approved body is byte-for-byte unchanged');
  assert.doesNotMatch(published(result.answer), /free delivery/);
});
