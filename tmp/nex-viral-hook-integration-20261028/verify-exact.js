(async () => {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  let screen;
  for (const id of hook.renderers.keys()) for (const root of hook.getFiberRoots(id)) {
    const queue = [root.current];
    while (queue.length) { const n = queue.pop(); if (!n) continue; if (n.type?.name === 'AiAssistantScreen') screen = n; if (n.child) queue.push(n.child); if (n.sibling) queue.push(n.sibling); }
  }
  if (!screen) throw Error('Nex AI must be open');
  const selected = screen.memoizedProps.activeCourseHint || screen.memoizedProps.fixedCourse;
  if ((selected?._id || selected?.id) !== '6ae1b4694e1af14d4adc9e2b') throw Error('Select Viral Hook Formula first');
  const results = [];
  for (const name of ['hook writing message', 'hook comparison message']) {
    const response = await screen.memoizedProps.session.requestJson('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      activeCourseId: '6ae1b4694e1af14d4adc9e2b', conversationId: 'viral-local-exact-verification',
      message: `Give the exact approved course ${name} prompt unchanged with all placeholders.`, debugAi: true,
    }) });
    if (response.provider !== 'course-knowledge-rule' || response.knowledge !== 'course-materials') throw Error('Exact prompt did not follow the authorized local path');
    results.push({ name, answer: response.answer, provider: response.provider, templateId: response.debug.selected_exact_prompt_template_id,
      retrievedCourseIds: response.debug.retrieved_course_ids });
  }
  return { results, paidProviderCalls: 0, inferenceEnabled: false };
})()
