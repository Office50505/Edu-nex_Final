(async()=>{
 const nav=globalThis.__localQaNodes().filter(n=>n.type?.name==='BottomNav' && typeof n.memoizedProps?.onAI==='function').at(-1);
 if(!nav)throw Error('Nex AI navigation is not available');
 await nav.memoizedProps.onAI();
 await new Promise(r=>setTimeout(r,500));
 const screen=globalThis.__localQaNodes().find(n=>n.type?.name==='AiAssistantScreen');
 if(!screen)throw Error('Nex AI did not open');
 return {screen:'AiAssistantScreen',mode:screen.memoizedProps.mode||'master',courseHint:screen.memoizedProps.activeCourseHint?._id,fixedCourse:screen.memoizedProps.fixedCourse?._id,entitlementState:screen.memoizedProps.user?.entitlementState};
})()
