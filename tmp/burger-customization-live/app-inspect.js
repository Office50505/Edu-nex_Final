(async () => {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  let screen;
  for (const id of hook.renderers.keys()) for (const root of hook.getFiberRoots(id)) {
    const queue = [root.current];
    while (queue.length) {
      const node = queue.pop(); if (!node) continue;
      if (node.type?.name === 'AiAssistantScreen') screen = node;
      if (node.child) queue.push(node.child); if (node.sibling) queue.push(node.sibling);
    }
  }
  if (!screen) throw Error('Open Nex AI in the development simulator first');
  const props = screen.memoizedProps;
  const course = props.activeCourseHint || props.fixedCourse;
  const health = await props.session.requestJson('/api/ai/health');
  const courses = await props.session.requestJson('/api/ai/courses');
  const result = { backendUrl: process.env.EXPO_PUBLIC_API_BASE, authenticated: health.ok === true,
    userId: props.user?._id, activeCourseId: course?._id || course?.id || course?.slug,
    entitlementState: props.user?.entitlementState,
    courseIndexed: courses.some(item => item.id === (course?._id || course?.id)),
    messages: [] };
  for (let item = screen.memoizedState; item; item = item.next) {
    const value = item.memoizedState;
    if (typeof value === 'string' && value.startsWith('nai-')) result.conversationId = value;
    if (Array.isArray(value) && value.length && value.every(m => m && ['user', 'assistant'].includes(m.role))) {
      result.messages = value.map(m => ({ role: m.role, content: m.content, failed: Boolean(m.failed), outcome: m.outcome, provider: m.provider, id: m.id }));
    }
  }
  return result;
})()
