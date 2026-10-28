// Read-only: reads the durable trace and native screen. Does not authorize,
// submit messages, refresh authentication, modify ledgers, or write reports.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createGate, sha, backendRoot, sameHistory } = require('./gate.cjs');
function review() {
  const gate = createGate();
  const previous = JSON.parse(fs.readFileSync(path.join(__dirname, 'previous-ledgers.sha256.json')));
  for (const [file, hash] of Object.entries(previous)) {
    if (sha(fs.readFileSync(path.resolve(backendRoot, '..', file))) !== hash) throw Error('Previous saved artifact changed: ' + file);
  }
  const events = fs.readFileSync(gate.tracePath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const turn = events.find(e => e.type === 'chat_response' && e.turn === 1 && e.conversation_id === gate.frozen.conversation_id && e.user_id === gate.frozen.user_id);
  let native = null, nativeReadError = null;
  try {
    const result = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'app-evaluate.cjs'), path.join(__dirname, 'app-read.js')], { encoding: 'utf8', timeout: 20000 }));
    if (!result.ok) throw Error(result.error); native = result.value;
  } catch (error) { nativeReadError = error.message; }
  const context = events.find(e => e.type === 'context' && e.request_id === turn?.request_id);
  const transport = events.find(e => e.type === 'provider_response' && e.request_id === turn?.request_id && e.status === 200);
  const genuine = Boolean(turn?.httpStatus === 200 && turn.response?.provider === 'fal-openrouter'
    && turn.response?.outcome?.liveModelAnswer === true && transport && events.some(e => e.type === 'provider_invoked' && e.turn === 1));
  const nativeMatches = Boolean(native && turn && native.backendUrl === gate.frozen.backend_url
    && native.conversationId === gate.frozen.conversation_id
    && native.messages.some(m => m.role === 'user' && m.content === gate.frozen.turns[0].query)
    && native.messages.some(m => m.role === 'assistant' && !m.failed && m.content === turn.response?.answer?.slice(0, 4000)));
  const scoped = Boolean(context?.materialsAvailable && context?.activeCourseId === gate.frozen.course_id && context?.authenticated_user_id === gate.frozen.user_id);
  const answer = turn?.response?.answer || '';
  const prompts = [...answer.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(match => match[1]);
  const signals = { mentionsBurger: /burger|बर्गर/i.test(answer), lighting: /light|रोशनी/i.test(answer),
    shadows: /shadow|छाया/i.test(answer), sharpness: /sharp|clarity|स्पष्ट/i.test(answer),
    cheeseAndLettuce: /cheese/i.test(answer) && /lettuce/i.test(answer), shape: /shape|आकार/i.test(answer),
    preservation: /preserve|unchanged|original|same|mat badal|asli|असली|वही/i.test(answer),
    colourAndProportions: /colou?r|रंग/i.test(answer) && /proportion|portion|ratio|अनुपात/i.test(answer),
    recoveryAdvice: /again|retry|rerun|revert|original photo|dobara|phir|फिर|दोबारा/i.test(answer),
    guaranteeWordsForContextualReview: answer.match(/\b(?:guarantee\w*|perfect\w*|always|100%)\b/gi) || [],
    unrelatedReplySignal: /phonepe|razorpay|skillomate subscription|course overview/i.test(answer) };
  const value = { readOnlyReview: true, caseSHA256: gate.hash, questionSHA256: gate.frozen.question_sha256,
    model: gate.frozen.model, courseId: gate.frozen.course_id, conversationId: gate.frozen.conversation_id,
    providerAttempts: gate.count(), maxProviderAttempts: 2, genuineProviderAnswer: genuine,
    authorizedCourseScope: scoped, nativeAnswerMatchesBackend: nativeMatches,
    initialHistoryMatches: Boolean(turn && sameHistory(turn.request.history, gate.frozen.initial_history)),
    actualAnswer: answer, fencedPrompts: prompts, latencyMs: turn?.durationMs ?? null,
    providerFailures: events.filter(e => ['provider_blocked','provider_http_error','provider_transport_error','provider_response_unreadable'].includes(e.type)),
    nativeReadError, reviewSignals: signals, expectedBehavior: gate.frozen.expected_behavior,
    manualReviewRequired: true, assessment: genuine && scoped && nativeMatches ? 'REQUIRES CONTENT REVIEW' : 'LIVE TEST NOT VERIFIED',
    note: 'Inspect actual instructions, including ingredient negation, usable customized prompt, practical recovery steps and honest limitations. Word signals alone are not a pass/fail grader. No files were written.' };
  console.log(JSON.stringify(value, null, 2));
}
try { review(); } catch (error) { console.error(error.message); process.exitCode = 1; }
