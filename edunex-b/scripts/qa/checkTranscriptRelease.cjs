// Read-only, network-denied release preflight. It checks a supplied catalog
// export and packaged sources, never production credentials or live inference.
require('../../tests/helpers/deny-network.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const D=require('../../services/transcriptDataset'),F=require('../../services/fileTranscriptStore'),T=require('../../services/transcriptKnowledge');
const K=require('../../services/tutorKnowledge'),SSM=require('../../ssm-bootstrap');
function check({catalogPath=path.join(F.SUPPLEMENT,'published-catalog.json'),env=process.env}={}){
 assert.ok(!env.NEX_TRANSCRIPT_MONGODB_URI,'File-fallback release requires NEX_TRANSCRIPT_MONGODB_URI unset in host environment AND SSM');
 const expected=JSON.parse(fs.readFileSync(path.join(F.SUPPLEMENT,'published-catalog.json'))),catalog=JSON.parse(fs.readFileSync(catalogPath));
 const courses=catalog.courses.filter(c=>c.status==='published');assert.deepEqual(courses.map(c=>String(c._id)).sort(),expected.courses.map(c=>String(c._id)).sort(),'Published nine-course IDs differ from verified release');
 const index=F.loadFileTranscriptIndex(courses);assert.ok(!index.error,index.error);assert.equal(index.records.length,117);assert.equal(index.audit.mappedDocuments,108);
 const bound=D.bindRecords(index,courses);assert.equal(bound.length,117,'Production catalog/video URL/order/duration differs from verified transcript bindings');
 const lessons=[];
 for(const course of courses)for(const video of course.videos){
  const missing=course.slug==='ai-real-estate-videos'||course.slug==='ai-influencer-course'&&Number(video.order)===1;
  const result=T.retrieveTranscripts({message:`${course.title} Lesson ${video.order} transcript`,courses,authorizedCourses:courses,viewingCourse:course,viewingLesson:video,index});
  assert.ok(result.records.every(r=>r.courseId===String(course._id)&&r.lessonId===String(video._id||video.id)),'Wrong lesson source');
  if(missing){assert.equal(result.records.length,0);assert.ok(result.context.unresolved.length);}
  else assert.ok(result.records.length,course.title+' '+video.order);
  lessons.push({courseId:course._id,lessonId:video._id||video.id,status:missing?'EXPECTED_UNAVAILABLE':'PASS'});
 }
 assert.equal(lessons.length,117);assert.equal(lessons.filter(l=>l.status==='PASS').length,108);
 const estate=courses.find(c=>c.slug==='ai-real-estate-videos');assert.ok(estate&&!K.packFor(estate),'Real Estate notes must remain disabled');
 assert.ok(index.mappings.some(m=>m.status==='quarantined'&&m.documentId==='AI-Influencer:Lesson-01'));
 assert.ok(!index.records.some(r=>r.documentId==='AI-Influencer:Lesson-01'));
 assert.equal(K.isIntegratedCourse(courses.find(c=>c.slug==='ai-se-landing-page-banao')),true);
 assert.equal(K.isIntegratedCourse(courses.find(c=>c.slug==='making-an-commerce-platform-with-ai')),true);
 const pkg=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../package.json'))),lock=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../package-lock.json')));
 assert.deepEqual(pkg.dependencies,lock.packages[''].dependencies,'Dependency lock differs');
 assert.ok(pkg.dependencies['@aws-sdk/client-ssm'],'SSM startup dependency is missing');
 const requirements={productionSecretValuesRead:false,ssmRegion:SSM.SSM_REGION,ssmPath:SSM.SSM_PATH,requiredExistingParameters:SSM.REQUIRED_KEYS,googlePlayCredentialAlternatives:SSM.GOOGLE_PLAY_CREDENTIAL_KEYS,
   nexProviderKeyAlternatives:['FAL_API_KEY','FAL_KEY'],model:env.FAL_OPENROUTER_MODEL||env.FAL_GEMINI_MODEL||'google/gemini-2.5-flash',providerUrl:env.FAL_OPENROUTER_URL||'https://fal.run/openrouter/router/openai/v1/chat/completions',
   transcriptMode:'validated packaged file fallback',NEX_TRANSCRIPT_MONGODB_URI:'must be unset',nodeMinimum:'20.19.0 (locked mongoose dependency)',startup:'NODE_ENV=production SKILLOMATE_CONFIG_SOURCE=ssm SERVE_FRONTEND=false node ssm-bootstrap.js'};
 assert.equal(requirements.model,'google/gemini-2.5-flash','Provider/model changes need separate consent/readiness review');
 assert.equal(requirements.providerUrl,'https://fal.run/openrouter/router/openai/v1/chat/completions','Provider endpoint differs from verified disclosure');
 return {status:'PASS_OFFLINE',courses:courses.length,lessons:lessons.length,availableLessons:108,expectedUnavailableLessons:9,transcriptChunks:117,missingExpectedChunks:0,quarantinedTranscriptDocuments:1,
   realEstate:'8 transcripts unavailable; notes disabled',landingPageLessons:11,ecommerceLessons:13,dependencyLock:'PASS',requirements,
   productionLiveConfig:'NOT_READ',productionConnectivity:'NOT_TESTED',providerCalls:0,databaseWrites:0,lessonResults:lessons};
}
if(require.main===module){try{const at=process.argv.indexOf('--catalog'),r=check(at>=0?{catalogPath:path.resolve(process.argv[at+1])}:{});console.log(JSON.stringify(r,null,2));}catch(e){console.error(JSON.stringify({status:'BLOCKED',error:e.message,providerCalls:0,databaseWrites:0}));process.exitCode=1;}}
module.exports={check};
