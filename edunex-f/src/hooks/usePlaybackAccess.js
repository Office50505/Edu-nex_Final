import { useEffect, useState } from 'react';
export function usePlaybackAccess(courseId, savedLesson) {
  const [value,setValue]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(savedLesson.provider!=='aws_cloudfront')return;
    let stopped=false,timer;
    const renew=async()=>{
      try {
        const data=await window.EduNex.authRequest(`/api/courses/${courseId}/videos/${savedLesson._id}/playback-access`,{method:'POST',body:'{}'});
        if(stopped)return;
        setValue({...data,lessonId:savedLesson._id});setError('');
        timer=setTimeout(renew,Math.max(10000,data.expiresAt-Date.now()-60000));
      }catch(failure){if(!stopped)setError(failure.message||'Playback access unavailable.');}
    };renew();return()=>{stopped=true;clearTimeout(timer);};
  },[courseId,savedLesson._id,savedLesson.provider,attempt]);
  return {lesson:value?.lessonId===savedLesson._id?{...savedLesson,...value}:savedLesson,error,setError,retry:()=>{setError('');setValue(null);setAttempt(a=>a+1);}};
}
