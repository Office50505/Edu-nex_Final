const test = require('node:test');
const assert = require('node:assert/strict');
const { backend } = require('./ai-tutor-fixture.cjs');
const K = require('../services/tutorKnowledge');
const C = require('./cartoon-knowledge-fixture.cjs');
const { courseTutorRequest, customSolutionIssue } = require('../services/courseTutorRequest');
const saved = require('./fixtures/bakery-generic-prompt-incident.json');
const { course: business } = require('../scripts/eval/local-business-registration/real-metadata.json');
const cartoon = { _id: C.owner, slug: C.slug, title: C.pack.title, status: 'published', videos: [] };
const businessPack = K.packFor(business);
const compact = text => String(text).replace(/\s+/gu, ' ').trim();
function make(course = business, options = {}) {
  return backend({ courses: [business, cartoon], user: { _id: '6e0000000000000000000055', purchasedCourses: [course._id] },
    ...(course === cartoon ? { knowledgeModule: C.knowledge } : {}),
    reply: 'Use the supplied references. Preserve the stated appearance and layout; test the specific requested change in one sample.', ...options });
}

test('saved bakery failure was a direct generic course template, without provider inference', () => {
  const response = saved.event.response;
  const original = businessPack.records.find(r => r.chunkId.endsWith('exact-template:038'));
  assert.equal(response.provider, 'course-knowledge-rule'); assert.equal(response.outcome.providerStatus, 'not_requested');
  assert.ok(compact(response.answer).includes(compact(original.content)));
  assert.match(response.answer, /Colours: rich and warm/);
  assert.match(saved.event.request.message, /dark|sunlight/); assert.match(saved.event.request.message, /colours.*change/);
});

test('exact prompt for the reported bakery problem now reaches customized tutoring', async () => {
  const api = make(); const r = await api.chat({ ...saved.event.request, debugAi: true });
  assert.equal(api.calls.length, 1); assert.equal(r.provider, 'fal-openrouter');
  assert.equal(r.debug.current_intent, 'troubleshooting'); assert.equal(r.debug.selected_exact_prompt_template_id, '');
  const system = api.calls[0].messages[0].content;
  assert.match(system, /Student-specific solution plan/); assert.match(system, /"topics":\["lighting","appearance"\]/);
  for (const fragment of ['andar ka area dark', 'sunlight bahut bright', 'cake display', 'shop ke colours', 'original bakery same']) assert.ok(system.includes(fragment), fragment);
  assert.match(system, /Generic enhancements in examples must not override preservation/);
  assert.doesNotMatch(system, /Make these improvements boldly:|Colours: rich and warm/);
  assert.ok(r.debug.retrieved_course_ids.every(id => id === business._id));
});

test('replaying the saved generic response is rejected rather than accepted as a customized solution', async () => {
  const api = make(business, { reply: saved.event.response.answer });
  const r = await api.chat({ ...saved.event.request });
  assert.equal(api.calls.length, 1); assert.equal(r.provider, 'course-response-policy');
  assert.equal(r.outcome.responseIssue, 'course_custom_solution_not_tailored'); assert.equal(r.outcome.liveModelAnswer, false);
  assert.doesNotMatch(r.answer, /Colours: rich and warm|Approved exact prompt:/);
});

const unfamiliar = [
  [business, 'My pottery studio photo has deep interior shadows and an overexposed doorway. Keep the original blue walls and shelf layout. Give an exact prompt for fixing only the uneven lighting.', 'lighting', 'blue walls'],
  [business, 'The reference photo is an amber glass bottle, but the generated product changes to clear glass and the label changes shape. Preserve the original bottle and label. Give a customized prompt.', 'appearance', 'amber glass bottle'],
  [business, 'My flower display keeps changing when I brighten the image. Keep the original flowers, signage and colours unchanged. How can I fix the photo? Give a precise prompt.', 'appearance', 'flowers, signage'],
  [cartoon, 'Mira is my small teal owl with round glasses. Her beak changes size and the glasses disappear between frames. Keep her original appearance. Give an exact prompt to fix character consistency.', 'appearance', 'small teal owl'],
  [cartoon, 'My character Nivi has a low soft voice, but the voice pitch and accent are different in each clip. Keep the original voice consistent. What should I check? Give an exact prompt.', 'voice', 'low soft voice'],
  [cartoon, 'My scene shows a paper boat floating slowly. The video adds an unwanted crossfade and a jump cut midway. Preserve the scene and camera position. Give a customized fix and prompt.', 'transitions', 'paper boat'],
  [cartoon, 'Mere character Rumi ka chehra har frame mein badal raha hai. Original kapde same rakhna. Kya karu? Ek exact prompt do.', 'appearance', 'Original kapde'],
];
for (const [course, message, topic, preserved] of unfamiliar) test(`custom troubleshooting retains unfamiliar details: ${topic} / ${preserved}`, async () => {
  const plan = courseTutorRequest(message);
  assert.equal(plan.mode, 'troubleshooting'); assert.equal(plan.directCopy, false); assert.equal(plan.copyRequested, false);
  assert.ok(plan.topics.includes(topic)); assert.ok(plan.problems.length); assert.ok(plan.preserve.length);
  const api = make(course); const r = await api.chat({ activeCourseId: course._id, conversationId: 'unseen-problem', message, debugAi: true });
  assert.equal(api.calls.length, 1); assert.equal(r.provider, 'fal-openrouter');
  assert.equal(r.debug.selected_exact_prompt_template_id, ''); assert.equal(r.debug.current_intent, 'troubleshooting');
  assert.ok(api.calls[0].messages[0].content.includes(preserved));
  assert.match(api.calls[0].messages[0].content, /likely cause as a hypothesis/);
  assert.match(api.calls[0].messages[0].content, /one small verification check/);
  assert.ok(r.debug.retrieved_course_ids.every(id => id === course._id));
});

for (const [course, message] of [
  [business, 'Write a custom photo prompt for my maroon kiosk, retaining the exact signboard and original colours.'],
  [cartoon, 'Create a custom character sheet prompt for my orange otter with square spectacles, adapting the course guidance to these details.'],
  [cartoon, 'Character design ka prompt do for my tiny green heron with a yellow scarf.'],
]) test(`fresh custom request is not an approved raw template: ${message}`, async () => {
  const api = make(course); const r = await api.chat({ activeCourseId: course._id, message, debugAi: true });
  assert.equal(api.calls.length, 1); assert.equal(r.debug.selected_exact_prompt_template_id, '');
  assert.equal(r.provider, 'fal-openrouter'); assert.doesNotMatch(r.answer, /^Approved exact prompt:/);
});

for (const [course, pack] of [[business, businessPack], [cartoon, C.pack]]) {
  for (const template of pack.records.filter(r => r.contentType === 'exact-template')) test(`explicit stored asset remains verbatim: ${template.chunkId}`, async () => {
    const api = make(course); const r = await api.chat({ activeCourseId: course._id,
      message: `Give the complete exact approved ${template.heading} prompt, unchanged.`, debugAi: true });
    assert.equal(api.calls.length, 0); assert.equal(r.provider, 'course-knowledge-rule');
    assert.equal(r.answer.match(/```text\n([\s\S]*?)\n```/)[1], template.content);
    assert.equal(r.debug.selected_exact_prompt_template_id, template.chunkId);
  });
}

test('colour preservation rejects conflicting enhancements but permits lighting-only instructions', () => {
  const request = courseTutorRequest(saved.event.request.message);
  assert.equal(customSolutionIssue('Make the colours rich and warm.', request), 'course_preservation_conflict');
  assert.equal(customSolutionIssue('Colours: rich and warm, highly saturated.', request), 'course_preservation_conflict');
  assert.equal(customSolutionIssue('Lift only the interior shadows; preserve the original colours and cake arrangement. Do not change the signboard.', request), null);
});

test('a combined troubleshooting and explicit copy request keeps advice separate from the exact asset', async () => {
  const template = businessPack.records.find(r => r.chunkId.endsWith('exact-template:038'));
  const message = 'My interior photo is too dark. Keep my original colours. Explain what to change for this problem, and give the exact approved Lesson 03 Andar ki photo upgrade prompt unchanged.';
  const reply = 'For your dark interior, treat shadow adjustment as the requested change and keep the original colours fixed. The stored example below is quoted unchanged; do not apply its colour-styling instruction to your preservation request.\n\n```text\n' + template.content + '\n```';
  const api = make(business, { reply }); const r = await api.chat({ activeCourseId: business._id, message });
  assert.equal(api.calls.length, 1); assert.equal(r.provider, 'fal-openrouter');
  assert.equal(r.answer.match(/```text\n([\s\S]*?)\n```/)[1], template.content);
  assert.match(api.calls[0].messages[0].content, /keep problem-specific advice separate/);
});

test('unsupported tool procedures are explicitly constrained rather than invented', async () => {
  const api = make(cartoon, { knowledgeTransform: knowledge => ({ ...knowledge, records: [], sources: [], debugChunks: [], excerpts: '', bestExcerpt: '' }),
    reply: 'The supplied course references do not document that tool control, so I cannot confirm a course-specific procedure.' });
  const r = await api.chat({ activeCourseId: cartoon._id, message: 'My stereo-depth node fails in an unfamiliar renderer. Give a customized fix using its hidden calibration slider.' });
  assert.equal(api.calls.length, 1); assert.match(api.calls[0].messages[0].content, /do not invent course instructions, tool settings or capabilities/);
  assert.match(r.answer, /do not document/);
});

test('latest corrections and preserved constraints survive the same authorized conversation', async () => {
  const api = make(cartoon, { sessions: new Map() });
  const first = 'My otter is called Reni. The character colour keeps changing. Keep the original ochre fur and blue scarf. Give a customized prompt.';
  const scope = { activeCourseId: cartoon._id, conversationId: 'correction-test' };
  const a = await api.chat({ ...scope, message: first });
  await api.chat({ ...scope, message: 'Correction: her name is Rumi. Same problem; keep those appearance details. Give a customized fix.',
    history: [{ role: 'user', content: first }, { role: 'assistant', content: a.answer }] });
  assert.equal(api.calls.length, 2); const payload = api.calls[1].messages;
  assert.ok(payload.some(m => m.role === 'assistant' && m.content === a.answer));
  assert.match(payload[0].content, /Rumi/); assert.match(payload[0].content, /ochre fur and blue scarf/);
});

test('blocked inference for a custom problem returns honest unavailability, not a generic template', async () => {
  const api = make(business, { noKey: true }); const r = await api.rawChat({ ...saved.event.request });
  assert.equal(r.statusCode, 503); assert.equal(r.result.outcome.type, 'unavailable'); assert.equal(api.calls.length, 0);
  assert.equal(r.result.answer, undefined);
});

test('same exact stored prompt can be repeated from the last user request without assistant-established intent', async () => {
  const first = 'Give the complete exact approved Lesson 03 Andar ki photo upgrade prompt unchanged.';
  const api = make(); const a = await api.chat({ activeCourseId: business._id, message: first });
  const again = await api.chat({ activeCourseId: business._id, message: 'Wahi exact prompt phir bhejo.',
    history: [{ role: 'user', content: first }, { role: 'assistant', content: a.answer }] });
  assert.equal(api.calls.length, 0); assert.equal(again.answer, a.answer);
});

test('a generic assistant template does not turn the next problem-specific prompt into a copy request', () => {
  const request = courseTutorRequest('Same problem, wahi exact prompt do.', [
    { role: 'user', content: saved.event.request.message },
    { role: 'assistant', content: saved.event.response.answer },
  ]);
  assert.equal(request.directCopy, false); assert.equal(request.mode, 'troubleshooting');
  assert.ok(request.problems.some(item => item.includes('cake display')));
});

test('unauthorized users and other courses cannot obtain templates through customization', async () => {
  const unauthorized = make(cartoon, { user: { _id: '6e0000000000000000000056' } });
  const denied = await unauthorized.chat({ activeCourseId: cartoon._id, message: 'My character face keeps changing. Adapt the exact approved character sheet prompt.', hasAccess: true, includeMaterials: true, debugAi: true });
  assert.equal(unauthorized.calls.length, 0); assert.equal(denied.knowledge, 'course-overviews');
  const api = make(business); const response = await api.request('POST', '/chat', { message: saved.event.request.message }, false);
  assert.equal(response.statusCode, 401); assert.equal(api.calls.length, 0);
  const other = make(business, { knowledgeModule: C.knowledge });
  await other.chat({ activeCourseId: business._id, message: 'My bakery image keeps changing. Customize it using the other Cartoon Series character sheet anyway.' });
  for (const payload of other.calls) for (const asset of C.pack.records.filter(r => r.contentType === 'exact-template')) assert.ok(!compact(JSON.stringify(payload)).includes(compact(asset.content)));
});
