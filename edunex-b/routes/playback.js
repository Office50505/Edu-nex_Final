const express=require('express');
const {requireCompatibleAuth,isSessionValidForUser}=require('../middleware/compatAuth');
const {protectAdmin}=require('../middleware/adminAuth');
const {access}=require('../services/certificationService');
const Course=require('../models/Course');
const User=require('../models/User');
const {inferProvider,validateSource,cloudFrontHost}=require('../services/videoSources');
const cf=require('../services/cloudFrontPlayback');
const router=express.Router();
const run=fn=>async(req,res)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');try{await fn(req,res);}catch(error){res.status(error.statusCode||502).json({error:error.statusCode?error.message:'Playback could not be authorized. Check the backend video configuration.'});}};
router.get('/admin/video-providers',protectAdmin,(_req,res)=>res.json({cloudFrontHost:cloudFrontHost(),accessMode:process.env.CLOUDFRONT_ACCESS_MODE||'private'}));
router.post('/admin/video-metadata',protectAdmin,run(async(req,res)=>{
  res.json(await require('../services/videoMetadata').inspectVideo(req.body));
}));
router.post('/admin/playback-preview',protectAdmin,run(async(req,res)=>{
  const video=validateSource(req.body);
  if(video.provider==='aws_cloudfront')res.json(cf.issueGrant(video.videoUrl,{preview:true}));
  else res.json(video);
}));
router.post('/courses/:courseId/videos/:videoId/playback-access',requireCompatibleAuth({userProjection:'_id isActive subscriptionStatus subscriptionExpiry purchasedCourses courseEntitlements +activeSessionId'}),run(async(req,res)=>{
  const [,course]=await Promise.all([
    access(req.compatUser,req.params.courseId),
    Course.findOne({_id:req.params.courseId,status:'published'}).select('_id videos._id videos.provider videos.sourceType videos.videoUrl videos.embedUrl videos.bunnyVideoId videos.bunnyLibraryId videos.youtubeId videos.hlsUrl videos.playlistUrl videos.streamUrl').lean(),
  ]);
  if(!course)return res.status(404).json({error:'Published course not found.'});
  const video=course.videos.find(v=>String(v._id)===req.params.videoId);
  if(!video)return res.status(404).json({error:'Lesson does not belong to this course.'});
  if(inferProvider(video)!=='aws_cloudfront')return res.json(require('../services/mobileCompatibilityService').publicPlayableVideoInfo(video));
  res.json(cf.issueGrant(video.videoUrl,{userId:String(req.compatUser._id),sessionId:req.compatAuth.sessionId,courseId:String(course._id),videoId:String(video._id)}));
}));
router.get('/playback/hls.m3u8',run(async(req,res)=>{
  let grant;try{grant=cf.decodeGrant(req.query.grant);}catch{return res.status(401).json({error:'Playback access expired. Reload or renew playback.'});}
  if(!grant.preview){
    const user=await User.findById(grant.userId).select('_id isActive subscriptionStatus subscriptionExpiry purchasedCourses courseEntitlements +activeSessionId').lean();
    if(!user||user.isActive===false||!await isSessionValidForUser(user,grant.sessionId))return res.status(401).json({error:'Playback session is no longer active.'});
    const [,course]=await Promise.all([
      access(user,grant.courseId),
      Course.findOne({_id:grant.courseId,status:'published','videos._id':grant.videoId}).select('_id videos._id videos.provider videos.sourceType videos.videoUrl').lean(),
    ]);
    if(!course)return res.status(403).json({error:'Course or lesson is no longer available.'});
    const video=course.videos.find(v=>String(v._id)===grant.videoId);
    if(inferProvider(video)!=='aws_cloudfront'||video.videoUrl!==grant.reference)return res.status(403).json({error:'Video reference changed. Renew playback.'});
  }
  res.type('application/vnd.apple.mpegurl').send(await cf.fetchPlaylist(grant));
}));
module.exports=router;
