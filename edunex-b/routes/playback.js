const express=require('express');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {requireCompatibleAuth,isSessionValidForUser}=require('../middleware/compatAuth');
const {protectAdmin, protectAdminRead}=require('../middleware/adminAuth');
const {access}=require('../services/certificationService');
const Course=require('../models/Course');
const User=require('../models/User');
const {inferProvider,validateSource,cloudFrontHost}=require('../services/videoSources');
const cf=require('../services/cloudFrontPlayback');
const router=express.Router();
const cloudDownloadJobs = new Map();
const CLOUD_DOWNLOAD_JOB_TTL_MS = 20 * 60 * 1000;
const run=fn=>async(req,res)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');try{await fn(req,res);}catch(error){res.status(error.statusCode||502).json({error:error.statusCode?error.message:'Playback could not be authorized. Check the backend video configuration.'});}};
function requestOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${String(proto).split(',')[0]}://${req.get('host')}`;
}
function removeCloudDownloadJob(jobId) {
  const job = cloudDownloadJobs.get(jobId);
  if(!job) return;
  cloudDownloadJobs.delete(jobId);
  if(job.cleanupTimer) clearTimeout(job.cleanupTimer);
  if(job.ffmpeg && job.status === 'preparing') job.ffmpeg.kill('SIGTERM');
  if(job.tmpDir) fs.rm(job.tmpDir, { recursive: true, force: true }).catch(() => {});
}
async function startCloudDownloadJob({ grant, grantToken, origin }) {
  const existing = [...cloudDownloadJobs.values()].find(job =>
    job.status === 'preparing' &&
    job.userId === grant.userId &&
    job.courseId === grant.courseId &&
    job.videoId === grant.videoId &&
    job.reference === grant.reference
  );
  if(existing) return existing;
  const jobId = crypto.randomUUID();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillomate-download-'));
  const outputPath = path.join(tmpDir, 'lesson.mp4');
  const hlsUrl = new URL(`/api/playback/hls.m3u8?grant=${encodeURIComponent(grantToken)}`, origin).href;
  const job = {
    id: jobId, status: 'preparing', size: 0, error: '',
    userId: grant.userId, courseId: grant.courseId, videoId: grant.videoId,
    reference: grant.reference, tmpDir, outputPath, createdAt: Date.now(),
  };
  job.cleanupTimer = setTimeout(() => removeCloudDownloadJob(jobId), CLOUD_DOWNLOAD_JOB_TTL_MS);
  cloudDownloadJobs.set(jobId, job);
  const ffmpeg = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-i', hlsUrl,
    '-map', '0:v:0?',
    '-map', '0:a:0?',
    '-c', 'copy',
    '-movflags', '+faststart',
    '-f', 'mp4',
    outputPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  job.ffmpeg = ffmpeg;
  let stderr = '';
  ffmpeg.stderr.on('data', chunk => { stderr += chunk.toString(); if(stderr.length > 2000) stderr = stderr.slice(-2000); });
  ffmpeg.on('error', () => {
    job.status = 'error';
    job.error = 'Offline download conversion is not configured on the server.';
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });
  ffmpeg.on('close', async code => {
    job.ffmpeg = null;
    if(code!==0) {
      job.status = 'error';
      job.error = 'Video could not be prepared for offline download.';
      if(stderr) console.warn('[cloud-download] ffmpeg failed:', stderr);
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      return;
    }
    try {
      const stat = await fs.stat(outputPath);
      if(!stat.isFile() || stat.size < 1024 * 1024) {
        job.status = 'error';
        job.error = 'Video could not be prepared completely for offline download.';
        fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        return;
      }
      job.size = stat.size;
      job.status = 'ready';
    } catch(error) {
      job.status = 'error';
      job.error = 'Video could not be prepared for offline download.';
      fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });
  return job;
}
async function authorizedCloudFrontVideo(req, res) {
  const [,course]=await Promise.all([
    access(req.compatUser,req.params.courseId),
    Course.findOne({_id:req.params.courseId,status:'published'}).select('_id title videos._id videos.title videos.provider videos.sourceType videos.videoUrl').lean(),
  ]);
  if(!course) {
    res.status(404).json({error:'Published course not found.'});
    return null;
  }
  const video=course.videos.find(v=>String(v._id)===req.params.videoId);
  if(!video) {
    res.status(404).json({error:'Lesson does not belong to this course.'});
    return null;
  }
  if(inferProvider(video)!=='aws_cloudfront') {
    res.status(400).json({error:'This lesson does not use CloudFront download.'});
    return null;
  }
  return { course, video };
}
router.get('/admin/video-providers',protectAdmin,(_req,res)=>res.json({cloudFrontHost:cloudFrontHost(),accessMode:process.env.CLOUDFRONT_ACCESS_MODE||'private'}));
router.post('/admin/video-metadata',protectAdminRead,run(async(req,res)=>{
  res.json(await require('../services/videoMetadata').inspectVideo(req.body));
}));
router.post('/admin/playback-preview',protectAdminRead,run(async(req,res)=>{
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
router.post('/courses/:courseId/videos/:videoId/download-grant',requireCompatibleAuth({userProjection:'_id isActive subscriptionStatus subscriptionExpiry purchasedCourses courseEntitlements +activeSessionId'}),run(async(req,res)=>{
  const result = await authorizedCloudFrontVideo(req, res);
  if(!result) return;
  const grant = cf.issueGrant(result.video.videoUrl,{
    userId:String(req.compatUser._id),
    sessionId:req.compatAuth.sessionId,
    courseId:String(result.course._id),
    videoId:String(result.video._id),
    download:true,
  });
  const grantToken = new URL(grant.hlsUrl,'https://local.invalid').searchParams.get('grant');
  const directDownloadUrl = `/api/courses/${encodeURIComponent(String(result.course._id))}/videos/${encodeURIComponent(String(result.video._id))}/download.mp4?grant=${encodeURIComponent(grantToken)}`;
  const shouldPrepare = req.body?.prepared === true;
  const job = shouldPrepare ? await startCloudDownloadJob({ grant: cf.decodeGrant(grantToken), grantToken, origin: requestOrigin(req) }) : null;
  res.json({
    downloadUrl: job ? `${directDownloadUrl}&job=${encodeURIComponent(job.id)}` : directDownloadUrl,
    directDownloadUrl,
    statusUrl: job ? `/api/courses/${encodeURIComponent(String(result.course._id))}/videos/${encodeURIComponent(String(result.video._id))}/download-status?grant=${encodeURIComponent(grantToken)}&job=${encodeURIComponent(job.id)}` : '',
    expiresAt:grant.expiresAt,
  });
}));
router.get('/courses/:courseId/videos/:videoId/download-status',async(req,res)=>{
  res.set('Cache-Control','no-store');
  res.set('Referrer-Policy','no-referrer');
  let grant;
  try {
    grant=cf.decodeGrant(req.query.grant);
  } catch {
    return res.status(401).json({error:'Download access expired. Start the download again.'});
  }
  const job = cloudDownloadJobs.get(String(req.query.job || ''));
  if(!grant.download || grant.courseId!==req.params.courseId || grant.videoId!==req.params.videoId || !job) {
    return res.status(404).json({error:'Download preparation was not found. Start the download again.'});
  }
  if(job.userId!==grant.userId || job.courseId!==grant.courseId || job.videoId!==grant.videoId || job.reference!==grant.reference) {
    return res.status(403).json({error:'Download preparation is invalid.'});
  }
  res.json({status:job.status,size:job.size||0,error:job.error||''});
});
router.get('/courses/:courseId/videos/:videoId/download.mp4',async(req,res)=>{
  res.set('Cache-Control','no-store');
  res.set('Referrer-Policy','no-referrer');
  let grant;
  try {
    grant=cf.decodeGrant(req.query.grant);
  } catch {
    return res.status(401).json({error:'Download access expired. Start the download again.'});
  }
  if(!grant.download || grant.courseId!==req.params.courseId || grant.videoId!==req.params.videoId) {
    return res.status(403).json({error:'Download authorization is invalid.'});
  }
  try {
    const user=await User.findById(grant.userId).select('_id isActive subscriptionStatus subscriptionExpiry purchasedCourses courseEntitlements +activeSessionId').lean();
    if(!user||user.isActive===false||!await isSessionValidForUser(user,grant.sessionId))return res.status(401).json({error:'Download session is no longer active.'});
    const [,course]=await Promise.all([
      access(user,grant.courseId),
      Course.findOne({_id:grant.courseId,status:'published','videos._id':grant.videoId}).select('_id title videos._id videos.title videos.provider videos.sourceType videos.videoUrl').lean(),
    ]);
    if(!course)return res.status(403).json({error:'Course or lesson is no longer available.'});
    const video=course.videos.find(v=>String(v._id)===grant.videoId);
    if(inferProvider(video)!=='aws_cloudfront'||video.videoUrl!==grant.reference)return res.status(403).json({error:'Video reference changed. Start the download again.'});

    const job = cloudDownloadJobs.get(String(req.query.job || ''));
    if(job) {
      if(job.userId!==grant.userId || job.courseId!==grant.courseId || job.videoId!==grant.videoId || job.reference!==grant.reference) {
        return res.status(403).json({error:'Download preparation is invalid.'});
      }
      if(job.status === 'error') return res.status(502).json({error:job.error || 'Video could not be prepared for offline download.'});
      if(job.status !== 'ready') return res.status(425).json({error:'Video is still being prepared. Please retry shortly.'});
      const filename = `${String(video.title || 'lesson').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60) || 'lesson'}.mp4`;
      res.setHeader('Content-Type','video/mp4');
      res.setHeader('Content-Length',String(job.size || (await fs.stat(job.outputPath)).size));
      res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
      return res.sendFile(job.outputPath, error => {
        if(error && !res.headersSent) res.status(502).json({error:'Video could not be sent for offline download.'});
      });
    }

    const hlsUrl = new URL(`/api/playback/hls.m3u8?grant=${encodeURIComponent(req.query.grant)}`, requestOrigin(req)).href;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillomate-download-'));
    const outputPath = path.join(tmpDir, 'lesson.mp4');
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-nostdin',
      '-i', hlsUrl,
      '-map', '0:v:0?',
      '-map', '0:a:0?',
      '-c', 'copy',
      '-movflags', '+faststart',
      '-f', 'mp4',
      outputPath,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let conversionComplete = false;
    let responseComplete = false;
    const cleanup = () => fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    const filename = `${String(video.title || 'lesson').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60) || 'lesson'}.mp4`;
    ffmpeg.stderr.on('data', chunk => { stderr += chunk.toString(); if(stderr.length > 2000) stderr = stderr.slice(-2000); });
    ffmpeg.on('error', error => {
      cleanup();
      if(!res.headersSent) res.status(503).json({error:'Offline download conversion is not configured on the server.'});
      else res.destroy(error);
    });
    ffmpeg.on('close', async code => {
      conversionComplete = code === 0;
      if(code!==0) {
        cleanup();
        if(!res.headersSent) res.status(502).json({error:'Video could not be prepared for offline download.'});
        else res.destroy(new Error(stderr || `ffmpeg exited with code ${code}`));
        return;
      }
      try {
        const stat = await fs.stat(outputPath);
        if(!stat.isFile() || stat.size < 1024 * 1024) {
          cleanup();
          return res.status(502).json({error:'Video could not be prepared completely for offline download.'});
        }
        res.setHeader('Content-Type','video/mp4');
        res.setHeader('Content-Length',String(stat.size));
        res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
        res.sendFile(outputPath, error => {
          responseComplete = true;
          cleanup();
          if(error && !res.headersSent) res.status(502).json({error:'Video could not be sent for offline download.'});
        });
      } catch(error) {
        cleanup();
        if(!res.headersSent) res.status(502).json({error:'Video could not be prepared for offline download.'});
        else res.destroy(error);
      }
    });
    res.on('close', () => {
      if(!conversionComplete) ffmpeg.kill('SIGTERM');
      if(responseComplete || !res.writableEnded) cleanup();
    });
  } catch(error) {
    if(!res.headersSent) res.status(error.statusCode||502).json({error:error.statusCode?error.message:'Video could not be prepared for offline download.'});
  }
});
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
