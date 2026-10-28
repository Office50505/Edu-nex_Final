(async()=>{
 const screen=globalThis.__localQaNodes().find(n=>n.type?.name==='AiAssistantScreen');
 if(!screen)throw Error('Nex AI must remain open');
 const session=screen.memoizedProps.session;
 await session.flush();
 const owner=session.getUser();
 const subscription=await session.requestJson('/api/user/'+owner._id+'/subscription');
 const status=await session.requestJson('/__manual_qa/status');
 const courses=await session.requestJson('/api/ai/courses');
 return {sessionPersistenceFlushed:true,authenticated:owner._id==='6addcefc5d47d548973c29b9',entitlementState:subscription.entitlementState,entitlementSource:subscription.entitlementSource,courseIndexed:courses.some(c=>c.id==='6ad9fe8ed0076b8d5e3b4f6d'),sourceRevisionSHA256:status.sourceRevisionSHA256,approved:status.approved,remainingProviderAttempts:status.remainingProviderAttempts};
})()
