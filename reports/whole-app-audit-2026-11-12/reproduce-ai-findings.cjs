// Synthetic, local-only reproductions. The existing fixture injects its provider
// transport; this script makes no live AI call and never reads a real account.
const fs = require('node:fs');
const path = require('node:path');
const { backend } = require('../../edunex-b/tests/ai-tutor-fixture.cjs');

async function main() {
  const courseId = '6e0000000000000000000011';
  const base = {
    courses: [{ _id: courseId, slug: 'ai-product-photoshoot-ads', title: 'AI Product Photoshoot & Ads', videos: [] }],
    user: { _id: 'synthetic-audit-user' },
    subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 60000) },
  };
  const sessions = new Map();
  const unavailable = backend({ ...base, noKey: true, sessions });
  const turns = [];
  for (const message of [
    'My item is a hollow ebony whistle tray. Price: 915. Material: wood.',
    'Replace the product with a soft felt marimba cover.',
    'Copy the complete L02 White Studio template for the same product.',
  ]) {
    const response = await unavailable.rawChat({ courseId, conversationId: 'synthetic-audit', message });
    turns.push({ message, statusCode: response.statusCode, response: response.result, persistedSessionCount: sessions.size });
  }
  const repair = backend({ ...base, replies: [
    'Plain background is useful. Caption: Offers superior comfort and a free case.',
    'A plain background shows the product clearly, whereas a busy scene supplies context.\nCaption: Here is a carved cedar reed bridge. View its supplied details.',
  ] });
  const result = await repair.chat({ courseId,
    message: 'My product is a carved cedar reed bridge. Compare plain and busy references, choose one first and write a caption.',
    debugAi: true });
  const instruction = repair.calls[1]?.messages?.find(m => m.role === 'system')?.content || '';
  const marker = 'Correct only these unsupported factual propositions:';
  const start = instruction.indexOf(marker);
  const evidence = {
    syntheticFixturesOnly: true,
    liveProviderRequests: 0,
    unavailableProviderContext: { turns, providerRequests: unavailable.calls.length },
    repairPayload: {
      injectedProviderRequests: repair.calls.length,
      instructionExcerpt: start < 0 ? null : instruction.slice(start, start + 150),
      missingViolations: instruction.includes(marker + ' undefined'),
      reply: result.reply,
      outcome: result.outcome,
    },
  };
  const target = path.join(__dirname, 'evidence/ai-reproductions.json');
  fs.writeFileSync(target, JSON.stringify(evidence, null, 2));
  console.log('Saved synthetic reproduction evidence to ' + target);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
