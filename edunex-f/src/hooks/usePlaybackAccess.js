import { useEffect, useState } from 'react';
import { courseRequest } from '../lib/courseRequest';
import { apiUrl } from '../lib/apiUrl.js';
const validGrant = value => value && typeof value.hlsUrl === 'string' && value.hlsUrl && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now() + 60000;
const routedGrant = value => value && ({...value,hlsUrl:/^\/?api(?:\/|$)/i.test(value.hlsUrl || '')?apiUrl(value.hlsUrl):value.hlsUrl});
export function usePlaybackAccess(courseId, savedLesson) {
  const [value,setValue]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const initial = attempt === 0 && validGrant(savedLesson) ? savedLesson : null;
  useEffect(()=>{
    if(savedLesson.provider!=='aws_cloudfront')return;
    let stopped=false,timer;
    const controller = new AbortController();
    const renew=async()=>{
      try {
        const token = localStorage.getItem('edunexAccessToken') || sessionStorage.getItem('edunexAccessToken');
        if (!token) throw new Error('Please log in again to play this lesson.');
        const { response, data }=await courseRequest(`/api/courses/${courseId}/videos/${savedLesson._id}/playback-access`,{
          method:'POST',body:'{}',signal:controller.signal,
          headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        });
        if(stopped)return;
        if (!response.ok) throw new Error(data?.error || 'Playback access unavailable. Please retry.');
        if(!validGrant(data)) throw new Error('The playback service returned an invalid response. Please contact support to update the video backend.');
        setValue({...routedGrant(data),lessonId:savedLesson._id,courseId});setError('');
        timer=setTimeout(renew,Math.max(10000,data.expiresAt-Date.now()-60000));
      }catch(failure){if(!stopped){setValue(null);setError(failure.message||'Playback access unavailable.');}}
    };
    setError('');
    if (attempt === 0 && validGrant(savedLesson)) {
      setValue({...routedGrant(savedLesson),lessonId:savedLesson._id,courseId});
      timer=setTimeout(renew,Math.max(10000,savedLesson.expiresAt-Date.now()-60000));
    } else renew();
    return()=>{stopped=true;clearTimeout(timer);controller.abort();};
  },[courseId,savedLesson._id,savedLesson.provider,savedLesson.hlsUrl,savedLesson.expiresAt,attempt]);
  const grant = value?.lessonId===savedLesson._id && value.courseId===courseId ? value : initial;
  const {hlsUrl,expiresAt,...withoutGrant} = savedLesson;
  const playable = savedLesson.provider === 'aws_cloudfront' ? withoutGrant : savedLesson;
  return {lesson:grant?{...savedLesson,...grant}:playable,error,setError,retry:()=>{setError('');setValue(null);setAttempt(a=>a+1);}};
}
