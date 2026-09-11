import {useEffect,useState} from 'react';
import './delete-account.css';
export default function DeleteAccountPage(){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false);
  useEffect(()=>{document.title='Request account deletion | Skillomate';},[]);
  async function submit(event){
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    const data=new FormData(event.currentTarget);
    try{
      const response=await fetch('/api/deletion-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fullName:data.get('fullName'),mobileNumber:data.get('mobileNumber'),email:data.get('email'),reason:data.get('reason'),confirm:data.get('confirm')==='on'})});
      const result=await response.json();if(!response.ok)throw new Error(result.error || 'Unable to submit your request.');setSent(true);
    }catch(e){setError(e.message || 'Please try again later.');}finally{setBusy(false);}
  }
  return <main className="deletion-page"><section className="deletion-card">
    <a href="/help" className="deletion-back">← Help center</a>
    <p className="deletion-eyebrow">SKILLOMATE ACCOUNT</p>
    <h1>Request account deletion</h1>
    {sent?<div role="status"><h2>Request received</h2><p>Our team will contact you at the email you provided to verify account ownership before processing deletion.</p><p>Your account has not been deleted yet. Submitting this request does not cancel an active subscription or payment mandate.</p><a href="/">Return to home →</a></div>:<>
    <p>Share your account details so our team can help you delete your Skillomate account. You do not need to log in.</p>
    <div className="deletion-info">Deletion removes your account, learning progress, certificates and AI chats. Any active payment mandate must be resolved before deletion. Some payment records may be retained as described in our <a href="/privacy-policy">Privacy Policy</a>.</div>
    <form onSubmit={submit}>
      <label>Account name<input name="fullName" autoComplete="name" required maxLength={120}/></label>
      <label>Registered mobile number<input name="mobileNumber" type="tel" autoComplete="tel" placeholder="10-digit mobile number" required maxLength={20}/></label>
      <label>Contact email<input name="email" type="email" autoComplete="email" required maxLength={254}/><small>We will use this email to follow up on your request.</small></label>
      <label>Additional details <span>(optional)</span><textarea name="reason" rows={3} maxLength={1000} placeholder="Anything that will help us with your request"/></label>
      <p className="deletion-note">Do not include passwords, OTPs or payment details.</p>
      <label className="deletion-confirm"><input type="checkbox" name="confirm" required/>I am requesting deletion of my own Skillomate account and understand that deletion is permanent once completed.</label>
      {error?<p role="alert">{error}</p>:null}
      <button disabled={busy} type="submit">{busy?'Submitting…':'Request deletion'}</button>
    </form></>}
  </section></main>;
}
