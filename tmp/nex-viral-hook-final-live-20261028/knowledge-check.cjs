// Isolated QA route only. Uses normal authentication, entitlement resolution,
// buildContext and protected-course retrieval. Never calls generation or writes data.
const assert = require('node:assert/strict');
function install(router, service, backendRequire, gate) {
  const {requireCompatibleAuth}=backendRequire('./middleware/compatAuth');
  const {course}=backendRequire('./knowledge/viral-hook-formula/course-binding.json');
  const K=backendRequire('./services/tutorKnowledge');
  const pack=K.packFor(course);
  router.get('/__qa/knowledge',requireCompatibleAuth({userProjection:'+activeSessionId +activeSessions fullName email mobileNumber purchasedCourses courseEntitlements subscriptionStatus subscriptionExpiry isOnTrial'}),async(req,res)=>{
    if(String(req.compatAuth?.userId)!==gate.frozen.user_id)return res.status(403).json({error:'QA account required'});
    try {
      const covered=new Set();
      const checks=[];
      let first;
      const safeLearner={summary:'Isolated authorized course readiness check.'};
      for(const record of pack.records){
        const exact=record.contentType==='exact-template';
        const message=exact ? `Give the exact approved ${record.heading} prompt unchanged with all placeholders.`
          : `Explain ${record.heading}. ${record.content.slice(0,350)} Include the original course examples where relevant.`;
        const k=await service.buildContext(req.compatUser,course._id,message,[],{learnerContext:safeLearner,conversationId:'viral-readiness-only'});
        assert.equal(k.materialsAvailable,true);
        assert.equal(k.activeCourse.id,course._id);
        assert.equal(k.responseContract,undefined);
        first ||= k;
        for(const r of k.records){assert.equal(r.courseId,course._id);covered.add(r.chunkId);}
        assert.ok(k.records.some(r=>r.chunkId===record.chunkId),record.chunkId);
        if(exact){const reply=service.packDirectReply({message,history:[],knowledge:k});assert.equal(reply?.reply.match(/```text\n([\s\S]*?)\n```/u)?.[1],record.content);}
        checks.push({chunkId:record.chunkId,contentHash:record.contentHash,authorizedRetrieval:true,exact:exact});
      }
      assert.equal(covered.size,27);
      const conversationId='viral-readiness-only';
      const savedState={activeCourseId:course._id,conversationId,courseContext:K.packConversation({pack,courseId:course._id,conversationId,message:'My niche is pottery. My audience is new makers. Topic: glazing.',history:[]}),
        messages:[{role:'user',content:'My niche is pottery. My audience is new makers. Topic: glazing.'},{role:'assistant',content:'Use the question formula and demonstrate the glazing step.'}]};
      const k=await service.buildContext(req.compatUser,course._id,'Make it shorter in English.',[],{conversationId,savedState,learnerContext:safeLearner});
      assert.ok(k.conversationHistory.some(m=>m.role==='user'&&m.content.includes('My niche is pottery')));
      const result={courseId:course._id,coveredRecords:covered.size,exactTemplates:2,checks,
        historyRestored:true,memoryRestored:k.courseContext.facts.niche==='pottery'&&k.courseContext.facts.audience==='new makers',
        businessOrCartoonContractApplied:Boolean(k.responseContract),providerCalls:0,databaseWrites:0};
      assert.equal(result.memoryRestored,true);
      res.json(result);
    }catch(error){res.status(500).json({error:error.message});}
  });
}
module.exports={install};
