import { useEffect, useState } from 'react';
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
      else {const data=await window.EduNex.authRequest(path,{method:'POST',body:JSON.stringify(kind==='submit'?{version:quiz.version,answers}:{})});if(data.eligibility)setStatus(data.eligibility);setMessage(data.certificate?'Certificate ready in My Certificates.':`Assessment score: ${data.score}%. You can retry after 30 seconds.`);if(data.passed)setQuiz(null);}
    }catch(e){setMessage(e.message || 'Please retry.');}finally{setBusy(false);}
  }
  return <section style={{padding:20,border:'1px solid #75613b',borderRadius:12,margin:'18px 0'}} aria-label="Certification progress">
    <h2 style={{fontSize:18}}>Your course completion</h2>
    {status?<><p>{status.completedLessons} / {status.totalLessons} lessons complete · 90% coverage required per lesson.</p><ul>{status.requirements.map(item=><li key={item}>{item}</li>)}</ul>
    {status.assessmentRequired&&status.completedLessons===status.totalLessons?<button disabled={busy} onClick={()=>perform('start')}>Take final assessment</button>:null}
    {status.eligible?<><p>Your profile name will appear on the certificate. Check it before claiming.</p><button disabled={busy} onClick={()=>perform('claim')}>Claim certificate</button></>:null}</>:<p>Loading progress…</p>}
    {quiz?<form onSubmit={e=>{e.preventDefault();perform('submit');}}>{quiz.questions.map((q,i)=><fieldset key={i} style={{margin:'16px 0',padding:12}}><legend>{i+1}. {q.prompt}</legend>{q.options.map((option,j)=><label key={j} style={{display:'block',padding:6}}><input type="radio" name={`question-${i}`} required checked={answers[i]===j} onChange={()=>setAnswers(current=>current.map((a,k)=>k===i?j:a))}/> {option}</label>)}</fieldset>)}<button disabled={busy}>Submit answers</button></form>:null}
    <p role="status">{message}</p><a href="/certificates">My Certificates →</a>
  </section>;
}
