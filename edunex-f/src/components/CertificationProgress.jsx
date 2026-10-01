import { useEffect, useState } from 'react';
import './certification-progress.css';
export function CertificationProgress({courseId}) {
  const [status,setStatus]=useState(null),[quiz,setQuiz]=useState(null),[answers,setAnswers]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;setStatus(null);setQuiz(null);setMessage('');
    const changed=e=>{if(e.detail.courseId===String(courseId))setStatus(e.detail);};
    window.addEventListener('learning-progress',changed);
    window.EduNex?.authRequest(`/api/learning/${courseId}`).then(data=>{if(active)setStatus(data);}).catch(()=>{if(active)setMessage('Progress is unavailable. Reload to retry.');});
    return()=>{active=false;window.removeEventListener('learning-progress',changed);};
  },[courseId]);
  async function perform(kind){
    if(busy)return;setBusy(true);setMessage('');
    try{
      const path=`/api/learning/${courseId}/${kind==='claim'?'claim':'assessment'}`;
      if(kind==='start'){const data=await window.EduNex.authRequest(path);setQuiz(data);setAnswers(Array(data.questions.length).fill(null));}
      else {const data=await window.EduNex.authRequest(path,{method:'POST',body:JSON.stringify(kind==='submit'?{version:quiz.version,answers}:{})});if(data.eligibility)setStatus(data.eligibility);setMessage(data.watchMore?'Great work completing this course. Keep watching more lessons to continue your learning.':data.certificate?'Certificate ready in My Certificates.':`Assessment score: ${data.score}%. You can retry after 30 seconds.`);if(data.passed)setQuiz(null);}
    }catch(e){setMessage(e.message || 'Please retry.');}finally{setBusy(false);}
  }
  const watchedPercent = Number(status?.progressPercent);
  const completedPercent = status?.totalLessons ? status.completedLessons / status.totalLessons * 100 : 0;
  const percent = Math.max(0, Math.min(100, Math.floor(Number.isFinite(watchedPercent) ? watchedPercent : completedPercent)));
  return <section className="course-progress" aria-label="Certification progress">
    <div className="course-progress__heading"><h2>Course progress</h2><span>{percent}% complete</span></div>
    {status?<><progress max="100" value={percent} aria-label="Lessons completed"/><div className="course-progress__summary"><span>{status.completedLessons} of {status.totalLessons} lessons completed</span>{status.certificationEnabled===false?<a href="/courses">Watch more →</a>:<a href="/certificates">My certificates →</a>}</div>{status.watchMore?<div className="course-progress__watch-more"><strong>Keep learning</strong><p>You finished this course. Explore more lessons and continue building your skills.</p><a href="/courses">Watch more videos</a></div>:status.requirements.length ? <details><summary>Certificate requirements</summary><ul>{status.requirements.map(item=><li key={item}>{item === "Course durations must be configured by an administrator." ? "Certificate eligibility is pending course setup." : item}</li>)}</ul></details> : null}
    {status.certificationEnabled!==false&&status.assessmentRequired&&status.completedLessons===status.totalLessons?<button disabled={busy} onClick={()=>perform('start')}>Take final assessment</button>:null}
    {status.certificationEnabled!==false&&status.eligible?<><p>Your profile name will appear on the certificate. Check it before claiming.</p><button disabled={busy} onClick={()=>perform('claim')}>Claim certificate</button></>:null}</>:<p>Loading progress…</p>}
    {quiz?<form onSubmit={e=>{e.preventDefault();perform('submit');}}>{quiz.questions.map((q,i)=><fieldset key={i} style={{margin:'16px 0',padding:12}}><legend>{i+1}. {q.prompt}</legend>{q.options.map((option,j)=><label key={j} style={{display:'block',padding:6}}><input type="radio" name={`question-${i}`} required checked={answers[i]===j} onChange={()=>setAnswers(current=>current.map((a,k)=>k===i?j:a))}/> {option}</label>)}</fieldset>)}<button disabled={busy}>Submit answers</button></form>:null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
