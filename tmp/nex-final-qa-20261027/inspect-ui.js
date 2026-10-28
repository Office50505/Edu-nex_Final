(() => {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const nodes = [];
  for (const id of hook.renderers.keys()) for (const root of hook.getFiberRoots(id)) {
    const q=[root.current]; while(q.length){const n=q.pop();if(!n)continue;nodes.push(n);if(n.sibling)q.push(n.sibling);if(n.child)q.push(n.child);}
  }
  globalThis.__localQaNodes = () => {
    const result=[];
    for(const id of hook.renderers.keys())for(const root of hook.getFiberRoots(id)){const q=[root.current];while(q.length){const n=q.pop();if(!n)continue;result.push(n);if(n.sibling)q.push(n.sibling);if(n.child)q.push(n.child);}}
    return result;
  };
  const unique = [];
  for (const n of nodes) {
    const p=n.memoizedProps || {};
    if (p.placeholder && typeof p.onChangeText==='function') unique.push({type:n.type?.name||String(n.type),placeholder:p.placeholder});
    if (p.accessibilityLabel && typeof p.onPress==='function') unique.push({label:p.accessibilityLabel});
  }
  return {apiBase:process.env.EXPO_PUBLIC_API_BASE,controls:unique.slice(0,40)};
})()
