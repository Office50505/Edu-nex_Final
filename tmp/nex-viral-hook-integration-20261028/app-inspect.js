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
  const runtime = await props.session.requestJson('/__local_verification/status');
  const subscription = await props.session.requestJson('/api/user/' + props.user._id + '/subscription');
  const result = { sourceRevisionSHA256: runtime.sourceRevisionSHA256, backendRevisionMatchesConfiguredEndpoint: runtime.backendUrl === process.env.EXPO_PUBLIC_API_BASE, backendUrl: process.env.EXPO_PUBLIC_API_BASE, authenticated: health.ok === true,
    userId: props.user?._id, activeCourseId: course?._id || course?.id || course?.slug,
    entitlementState: subscription.entitlementState,
    entitlementSource: subscription.entitlementSource,
    inferenceEnabled: runtime.inferenceEnabled, registeredLocalPacks: runtime.registeredLocalPacks,
    courseIndexed: courses.some(item => item.id === (course?._id || course?.id)),
    messages: [] };
  for (let item = screen.memoizedState; item; item = item.next) {
    const value = item.memoizedState;
    if (typeof value === 'string' && value.startsWith('nai-')) result.conversationId = value;
    if (Array.isArray(value) && value.length && value.every(m => m && ['user', 'assistant'].includes(m.role))) {
      result.messages = value.map(m => ({ role: m.role, content: m.content, failed: Boolean(m.failed), outcome: m.outcome, provider: m.provider, id: m.id }));
    }
  }
  const sessions = [];
  for (let item = screen.memoizedState; item; item = item.next) {
    const value = item.memoizedState;
    if (Array.isArray(value) && value.some(v => typeof v?.id === 'string' && v.id.startsWith('nai-') && Array.isArray(v.messages))) sessions.push(...value.map(v => ({id:v.id,messages:v.messages.filter(m=>m.role==='user'||m.role==='assistant').length})));
  }
  result.history = { conversationCount:sessions.length, preservedConversations:sessions.filter(v=>v.messages>1), currentMessageCount:result.messages.length };
  return result;
})()
