const assert = require('node:assert/strict');
function verifyPipeline(service, backendRequire, frozen, sha, binding) {
  const packs = backendRequire('./services/courseKnowledgePacks');
  const K = backendRequire('./services/tutorKnowledge');
  const cartoon = backendRequire('./services/cartoonTutorPipeline');
  assert.equal(service.assessTaskResponse, packs.assessTaskResponse);
  assert.equal(K.packFor(binding.course), binding.pack);
  assert.equal(binding.course._id, frozen.course_id);
  const lessons = binding.pack.records.filter(r => r.contentType === 'lesson-summary');
  const approved = binding.pack.records.filter(r => r.contentType === 'exact-template');
  assert.equal(lessons.length, 8);
  assert.equal(approved.length, 18);
  for (const activeLesson of binding.course.videos) {
    const k = K.retrieveKnowledge({ courses: [binding.course], activeCourse: binding.course, activeLesson, includeMaterials: true, message: 'Explain this video.' });
    assert.ok(k.records.some(r => r.contentType === 'lesson-summary' && r.lessonNumber === activeLesson.order));
    assert.ok(k.records.every(r => r.courseId === frozen.course_id));
  }
  const state = packs.packConversation({ pack: binding.pack, courseId: frozen.course_id, conversationId: 'startup-local-check',
    message: 'Character 1: Nivi, teal coat; Character 2: Piku, purple scarf; Current scene: Only Nivi in garden, Piku is absent; Give an English reference checklist.', history: [] });
  const contract = cartoon.buildCartoonContract({ message: state.userEvidence[0], course: binding.course, state, authorized: true });
  assert.equal(contract.domain, 'cartoon-series');
  const a = packs.assessTaskResponse({ reply: "Nivi's character sheet is required. Piku's character sheet is required. Use the garden reference image.",
    knowledge: { activeCourse: { id: frozen.course_id, slug: binding.course.slug }, materialsAvailable: true, responseContract: contract } });
  assert.match(a.answer, /Piku is absent.*omit/);
  assert.match(a.answer, /Use the garden reference image/);
  assert.equal(packs.assessTaskResponse({ reply: a.answer, knowledge: { activeCourse: { id: frozen.course_id, slug: binding.course.slug }, materialsAvailable: true, responseContract: contract } }).issues.length, 0);
  return { domain: 'cartoon-series', requestContractLoaded: true, taskPreservingValidationLoaded: true,
    sharedServiceExportsVerified: true, deterministicStartupCheckPassed: true, providerCalls: 0,
    courseId: frozen.course_id, courseSlug: binding.course.slug, lessonsVerified: 8, exactPromptBodiesVerified: 18,
    businessAdvertisingRulesApplied: false,
    requestContractFunctionSHA256: sha(cartoon.buildCartoonContract.toString()),
    taskAssessmentFunctionSHA256: sha(service.assessTaskResponse.toString()) };
}
module.exports = { verifyPipeline };
