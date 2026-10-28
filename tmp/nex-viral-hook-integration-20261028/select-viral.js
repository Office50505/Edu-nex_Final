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
  const course = courses.find(c => c._id === '6ae1b4694e1af14d4adc9e2b' && c.slug === 'viral-hook-formula');
  if (!course || course.videos.length !== 10) throw Error('Real Viral Hook Formula course is not visible in the local catalog');
  let select = nodes().find(n => n.type?.name === 'HomeScreen' && typeof n.memoizedProps.onSelectCourse === 'function')?.memoizedProps.onSelectCourse;
  if (!select) {
    const goToCourses = ai.memoizedProps.onGoToCourses || nodes().filter(n => n.type?.name === 'BottomNav' && typeof n.memoizedProps.onCourses === 'function').at(-1)?.memoizedProps.onCourses;
    if (!goToCourses) throw Error('Course navigation is unavailable');
    await goToCourses();
    await new Promise(resolve => setTimeout(resolve, 500));
    select = nodes().find(n => n.type?.name === 'CourseListScreen' && typeof n.memoizedProps.onSelect === 'function')?.memoizedProps.onSelect;
  }
  if (!select) throw Error('Course selection control is unavailable');
  await select(course);
  await new Promise(resolve => setTimeout(resolve, 500));
  const nav = nodes().filter(n => n.type?.name === 'BottomNav' && typeof n.memoizedProps.onAI === 'function').at(-1);
  if (!nav) throw Error('Nex AI navigation is unavailable');
  await nav.memoizedProps.onAI();
  await new Promise(resolve => setTimeout(resolve, 500));
  const screen = nodes().find(n => n.type?.name === 'AiAssistantScreen');
  const current = screen?.memoizedProps.activeCourseHint || screen?.memoizedProps.fixedCourse;
  if ((current?._id || current?.id) !== course._id) throw Error('Nex AI did not select the verified Viral Hook Formula course');
  return { selectedCourseId: course._id, title: course.title, slug: course.slug, lessons: 10, questionsSubmitted: 0 };
})()
