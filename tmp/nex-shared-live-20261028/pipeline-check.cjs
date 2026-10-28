const assert = require('node:assert/strict');
function verifyPipeline(service, backendRequire, frozen, sha) {
  const contracts = backendRequire('./services/businessRequestContract');
  const pipeline = backendRequire('./services/businessResponsePipeline');
  const packs = backendRequire('./services/courseKnowledgePacks');
  assert.equal(packs.buildBusinessContract, contracts.buildBusinessContract);
  assert.equal(service.assessTaskResponse, packs.assessTaskResponse);
  // Exercise the actual loaded modules locally, with no provider or database.
  const contract = contracts.buildBusinessContract({ message: 'Our shop is called Local QA. We sell prints. Give an English poster prompt.',
    course: { id: frozen.course_id }, authorized: true, language: 'english', conversationId: 'startup-self-check' });
  assert.equal(contract.task, 'creative_deliverable');
  assert.equal(contract.facts.business_name.value, 'Local QA');
  const assessment = pipeline.assessBusinessResponse({ contract,
    reply: '```text\nCreate a poster for Local QA.\n- Expert technicians.\nUse a warm layout.\n```' });
  assert.ok(assessment.edits.length > 0);
  assert.match(assessment.answer, /Create a poster for Local QA/);
  assert.match(assessment.answer, /Use a warm layout/);
  assert.doesNotMatch(assessment.answer.replace(/\[[^\]]*\]/gu, ''), /Expert technicians/);
  assert.equal(pipeline.assessBusinessResponse({ contract, reply: assessment.answer }).issues.length, 0);
  return { requestContractLoaded: true, taskPreservingValidationLoaded: true, sharedServiceExportsVerified: true,
    deterministicStartupCheckPassed: true, providerCalls: 0,
    requestContractFunctionSHA256: sha(contracts.buildBusinessContract.toString()),
    taskAssessmentFunctionSHA256: sha(service.assessTaskResponse.toString()) };
}
module.exports = { verifyPipeline };
