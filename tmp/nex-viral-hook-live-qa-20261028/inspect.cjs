// Read-only: never creates approval or calls a provider.
const fs = require('node:fs');
const path = require('node:path');
function exchanges(events) {
  const requests = new Map();
  for (const event of events) {
    if (!event.request_id) continue;
    const item = requests.get(event.request_id) || { requestId: event.request_id, conversationId: null, question: null, rawProviderResponses: [], assessments: [], delivered: null };
    requests.set(event.request_id, item);
    item.conversationId ||= event.conversation_id || null;
    if (event.type === 'provider_response') item.rawProviderResponses.push({
      attempt: event.call, httpStatus: event.status, durationMs: event.durationMs,
      text: event.data?.choices?.[0]?.message?.content ?? event.data?.output ?? null,
      raw: event.data,
    });
    if (['provider_transport_error', 'provider_http_error', 'provider_response_unreadable', 'provider_blocked'].includes(event.type)) {
      item.rawProviderResponses.push({ attempt: event.call ?? null, failure: event.type, httpStatus: event.status ?? null, reason: event.reason ?? event.name ?? null });
    }
    if (['task_assessment', 'pack_validation'].includes(event.type)) item.assessments.push(event.assessment);
    if (event.type === 'chat_response') {
      item.question = event.request?.message || null;
      item.delivered = { httpStatus: event.httpStatus, durationMs: event.durationMs,
        text: event.response?.answer ?? event.response?.reply ?? event.response?.error ?? null,
        provider: event.response?.provider ?? null, outcome: event.response?.outcome ?? null };
    }
  }
  return [...requests.values()];
}
function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--last', '--all'].includes(arg))) throw Error('Usage: node inspect.cjs [--last|--all]');
  const raw = fs.readFileSync(path.join(__dirname, 'pipeline_traces.jsonl'), 'utf8');
  const rows = exchanges(raw.split('\n').filter(Boolean).map(line => JSON.parse(line)));
  console.log(JSON.stringify({ paidExecutionTriggered: false, requestsRecorded: rows.length,
    exchanges: args.includes('--all') ? rows : rows.slice(-1) }, null, 2));
}
if (require.main === module) main();
module.exports = { exchanges };
