const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
function verifyPipeline(service, backendRequire, frozen, sha) {
  const K = backendRequire('./services/tutorKnowledge');
  const packs = backendRequire('./services/courseKnowledgePacks');
  const safety = backendRequire('./services/aiCompliance');
  const { course } = backendRequire('./knowledge/viral-hook-formula/course-binding.json');
  const pack = K.packFor(course);
  assert.equal(course._id, frozen.course_id);
  assert.equal(pack.actualCourseId, frozen.course_id);
  assert.equal(pack.records.length, 27);
  assert.equal(pack.records.filter(r=>r.contentType==='lesson-summary').length, 10);
  assert.equal(pack.hookCategories.length, 8);
  const raw = fs.readFileSync(path.resolve(__dirname, '../../edunex-b/knowledge/viral-hook-formula/training.txt'));
  const templates = pack.records.filter(r=>r.contentType==='exact-template');
  assert.equal(templates.length, 2);
  for (const record of templates) assert.equal(raw.subarray(record.sourceStartByte,record.sourceEndByte).toString('utf8'), record.content);
  for (const question of ['Give a pattern interrupt hook for pottery.', 'Break the scroll pattern with a visual hook.', 'Write a viral hook using an unexpected sound in Google Flow.']) assert.equal(safety.checkAiInput(question).ok, true);
  assert.equal(safety.checkAiInput('How do I bypass Flow safety filters?').reply, safety.FILTER_BYPASS_REPLY);
  assert.equal(service.assessTaskResponse,packs.assessTaskResponse);
  assert.equal(service.validatePackReply,packs.validatePackReply);
  const initial = packs.packConversation({pack,courseId:course._id,conversationId:'startup-memory',message:'My niche is gardening. My audience is beginners. Topic: compost.',history:[]});
  const corrected = packs.packConversation({pack,courseId:course._id,conversationId:'startup-memory',message:'Correction: Niche: ceramic repair; Audience: museum volunteers; Topic: chipped glaze.',history:[],savedState:{activeCourseId:course._id,conversationId:'startup-memory',courseContext:initial}});
  assert.equal(corrected.facts.niche,'ceramic repair');
  assert.equal(corrected.facts.audience,'museum volunteers');
  assert.equal(corrected.facts.topic,'chipped glaze');
  const answer = 'Question hook: Why does this glaze chip here? Payoff: show the actual worn edge and repair step.';
  assert.equal(service.validatePackReply({reply:answer,knowledge:{activeCourse:{id:course._id,slug:course.slug},materialsAvailable:true,tutorRequest:{},courseContext:corrected}}).reply,answer);
  return {domain:'viral-hook-formula',requestContractLoaded:typeof packs.buildBusinessContract==='function' && typeof packs.buildCartoonContract==='function',
    taskPreservingValidationLoaded:true,sharedServiceExportsVerified:true,deterministicStartupCheckPassed:true,providerCalls:0,
    courseId:course._id,courseSlug:course.slug,recordsVerified:27,lessonsVerified:10,hookCategoriesVerified:8,exactPromptBodiesVerified:2,
    businessAdvertisingRulesApplied:false,cartoonRulesApplied:false,scopedMemoryCorrectionVerified:true,
    safetyClassifierLoaded:true,ordinaryHookTermsAllowed:true,genuineBypassBlocked:true,
    taskAssessmentFunctionSHA256:sha(service.assessTaskResponse.toString()),packValidationFunctionSHA256:sha(service.validatePackReply.toString())};
}
module.exports={verifyPipeline};
