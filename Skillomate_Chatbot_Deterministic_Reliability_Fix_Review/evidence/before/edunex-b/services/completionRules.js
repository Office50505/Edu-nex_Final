const crypto = require('node:crypto');
const THRESHOLD = 0.9;
function videoKey(video, index) { return String(video._id || video.id || video.bunnyVideoId || video.bunnyGuid || video.youtubeId || video.videoId || index); }
function manifest(course, policy) {
  const videos = (course.videos || []).map((video, index) => ({ id: videoKey(video, index), title: video.title || `Lesson ${index + 1}`, duration: Number(video.duration) || 0 }));
  const questions = (policy?.questions || []).map(q => ({ prompt: q.prompt, options: Array.from(q.options), answer: q.answer }));
  const rank = new Map((course.completionOrder || videos.map(v=>v.id)).map((id,index)=>[String(id),index]));
  const ordered = videos.map((video,index)=>({video,source:course.videos[index]})).sort((a,b)=>(rank.get(a.video.id) ?? Number.MAX_SAFE_INTEGER)-(rank.get(b.video.id) ?? Number.MAX_SAFE_INTEGER)||a.video.id.localeCompare(b.video.id));
  const version = crypto.createHash('sha256').update(JSON.stringify({ videos: ordered.map(({video:{ id, duration }}) => ({ id, duration })), sources: ordered.map(({source:v}) => [v.bunnyGuid,v.bunnyVideoId,v.youtubeId,v.videoUrl,v.hlsUrl,v.embedUrl]), questions, threshold: THRESHOLD })).digest('hex').slice(0, 24);
  return { videos, questions, version };
}
function identity(...parts) { return crypto.createHash('sha256').update(JSON.stringify(parts.map(String))).digest('hex'); }
function mergeIntervals(intervals) {
  const sorted = intervals.filter(pair => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite) && pair[1] > pair[0]).sort((a,b) => a[0]-b[0]);
  const out = [];
  for (const [start,end] of sorted) { const last=out.at(-1); if(last && start<=last[1]) last[1]=Math.max(end,last[1]); else out.push([start,end]); }
  return out;
}
function heartbeat(previous, { position, duration, now, sessionId }) {
  if (!Number.isFinite(position) || position < 0 || !Number.isFinite(duration) || duration <= 0 || position > duration + 2) throw Object.assign(new Error('Invalid playback position or missing course duration.'), { statusCode: 400 });
  const current = Math.min(position,duration);
  const elapsed = previous?.lastSeenAt ? (now - new Date(previous.lastSeenAt).getTime()) / 1000 : 0;
  const delta = current - (previous?.position || 0);
  // First sample anchors only. Seek jumps, rewinds, concurrent sessions and long gaps receive no credit.
  const credit = previous?.sessionId === sessionId && elapsed > 0 && elapsed <= 20 && delta > 0 && delta <= elapsed * 2.1 + 0.25;
  const intervals = mergeIntervals([...(previous?.intervals || []), ...(credit ? [[previous.position,current]] : [])]);
  if (intervals.length > 4000) throw Object.assign(new Error('Too many fragmented playback updates. Contact support.'), { statusCode: 409 });
  return { position: current, intervals, lastSeenAt: new Date(now), sessionId };
}
function covered(intervals, duration) { return mergeIntervals(intervals || []).reduce((sum,[start,end]) => sum + Math.max(0,Math.min(duration,end)-Math.max(0,start)),0); }
function eligibility({ videos, rows, user, questions = [], assessment }) {
  const lessons = videos.map(video => {
    const row=rows.find(r=>r.videoId===video.id); const seconds=covered(row?.intervals,video.duration);
    return { ...video, watchedSeconds: seconds, resumePosition: row?.position || 0, complete: video.duration>0 && seconds/video.duration>=THRESHOLD, percent: video.duration>0 ? Math.min(100,Math.floor(seconds/video.duration*100)) : 0 };
  });
  const requirements=[];
  if(!lessons.length) requirements.push('This course has no lessons.');
  if(lessons.some(l=>l.duration<=0)) requirements.push('Course durations must be configured by an administrator.');
  if(lessons.some(l=>!l.complete)) requirements.push('Watch at least 90% of every lesson.');
  if(!user.isMobileVerified) requirements.push('Verify your mobile number.');
  if(!String(user.fullName || '').trim()) requirements.push('Add your full name to your profile.');
  if(questions.length && !assessment?.passed) requirements.push('Pass the final assessment with at least 70%.');
  const totalDuration=lessons.reduce((sum,lesson)=>sum+Math.max(0,Number(lesson.duration)||0),0);
  const watchedSeconds=lessons.reduce((sum,lesson)=>sum+Math.max(0,Number(lesson.watchedSeconds)||0),0);
  // Average the per-lesson coverage across the fixed lesson count. Using only
  // known durations makes progress shrink whenever another duration is filled.
  const progressPercent=lessons.length
    ? Math.min(100,Math.round(lessons.reduce((sum,lesson)=>sum+lesson.percent,0)/lessons.length))
    : 0;
  return { lessons, completedLessons: lessons.filter(l=>l.complete).length, totalLessons: lessons.length, watchedSeconds, totalDuration, progressPercent, requirements, eligible: !requirements.length, assessmentRequired: !!questions.length, assessmentScore: assessment?.score ?? null };
}
module.exports = { THRESHOLD, videoKey, manifest, identity, mergeIntervals, heartbeat, covered, eligibility };
