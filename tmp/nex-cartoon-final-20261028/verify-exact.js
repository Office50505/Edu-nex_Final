(async () => {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  let screen;
  for (const id of hook.renderers.keys()) for (const root of hook.getFiberRoots(id)) {
    const queue = [root.current];
    while (queue.length) { const n = queue.pop(); if (!n) continue; if (n.type?.name === 'AiAssistantScreen') screen = n; if (n.child) queue.push(n.child); if (n.sibling) queue.push(n.sibling); }
  }
  if (!screen) throw Error('Nex AI must be open');
  const result = await screen.memoizedProps.session.requestJson('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    activeCourseId: '6ae09ebee4ac0b60c08276bc', conversationId: 'cartoon-preparation-exact-only',
    message: 'Give the complete exact approved Lesson 05 Step 1 Start frame prompt unchanged.', debugAi: true,
  }) });
  if (result.provider !== 'course-knowledge-rule' || result.knowledge !== 'course-materials') throw Error('Exact prompt did not use the authorized local course rule');
  return { provider: result.provider, knowledge: result.knowledge, answer: result.answer,
    templateId: result.debug.selected_exact_prompt_template_id, retrievedCourseIds: result.debug.retrieved_course_ids,
    providerStatus: result.outcome.providerStatus };
})()
