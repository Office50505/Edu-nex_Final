require('../../edunex-b/tests/helpers/deny-network.cjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { backend } = require('../../edunex-b/tests/ai-tutor-fixture.cjs');
const { course } = require('../../edunex-b/scripts/eval/local-business-registration/real-metadata.json');
const cases = require('../../edunex-b/tests/fixtures/task-preserving-live-failures.json').cases;
async function main() {
  const results = [];
  for (const saved of cases) {
    const api = backend({ courses: [course], user: { _id: '6addcefc5d47d548973c29b9', purchasedCourses: [course._id] }, reply: saved.rawAnswer });
    const delivered = await api.chat({ ...saved.request, debugAi: true });
    assert.equal(api.calls.length, 1);
    assert.equal(delivered.debug.task_assessment.repairAttempted, false);
    assert.equal(delivered.debug.task_assessment.finalIssues.length, 0);
    results.push({ id: saved.id, evidenceSource: saved.source, evidenceSourceLine: saved.sourceLine,
      request: saved.request.message, originalDelivery: saved.originalFinal.answer,
      correctedDelivery: delivered.answer, assessment: delivered.debug.task_assessment,
      mockedGenerationAttempts: api.calls.length, realProviderAttempts: 0 });
  }
  fs.writeFileSync(path.join(__dirname, 'historical-replay.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results.map(r => ({ id: r.id, task: r.assessment.task, delivery: r.assessment.delivery, issuesRemaining: r.assessment.finalIssues.length, repairAttempted: r.assessment.repairAttempted }))));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
