const express=require('express');
const { requireCompatibleAuth }=require('../middleware/compatAuth');
const { protectAdmin }=require('../middleware/adminAuth');
const service=require('../services/certificationService');
const rules=require('../services/completionRules');
const Learning=require('../models/LearningProgress');
const Certificate=require('../models/Certificate');
const Policy=require('../models/CertificationPolicy');
const Assessment=require('../models/AssessmentResult');
const Course=require('../models/Course');
const User=require('../models/User');
const {areRateLimitsDisabled}=require('../services/rateLimitToggle');
const router=express.Router();
const auth=requireCompatibleAuth();
const run=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.statusCode||500).json({error:e.statusCode?e.message:'Could not complete certification request. Please retry.'});}};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
router.get('/certificates/print.js',(_req,res)=>res.type('application/javascript').send("document.getElementById('print')?.addEventListener('click',()=>window.print());if(new URLSearchParams(location.search).has('print'))window.print();"));
router.get('/certificates/verify/:id',run(async(req,res)=>{
  const cert=await Certificate.findOne({certificateId:req.params.id}).lean();
  if(!cert)return res.status(404).type('html').send('<h1>Certificate not found</h1>');
  res.set('Cache-Control','no-store');
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Certificate verification | Skillomate</title><style>body{font-family:Georgia,serif;background:#f5f3ec;color:#242921;padding:5vw}main{max-width:900px;margin:auto;padding:6vw;border:3px solid #b68d40;background:white;text-align:center}h1{font-size:36px}p{line-height:1.7}small{overflow-wrap:anywhere}button{padding:12px 20px;cursor:pointer}@media print{body{padding:0;background:white}button{display:none}main{border:2px solid #b68d40}@page{size:A4 landscape;margin:15mm}}</style></head><body><main><p>SKILLOMATE</p><h1>Certificate of Completion</h1><p>${cert.status==='revoked'?'REVOKED — this certificate is no longer valid':'Certificate record verified'}</p><h2>${escape(cert.userName)}</h2><p>Completed</p><h2>${escape(cert.courseTitle)}</h2><p>Issued ${escape(new Date(cert.issuedAt).toLocaleDateString('en-IN'))}</p><small>Certificate ID: ${escape(cert.certificateId)}</small><p>${cert.courseVersion?'Completion criteria: 90% lesson coverage'+(cert.criteria?.assessmentRequired?', and final assessment passed.':'.'):'Legacy completion record; issued under the earlier completion policy.'}</p><p>This certifies course completion, not professional accreditation.</p><button id="print">Print / Save as PDF</button></main><script src="/api/certificates/print.js"></script></body></html>`);
}));
router.get('/certificates',auth,run(async(req,res)=>{
  const userId=String(req.compatUser._id);
  const [certificates,courseIds]=await Promise.all([Certificate.find({userId}).sort({issuedAt:-1}).lean(),Learning.distinct('courseId',{userId})]);
  const inProgress=[];
  for(const id of courseIds.slice(0,100)) {
    try { const ctx=await service.context(req.compatUser,id);const status=await service.state(req.compatUser,ctx);inProgress.push({...status,certificateIssued:certificates.some(c=>c.courseId===id&&c.courseVersion===ctx.version&&c.status!=='revoked')}); }
    catch(e){if(e.statusCode!==404)throw e;}
  }
  res.json({certificates:certificates.map(service.certificateView),inProgress:inProgress.filter(p=>!p.certificateIssued)});
}));
router.get('/learning/:courseId',auth,run(async(req,res)=>{
  const ctx=await service.context(req.compatUser,req.params.courseId);
  res.json(await service.state(req.compatUser,ctx));
}));
router.post('/learning/:courseId/progress',auth,run(async(req,res)=>{
  const result=await service.recordPlayback({user:req.compatUser,courseId:req.params.courseId,videoId:req.body.videoId,currentTime:req.body.currentTime,duration:req.body.duration,sessionId:req.compatAuth.sessionId});
  res.json(result);
}));
router.post('/learning/:courseId/claim',auth,run(async(req,res)=>{
  const ctx=await service.context(req.compatUser,req.params.courseId),status=await service.state(req.compatUser,ctx);
  if(!status.eligible)return res.status(409).json({error:status.requirements.join(' '),eligibility:status});
  res.json({certificate:await service.issue(req.compatUser,ctx,status)});
}));
router.get('/learning/:courseId/assessment',auth,run(async(req,res)=>{
  await service.access(req.compatUser,req.params.courseId);
  const ctx=await service.context(req.compatUser,req.params.courseId);
  const status=await service.state(req.compatUser,ctx);
  if(!status.totalLessons||status.completedLessons!==status.totalLessons)throw service.fail('Complete every lesson before taking the assessment.',409);
  res.json({version:ctx.version,passPercent:70,questions:ctx.questions.map(({prompt,options})=>({prompt,options}))});
}));
router.post('/learning/:courseId/assessment',auth,run(async(req,res)=>{
  await service.access(req.compatUser,req.params.courseId);
  const ctx=await service.context(req.compatUser,req.params.courseId),before=await service.state(req.compatUser,ctx);
  if(!before.totalLessons||before.completedLessons!==before.totalLessons)throw service.fail('Complete every lesson before taking the assessment.',409);
  if(req.body.version!==ctx.version)throw service.fail('Course criteria changed. Reload the assessment.',409);
  const answers=req.body.answers;
  if(!ctx.questions.length||!Array.isArray(answers)||answers.length!==ctx.questions.length||answers.some((a,i)=>!Number.isInteger(a)||a<0||a>=ctx.questions[i].options.length))throw service.fail('Answer every assessment question.');
  const _id=rules.identity(req.compatUser._id,ctx.course._id,ctx.version);
  const score=Math.round(100*ctx.questions.filter((q,i)=>q.answer===answers[i]).length/ctx.questions.length);
  try { await Assessment.updateOne({_id},{$setOnInsert:{userId:String(req.compatUser._id),courseId:String(ctx.course._id),version:ctx.version}},{upsert:true}); } catch(e){if(e.code!==11000)throw e;}
  const result=await Assessment.findOneAndUpdate(areRateLimitsDisabled()?{_id}:{_id,$or:[{lastAttemptAt:{$lt:new Date(Date.now()-30000)}},{lastAttemptAt:null}]},{$set:{lastAttemptAt:new Date()},$max:{score,passed:score>=70}},{new:true}).lean();
  if(!result)throw service.fail('Wait 30 seconds before submitting again.',429);
  const status=await service.state(req.compatUser,ctx);
  res.json({score,passed:score>=70,eligibility:status,certificate:await service.issue(req.compatUser,ctx,status)});
}));
router.get('/admin/certifications',protectAdmin,run(async(req,res)=>{
  const page=Math.max(1,Math.min(10000,parseInt(req.query.page,10)||1));
  const [certificates,total,courses]=await Promise.all([Certificate.find().sort({issuedAt:-1}).skip((page-1)*25).limit(25).select('-userEmail').lean(),Certificate.countDocuments(),Course.find().select('title status videos._id videos.title videos.duration').limit(500).lean()]);
  const learners = await Learning.aggregate([{ $group: { _id: { userId: '$userId', courseId: '$courseId' }, updatedAt: { $max: '$updatedAt' } } }, { $sort: { updatedAt: -1 } }, { $skip: (page-1)*25 }, { $limit: 25 }]);
  const progress = [];
  for (const row of learners) {
    const user = await User.findById(row._id.userId).select('fullName isMobileVerified').lean();
    if (!user) continue;
    try { const ctx = await service.context(user,row._id.courseId); progress.push({ learnerName: user.fullName, updatedAt: row.updatedAt, ...await service.state(user,ctx) }); }
    catch(e) { if(e.statusCode!==404)throw e; }
  }
  res.json({certificates:certificates.map(c=>({...service.certificateView(c),audit:c.audit||[]})),total,page,courses,progress});
}));
router.patch('/admin/certifications/:id',protectAdmin,run(async(req,res)=>{
  const {action,reason}=req.body;
  if(!['revoke','restore'].includes(action)||typeof reason!=='string'||reason.trim().length<5||reason.length>500)throw service.fail('Choose an action and provide a reason (5–500 characters).');
  const cert=await Certificate.findOneAndUpdate({certificateId:req.params.id},{$set:{status:action==='revoke'?'revoked':'active'},$push:{audit:{action,reason:reason.trim(),at:new Date(),actor:String(req.admin.id||req.admin.username||'admin')}}},{new:true}).lean();
  if(!cert)throw service.fail('Certificate not found',404);
  res.json({certificate:service.certificateView(cert)});
}));
router.get('/admin/certification-policy/:id',protectAdmin,run(async(req,res)=>{
  const course=await Course.findById(req.params.id).select('title videos').lean();if(!course)throw service.fail('Course not found',404);
  const policy=await Policy.findById(req.params.id).lean();res.json({course,questions:policy?.questions||[]});
}));
router.put('/admin/certification-policy/:id',protectAdmin,run(async(req,res)=>{
  const questions=req.body.questions;
  if(!Array.isArray(questions)||questions.length>30||questions.some(q=>typeof q.prompt!=='string'||!q.prompt.trim()||q.prompt.length>1000||!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some(o=>typeof o!=='string'||!o.trim()||o.length>300)||!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length))throw service.fail('Invalid assessment. Use up to 30 questions with 2–6 choices and one correct answer.');
  const course=await Course.findById(req.params.id);if(!course)throw service.fail('Course not found',404);
  const durations=req.body.durations;
  if(!Array.isArray(durations)||durations.length!==course.videos.length||durations.some(d=>!Number.isFinite(d)||d<=0||d>86400))throw service.fail('Set every lesson duration in seconds (1–86400).');
  course.videos.forEach((v,i)=>{v.duration=durations[i];});await course.save();
  await Policy.updateOne({_id:String(course._id)},{$set:{questions:questions.map(q=>({prompt:q.prompt.trim(),options:q.options.map(o=>o.trim()),answer:q.answer}))}},{upsert:true});
  res.json({message:'Certification criteria saved. Changed lesson durations or assessments start a new criteria version; existing certificates stay valid.'});
}));
module.exports=router;
