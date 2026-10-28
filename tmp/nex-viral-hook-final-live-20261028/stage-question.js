(async()=>{
 const hook=globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
 const screen=()=>{for(const id of hook.renderers.keys())for(const root of hook.getFiberRoots(id)){const q=[root.current];while(q.length){const n=q.pop();if(!n)continue;if(n.type?.name==='AiAssistantScreen')return n;if(n.child)q.push(n.child);if(n.sibling)q.push(n.sibling)}}throw Error('Open Nex AI first')};
 const find=(s,predicate)=>{const q=[s.child];while(q.length){const n=q.pop();if(!n)continue;if(predicate(n))return n;if(n.child)q.push(n.child);if(n.sibling)q.push(n.sibling)}return null};
 const initial=screen(),course=initial.memoizedProps.activeCourseHint||initial.memoizedProps.fixedCourse;
 if((course?._id||course?.id)!=='6ae1b4694e1af14d4adc9e2b')throw Error('Select Viral Hook Formula first');
 const button=find(initial,n=>n.memoizedProps?.accessibilityLabel==='Start a new chat'&&typeof n.memoizedProps.onPress==='function');
 if(!button)throw Error('New chat action missing');button.memoizedProps.onPress();
 await new Promise(resolve=>setTimeout(resolve,300));
 const s=screen();const input=find(s,n=>String(n.memoizedProps?.placeholder||'').startsWith('Ask about your course')&&typeof n.memoizedProps.onChangeText==='function');
 if(!input)throw Error('Course question composer unavailable');
 const question="Mera niche analog film photography hai. Meri audience 18–25 saal ke beginner photographers hain. Mujhe ek unlabelled 35mm film roll mila hai. Maine abhi ise develop nahi kiya; mujhe nahi pata ismein kya hai ya usable photos milengi bhi ya nahi. Is reel ke liye 3 alag Hinglish curiosity hooks do. Har hook ke saath pehle 3 seconds ka visual aur reel mein honest payoff kaise deliver karun woh batao. Film exposed hai, photos clear niklengi, ya development successful hoga — yeh assume mat karo. Fake statistics ya viral hone ki guarantee mat dena. Investigation aur actual result ko interesting banao, chahe kuch usable na mile.";
 input.memoizedProps.onChangeText(question);
 await new Promise(resolve=>setTimeout(resolve,100));
 let conversationId;for(let item=screen().memoizedState;item;item=item.next)if(typeof item.memoizedState==='string'&&item.memoizedState.startsWith('nai-'))conversationId=item.memoizedState;
 return {conversationId,courseId:course._id||course.id,question,submitted:false,providerCalls:0};
})()
