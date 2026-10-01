const mongoose = require('mongoose');
const crypto = require('node:crypto');
const Course = require('../models/Course');
const Policy = require('../models/CertificationPolicy');
const Learning = require('../models/LearningProgress');
const Assessment = require('../models/AssessmentResult');
const Certificate = require('../models/Certificate');
const CourseProgress = require('../models/CourseProgress');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const { resolveSubscriptionAccess } = require('./subscriptionAccess');
const { activeCourseEntitlement } = require('./courseAccess');
const featureSettings = require('./adminFeatureSettings');
const rules = require('./completionRules');
const fail = (message,statusCode=400) => Object.assign(new Error(message),{statusCode});
async function context(user, courseId) {
  if(!mongoose.Types.ObjectId.isValid(courseId)) throw fail('Invalid course id');
  const course = await Course.findOne({_id:courseId,status:'published'}).select('-thumbnail -thumbnailHorizontal -thumbnailVertical -videos.thumbnail').lean();
  if(!course) throw fail('Published course not found',404);
  const policy = await Policy.findById(String(courseId)).lean();
  return { course, ...rules.manifest(course,policy) };
}
async function access(user, courseId = null) {
  if (activeCourseEntitlement(user,courseId)) return;
  const sub=await Subscription.findOne({user:user._id}).lean();
  if(!resolveSubscriptionAccess(sub,user).active) throw fail('An active learning entitlement is required.',403);
}
async function state(user, ctx) {
  const userId=String(user._id), courseId=String(ctx.course._id);
  const [rows,assessment] = await Promise.all([Learning.find({userId,courseId,version:ctx.version}).lean(),Assessment.findById(rules.identity(userId,courseId,ctx.version)).lean()]);
  const eligibility = rules.eligibility({...ctx,rows,user,assessment});
  const certificationEnabled = await featureSettings.certificationIsEnabled();
  return {
    ...eligibility,
    eligible: certificationEnabled ? eligibility.eligible : false,
    certificationEnabled,
    watchMore: !certificationEnabled && eligibility.completedLessons === eligibility.totalLessons,
    requirements: certificationEnabled ? eligibility.requirements : ['More learning is available. Continue with recommended lessons.'],
    courseId,
    courseTitle:ctx.course.title,
    version:ctx.version,
  };
}
function certificateView(c) { return {_id:String(c._id),certificateId:c.certificateId,courseId:c.courseId,courseTitle:c.courseTitle,courseVersion:c.courseVersion,userName:c.userName,learnerName:c.userName,issuedAt:c.issuedAt,status:c.status || 'active',totalLessons:c.totalLessons || 0,criteria:c.criteria}; }
async function issue(user,ctx,status) {
  if(status.certificationEnabled === false || !(await featureSettings.certificationIsEnabled())) return null;
  if(!status.eligible) return null;
  const key=rules.identity(user._id,ctx.course._id,ctx.version);
  const _id=new mongoose.Types.ObjectId(key.slice(0,24));
  // The primary-key uniqueness guarantee makes retries/concurrent issuance idempotent without an index migration.
  const value={certificateId:crypto.randomBytes(16).toString('hex').toUpperCase(),userId:String(user._id),courseId:String(ctx.course._id),courseTitle:ctx.course.title,userName:user.fullName,userEmail:user.email || '',issuedAt:new Date(),status:'active',courseVersion:ctx.version,totalLessons:status.totalLessons,criteria:{coverage:90,assessmentRequired:status.assessmentRequired,score:status.assessmentScore}};
  let cert;
  try { cert=await Certificate.findOneAndUpdate({_id},{$setOnInsert:value},{upsert:true,new:true}).lean(); }
  catch(error) { if(error.code!==11000) throw error; cert=await Certificate.findById(_id).lean(); }
  return certificateView(cert);
}
async function sync(user,ctx,status,lastWatchedVideoId=null) {
  const completedVideoIds=status.lessons.filter(l=>l.complete).map(l=>l.id);
  const progress={userId:String(user._id),courseId:String(ctx.course._id),courseTitle:ctx.course.title,userName:user.fullName || '',userEmail:user.email || '',userMobileNumber:user.mobileNumber || '',completedVideoIds,completedCount:completedVideoIds.length,totalVideos:status.totalLessons,progressPercent:Number(status.progressPercent || 0),videoProgress:Object.fromEntries(status.lessons.map(l=>[l.id.replace(/[.$]/g,'_'),{videoId:l.id,watchedSeconds:l.watchedSeconds,durationSeconds:l.duration,resumePosition:l.resumePosition,percent:l.percent}])),updatedAt:new Date()};
  if(lastWatchedVideoId) {
    progress.lastWatchedVideoId=String(lastWatchedVideoId);
    if(completedVideoIds.includes(String(lastWatchedVideoId)))progress.lastCompletedVideoId=String(lastWatchedVideoId);
  }
  await CourseProgress.updateOne({userId:progress.userId,courseId:progress.courseId},{$set:progress},{upsert:true});
  await User.updateOne({_id:user._id},{$set:{[`courseProgress.${ctx.course._id}`]:progress,lastActiveAt:new Date()}});
  return progress;
}
async function migrateLearningVersion(courseId, previousVersion, nextVersion) {
  if (!previousVersion || !nextVersion || previousVersion === nextVersion) return 0;
  const rows = await Learning.find({ courseId: String(courseId), version: previousVersion }).lean();
  if (!rows.length) return 0;
  const validVideoIds = new Set((await Course.findById(courseId).select('videos._id').lean())?.videos?.map(video => String(video._id)) || []);
  const operations = rows.filter(row => validVideoIds.has(String(row.videoId))).map(row => ({
    updateOne: {
      filter: { _id: rules.identity(row.userId, courseId, nextVersion, row.videoId) },
      update: { $setOnInsert: {
        userId: row.userId,
        courseId: String(courseId),
        version: nextVersion,
        videoId: row.videoId,
        intervals: row.intervals || [],
        position: Number(row.position) || 0,
        lastSeenAt: row.lastSeenAt,
        sessionId: row.sessionId,
        revision: Number(row.revision) || 0,
      } },
      upsert: true,
    },
  }));
  if (!operations.length) return 0;
  const result = await Learning.bulkWrite(operations, { ordered: false });
  return Number(result.upsertedCount || 0);
}
async function recordPlayback({ user,courseId,videoId,currentTime,duration,sessionId }) {
  await access(user,courseId);
  let ctx=await context(user,courseId);
  let index=ctx.course.videos.findIndex((v,i)=>[rules.videoKey(v,i),v.bunnyGuid,v.bunnyVideoId,v.youtubeId,String(i)].filter(v=>v!=null).map(String).includes(String(videoId)));
  if(index<0) throw fail('Lesson does not belong to this course',404);
  const reportedDuration=Number(duration);
  if(Number(ctx.videos[index]?.duration||0)<=0) {
    const previousVersion=ctx.version;
    if(!Number.isFinite(reportedDuration)||reportedDuration<1||reportedDuration>86400) throw fail('The player could not determine this lesson duration. Reload the video and retry.',400);
    await Course.updateOne({_id:ctx.course._id},{$set:{[`videos.${index}.duration`]:Math.round(reportedDuration*100)/100}});
    ctx=await context(user,courseId);
    await migrateLearningVersion(courseId,previousVersion,ctx.version);
    index=ctx.course.videos.findIndex((v,i)=>[rules.videoKey(v,i),v.bunnyGuid,v.bunnyVideoId,v.youtubeId,String(i)].filter(v=>v!=null).map(String).includes(String(videoId)));
  }
  const video=ctx.videos[index];
  const _id=rules.identity(user._id,courseId,ctx.version,video.id);
  let saved=false, previousCoverage=0, nextCoverage=0;
  for(let attempt=0;attempt<4;attempt++) {
    let old=await Learning.findById(_id).lean();
    if(!old) {
      try { await Learning.create({_id,userId:String(user._id),courseId:String(courseId),version:ctx.version,videoId:video.id,revision:0}); }
      catch(e) { if(e.code!==11000) throw e; }
      old=await Learning.findById(_id).lean();
    }
    const next=rules.heartbeat(old,{position:Number(currentTime),duration:video.duration,now:Date.now(),sessionId:String(sessionId || 'legacy')});
    const result=await Learning.updateOne({_id,revision:old.revision},{$set:next,$inc:{revision:1}});
    if(result.modifiedCount) {saved=true;previousCoverage=rules.covered(old.intervals,video.duration);nextCoverage=rules.covered(next.intervals,video.duration);break;}
  }
  if(!saved) throw fail('Progress changed concurrently. Retry the next update.',409);
  const status=await state(user,ctx);
  const progress=await sync(user,ctx,status,video.id);
  const events=[];
  if(previousCoverage<10 && nextCoverage>=10)events.push('video_start');
  if(previousCoverage/video.duration<0.9 && nextCoverage/video.duration>=0.9)events.push('video_complete');
  if(status.totalLessons>0 && status.completedLessons===status.totalLessons)events.push('course_complete');
  for(const event of events) {
    const eventId=new mongoose.Types.ObjectId(rules.identity(event,user._id,courseId,ctx.version,event==='course_complete'?'course':video.id).slice(0,24));
    await AnalyticsEvent.updateOne({_id:eventId},{$setOnInsert:{event,userId:String(user._id),courseId:String(courseId),courseTitle:ctx.course.title,videoId:video.id,watchedSeconds:nextCoverage,durationSeconds:video.duration,date:new Date().toISOString().slice(0,10),createdAt:new Date()}},{upsert:true}).catch(()=>{});
  }
  return {courseId:String(courseId),progress,eligibility:status,certificate:await issue(user,ctx,status)};
}
async function completeVideo({user,courseId,videoId}) {
  await access(user,courseId);const ctx=await context(user,courseId),status=await state(user,ctx);
  const lesson=status.lessons.find(l=>l.id===String(videoId));
  if(!lesson?.complete) throw fail('Watch at least 90% of this lesson before completing it.',409);
  return {courseId:String(courseId),progress:await sync(user,ctx,status,videoId),eligibility:status,certificate:await issue(user,ctx,status)};
}
module.exports={context,state,access,issue,sync,migrateLearningVersion,recordPlayback,completeVideo,certificateView,fail};
