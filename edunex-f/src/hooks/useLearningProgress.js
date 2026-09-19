import { useEffect, useRef, useState } from 'react';
export function progressCacheKey(courseId) { return `edunexCourseProgress:${window.EduNex?.getUser?.()?._id || 'guest'}:${courseId}`; }
export function useLearningProgress(courseId, videoId, time, playing) {
  const latest=useRef({time,playing}); latest.current={time,playing};
  const [resume,setResume]=useState(null);
  const [notice,setNotice]=useState('Loading saved progress…');
  useEffect(()=>{
    let disposed=false,busy=false,ready=false;
    const publish=status=>{
      if(disposed)return;
      try {
        const key=progressCacheKey(courseId);
        const previous=JSON.parse(localStorage.getItem(key)||"{}");
        const lessons=Array.isArray(status.lessons)?status.lessons:[];
        const watchedSeconds=lessons.reduce((sum,lesson)=>sum+Math.max(0,Number(lesson.watchedSeconds||0)),0);
        const durationSeconds=lessons.reduce((sum,lesson)=>sum+Math.max(0,Number(lesson.duration||0)),0);
        const previousWatched=Number(previous.watchedSeconds);
        const watchedDelta=Number.isFinite(previousWatched)?Math.max(0,watchedSeconds-previousWatched):0;
        const firstIncompleteIndex=lessons.findIndex(lesson=>!lesson.complete);
        const resumeLessonIndex=firstIncompleteIndex>=0?firstIncompleteIndex:Math.max(lessons.length-1,0);
        const completedVideoIds=lessons.filter(lesson=>lesson.complete).map(lesson=>String(lesson?.id||lesson?.videoId||''));
        const now=new Date();
        const activityKey=`${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
        const activityByDay={...(previous.activityByDay||{})};
        if(watchedDelta>0)activityByDay[activityKey]=Number(activityByDay[activityKey]||0)+watchedDelta;
        localStorage.setItem(key,JSON.stringify({
          ...previous,
          viewed:true,
          lastViewedAt:now.toISOString(),
          percent:Number.isFinite(Number(status.progressPercent)) ? Number(status.progressPercent) : status.totalLessons?Math.floor(status.completedLessons/status.totalLessons*100):0,
          completed:status.completedLessons,
          lessonIndex:Math.max(0,resumeLessonIndex),
          completedVideoIds,
          lastWatchedVideoId:String(videoId),
          watchedSeconds,
          durationSeconds,
          activityByDay
        }));
      } catch {}
      window.dispatchEvent(new CustomEvent('learning-progress',{detail:status}));
    };
    window.EduNex.authRequest(`/api/learning/${courseId}`).then(status=>{
      if(disposed)return;
      const lesson=status.lessons.find(l=>l.id===String(videoId));
      setResume(lesson?.resumePosition || 0);setNotice('Progress loaded');publish(status);ready=true;send();
    }).catch(()=>{if(!disposed){setResume(0);setNotice('Could not load saved progress. Reopen this lesson to retry.');ready=true;}});
    const send=async()=>{
      if(busy||!ready||!latest.current.time.duration||disposed)return;
      busy=true;
      try {
        const data=await window.EduNex.authRequest(`/api/learning/${courseId}/progress`,{method:'POST',keepalive:true,body:JSON.stringify({videoId,currentTime:latest.current.time.current,duration:latest.current.time.duration})});
        if(!disposed){setNotice(data.certificate?'Certificate earned — open My Certificates':'Progress saved');publish(data.eligibility);}
      } catch(e){if(!disposed)setNotice(e.message || 'Progress not saved. Retrying when connected.');}
      finally{busy=false;}
    };
    const timer=setInterval(send,5000);
    const flush=()=>{send();};
    const hidden=()=>{if(document.visibilityState==='hidden')send();};
    window.addEventListener('pagehide',flush);
    document.addEventListener('visibilitychange',hidden);
    window.addEventListener('learning-flush',flush);
    return()=>{send();disposed=true;clearInterval(timer);window.removeEventListener('learning-flush',flush);window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);};
  },[courseId,videoId]);
  useEffect(()=>{window.dispatchEvent(new Event('learning-flush'));},[time.duration]);
  useEffect(()=>{if(!playing)window.dispatchEvent(new Event('learning-flush'));},[playing]);
  return {resume,notice};
}
