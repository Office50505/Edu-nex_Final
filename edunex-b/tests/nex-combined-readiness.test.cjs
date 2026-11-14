require('./helpers/deny-network.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const K=require('../services/tutorKnowledge'),T=require('../services/transcriptKnowledge'),D=require('../services/transcriptDataset');
const {courseTutorRequest}=require('../services/courseTutorRequest');
const U=require('../services/unifiedTutorKnowledge');
const root=path.resolve(__dirname,'../../reports/nex-final-combined-live-qa-2026-11-14');
const cases=JSON.parse(fs.readFileSync(path.join(root,'questions.json'))).questions;
const courses=JSON.parse(fs.readFileSync(path.join(root,'verified-catalog.json'))).courses;
test('EC-2 retrieves the canonical named stored message alongside customized advice',()=>{
  const q=cases.find(q=>q.id==='EC-2'),course=courses.find(c=>c._id===q.courseId);
  const request=courseTutorRequest(q.question);
  assert.equal(request.copyRequested,true);assert.equal(request.directCopy,false);
  const selected=K.findPackTemplate(K.packFor(course),q.question);
  assert.equal(selected.contentHash,q.sourceExpectations.exactPrompt.bodyHash);
  const knowledge=K.retrieveKnowledge({courses:[course],activeCourse:course,activeLesson:course.videos[6],message:q.question,history:[],includeMaterials:true,authorizedCourses:[course]});
  assert.ok(knowledge.retrievedItems.some(r=>r.chunkId===selected.chunkId));
});
test('customized precise prompts without an explicit stored-message copy remain customized',()=>{
  const q=courseTutorRequest('Write an exact prompt for my Apps Script checkout. Customize it for my store.');
  assert.equal(q.copyRequested,false);assert.equal(q.directCopy,false);
});
test('INF-2 exclusion does not request the quarantined introduction',()=>{
  const q=cases.find(q=>q.id==='INF-2'),course=courses.find(c=>c._id===q.courseId),index=D.loadIndex();
  const result=T.retrieveTranscripts({message:q.question,history:[],courses,viewingCourse:course,viewingLesson:course.videos[4],index});
  assert.deepEqual(result.context.unresolved,[]);
  assert.ok(!result.context.targets.some(t=>t.videoId===course.videos[0]._id));
  assert.ok(result.records.every(r=>r.documentId!=='AI-Influencer:Lesson-01'));
});
test('positive quarantine requests still fail closed; adjacent affirmative lessons remain usable',()=>{
  const course=courses.find(c=>c.slug==='ai-influencer-course'),index=D.loadIndex();
  const args={courses,viewingCourse:course,viewingLesson:course.videos[4],index};
  const missing=T.retrieveTranscripts({...args,message:'AI Influencer lesson 1 transcript'});
  assert.equal(missing.records.length,0);assert.ok(missing.context.unresolved.length);
  for(const message of ['Do not use AI Influencer lesson 1; explain AI Influencer lesson 5 transcript.',
    'AI Influencer lesson 1 ko evidence mat banao. Explain AI Influencer lesson 5 transcript.']){
    const result=T.retrieveTranscripts({...args,message});
    assert.equal(result.context.unresolved.length,0);assert.ok(result.records.length);
    assert.ok(result.records.every(r=>r.documentId==='AI-Influencer:Lesson-05'));
  }
});
test('missing Real Estate notes and transcripts are explicitly unavailable, not borrowed from another course',()=>{
  const knowledge={unifiedAccess:{policy:'nex-ai-all-integrated-v1',unavailableMentions:[{title:'AI Real Estate Videos'}]},
    transcriptContext:{requested:true,selectedChunkIds:[],unresolved:[{courseName:'AI Real Estate Videos',reason:'transcript_missing_or_media_changed'}]}};
  const result=U.unifiedDirectReply({message:'Is lesson mein 00:30 par instructor ne kya kaha?',history:[],knowledge,tools:K});
  assert.match(result.reply,/verified transcript is unavailable/);assert.match(result.reply,/notes and approved prompts are also not enabled/);
  const notes=U.unifiedDirectReply({message:'Explain this property lesson from notes.',history:[],knowledge:{...knowledge,transcriptContext:{requested:false}},tools:K});
  assert.match(notes.reply,/not enabled for retrieval/);
});
