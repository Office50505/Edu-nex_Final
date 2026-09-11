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
      try { localStorage.setItem(progressCacheKey(courseId),JSON.stringify({percent:status.totalLessons?Math.floor(status.completedLessons/status.totalLessons*100):0,completed:status.completedLessons,lessonIndex:Math.max(0,status.lessons.findIndex(l=>!l.complete))})); } catch {}
      window.dispatchEvent(new CustomEvent('learning-progress',{detail:status}));
    };
    window.EduNex.authRequest(`/api/learning/${courseId}`).then(status=>{
      if(disposed)return;
      const lesson=status.lessons.find(l=>l.id===String(videoId));
      setResume(lesson?.resumePosition || 0);setNotice('Progress loaded');publish(status);ready=true;send();
    }).catch(()=>{if(!disposed){setNotice('Could not load saved progress. Reopen this lesson to retry.');}});
    const send=async()=>{
      if(busy||!ready||!latest.current.time.duration||disposed)return;
      busy=true;
      try {
        const data=await window.EduNex.authRequest(`/api/learning/${courseId}/progress`,{method:'POST',keepalive:true,body:JSON.stringify({videoId,currentTime:latest.current.time.current})});
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
