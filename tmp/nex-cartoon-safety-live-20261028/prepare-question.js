(async () => {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  let screen;
  for (const id of hook.renderers.keys()) for (const root of hook.getFiberRoots(id)) {
    const queue = [root.current];
    while (queue.length) { const n = queue.pop(); if (!n) continue; if (n.type?.name === 'AiAssistantScreen') screen = n; if (n.child) queue.push(n.child); if (n.sibling) queue.push(n.sibling); }
  }
  if (!screen) throw Error('Open Nex AI first');
  const course = screen.memoizedProps.activeCourseHint || screen.memoizedProps.fixedCourse;
  if ((course?._id || course?.id) !== '6ae09ebee4ac0b60c08276bc') throw Error('Select the verified Cartoon course first');
  const queue = [screen.child]; let input;
  while (queue.length) { const n = queue.pop(); if (!n) continue; if (String(n.memoizedProps?.placeholder || '').startsWith('Ask about your course') && typeof n.memoizedProps.onChangeText === 'function') input ||= n; if (n.child) queue.push(n.child); if (n.sibling) queue.push(n.sibling); }
  if (!input) throw Error('Cartoon question composer is unavailable');
  const question = "Main apni original kids cartoon series banana chahta hoon. Mere characters hain Rohan, 7 saal ka curious boy jo red hoodie pehenta hai, aur Bittu, ek naughty blue parrot. Location ek small village school hai. Episode mein Bittu galti se school ki bell baja deta hai aur sabko lagta hai lunch break ho gaya. Mujhe 3 scenes ki funny story, har scene ka 8-second Google Flow video prompt, aur character consistency ke tips do. Golu aur Chiku use mat karna.";
  input.memoizedProps.onChangeText(question);
  await new Promise(resolve => setTimeout(resolve, 100));
  return { originalQuestionPrepared: true, questionCharacters: question.length, courseId: '6ae09ebee4ac0b60c08276bc', submitted: false, providerCalls: 0 };
})()
