(() => {
 const nodes=globalThis.__localQaNodes();
 const controls=nodes.filter(n=>typeof n.memoizedProps?.onPress==='function').map(n=>({type:n.type?.name,label:n.memoizedProps.accessibilityLabel,children:typeof n.memoizedProps.children==='string'?n.memoizedProps.children:undefined}));
 const components=nodes.filter(n=>n.type?.name&&(/Course|Home|Bottom|Nav|Tab|AiAssistant/.test(n.type.name))).map(n=>({type:n.type.name,functions:Object.keys(n.memoizedProps||{}).filter(k=>typeof n.memoizedProps[k]==='function'),userId:n.memoizedProps.user?._id}));
 return {controls:controls.filter(c=>/nex|ai|course|back|chat/i.test(c.label||c.children||'')).slice(-50),components};
})()
