(async () => {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const nodes = () => {
    const output = [];
    for (const id of hook.renderers.keys()) for (const root of hook.getFiberRoots(id)) {
      const queue = [root.current];
      while (queue.length) { const n = queue.pop(); if (!n) continue; output.push(n); if (n.child) queue.push(n.child); if (n.sibling) queue.push(n.sibling); }
    }
    return output;
  };
  const ai = nodes().find(n => n.type?.name === 'AiAssistantScreen');
  if (!ai) throw Error('Open Nex AI before selecting its course');
  const courses = await ai.memoizedProps.session.requestJson('/api/courses');
  const course = courses.find(c => c._id === '6ae09ebee4ac0b60c08276bc' && c.slug === 'ai-cartoon-series');
  if (!course || course.videos.length !== 8) throw Error('Real Cartoon course is not visible in the local catalog');
  const home = nodes().find(n => n.type?.name === 'HomeScreen' && typeof n.memoizedProps.onSelectCourse === 'function');
  if (!home) throw Error('Course selection control is unavailable');
  await home.memoizedProps.onSelectCourse(course);
  await new Promise(resolve => setTimeout(resolve, 500));
  const nav = nodes().filter(n => n.type?.name === 'BottomNav' && typeof n.memoizedProps.onAI === 'function').at(-1);
  if (!nav) throw Error('Nex AI navigation is unavailable');
  await nav.memoizedProps.onAI();
  await new Promise(resolve => setTimeout(resolve, 500));
  const screen = nodes().find(n => n.type?.name === 'AiAssistantScreen');
  const current = screen?.memoizedProps.activeCourseHint || screen?.memoizedProps.fixedCourse;
  if ((current?._id || current?.id) !== course._id) throw Error('Nex AI did not select the verified Cartoon course');
  return { selectedCourseId: course._id, title: course.title, slug: course.slug, lessons: 8, questionsSubmitted: 0 };
})()
