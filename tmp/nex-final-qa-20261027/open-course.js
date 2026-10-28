(async()=>{
 const nodes=globalThis.__localQaNodes();
 const control=nodes.find(n=>n.memoizedProps?.accessibilityLabel==='Start learning AI Local Buisness ADS' && typeof n.memoizedProps.onPress==='function');
 if(!control)throw Error('Course control not found');
 await control.memoizedProps.onPress();
 await new Promise(r=>setTimeout(r,500));
 return globalThis.__localQaNodes().filter(n=>n.memoizedProps?.accessibilityLabel&&typeof n.memoizedProps.onPress==='function').map(n=>({label:n.memoizedProps.accessibilityLabel})).slice(0,50);
})()
