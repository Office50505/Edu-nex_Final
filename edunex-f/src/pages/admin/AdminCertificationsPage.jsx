import { useEffect, useMemo, useState } from 'react';
import { AdminShell, Message } from './AdminShell.jsx';
import { adminJson, api, requireAdmin } from './adminApi.js';

const DEFAULT_TEMPLATE = {
  name: 'Skillomate Premium',
  brandName: 'Skillomate',
  brandPromise: 'A BRIGHTER\nYOU TOMORROW',
  title: 'CERTIFICATE',
  subtitle: 'OF COMPLETION',
  certifyCopy: 'This is to certify that',
  completionCopy: 'has successfully completed the',
  commendation: 'This achievement reflects dedication and commitment to learning.',
  motto: 'PRACTICAL SKILLS FOR A BRIGHTER YOU',
  signature: 'Skillomate',
  footerDomain: 'SKILLOMATE.IN',
  footerTagline: 'LEARN ANYWHERE',
  disclaimer: 'This certificate confirms course completion and is not a professional accreditation.',
  colors: { gold: '#bd7a00', ink: '#111111', paper: '#fffef9', background: '#ece9e0', accentSoft: '#fff8df' },
};

function CertificatePreview({ template }) {
  const colors = { ...DEFAULT_TEMPLATE.colors, ...(template.colors || {}) };
  const style = {
    '--cert-gold': colors.gold,
    '--cert-ink': colors.ink,
    '--cert-paper': colors.paper,
    '--cert-bg': colors.background,
    '--cert-soft': colors.accentSoft,
  };
  return (
    <div className="certificate-live-preview" style={style}>
      <div className="certificate-preview-card">
        <div className="certificate-preview-frame" aria-hidden="true" />
        <header><strong>{template.brandName || 'Skillomate'}</strong><span>{String(template.brandPromise || '').split('\n').map((part, index) => <em key={`${part}-${index}`}>{part}</em>)}</span></header>
        <section>
          <h3>{template.title || 'CERTIFICATE'}</h3>
          <p className="preview-subtitle">{template.subtitle || 'OF COMPLETION'}</p>
          <p>{template.certifyCopy || DEFAULT_TEMPLATE.certifyCopy}</p>
          <h4>Aarav Sharma</h4>
          <p>{template.completionCopy || DEFAULT_TEMPLATE.completionCopy} <b>AI Influencer Master Course</b> on 23 September 2026.</p>
          <small>{template.commendation || DEFAULT_TEMPLATE.commendation}</small>
          <div className="preview-seal">✦</div>
          <p className="preview-motto">{template.motto || DEFAULT_TEMPLATE.motto}</p>
          <div className="preview-signature">{template.signature || DEFAULT_TEMPLATE.signature}</div>
        </section>
        <footer><span>SAMPLE-CERT-2026</span><b>{template.footerDomain || DEFAULT_TEMPLATE.footerDomain}</b><span>{template.footerTagline || DEFAULT_TEMPLATE.footerTagline}</span></footer>
      </div>
      <p>{template.disclaimer || DEFAULT_TEMPLATE.disclaimer}</p>
    </div>
  );
}

function TemplateEditor({ setMessage }) {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let active = true;
    adminJson('/api/admin/certificate-template')
      .then((data) => { if (active) setTemplate({ ...DEFAULT_TEMPLATE, ...(data.template || {}), colors: { ...DEFAULT_TEMPLATE.colors, ...(data.template?.colors || {}) } }); })
      .catch((error) => { if (active) setMessage(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [setMessage]);

  function update(key, value) { setTemplate((current) => ({ ...current, [key]: value })); }
  function color(key, value) { setTemplate((current) => ({ ...current, colors: { ...current.colors, [key]: value } })); }
  async function saveTemplate(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await adminJson('/api/admin/certificate-template', { method: 'PUT', body: JSON.stringify(template) });
      setTemplate({ ...DEFAULT_TEMPLATE, ...(data.template || {}), colors: { ...DEFAULT_TEMPLATE.colors, ...(data.template?.colors || {}) } });
      setMessage(data.message || 'Certificate template saved.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }
  async function openPreview() {
    const preview = window.open('', '_blank');
    if (!preview) { setMessage('Allow popups to preview the certificate page.'); return; }
    preview.document.open();
    preview.document.write('<!doctype html><title>Rendering certificate…</title><body style="font-family:system-ui;padding:32px">Rendering certificate preview…</body>');
    preview.document.close();
    setPreviewing(true);
    try {
      const response = await fetch(api('/api/admin/certificate-template/preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('edunexAdminToken') || localStorage.getItem('edunexAdminToken') || ''}` },
        body: JSON.stringify({ template }),
      });
      const html = await response.text();
      if (!response.ok) throw new Error('Could not render certificate preview.');
      preview.document.open();
      preview.document.write(html);
      preview.document.close();
    } catch (error) {
      preview.document.open();
      preview.document.write(`<!doctype html><title>Preview failed</title><body style="font-family:system-ui;padding:32px;color:#991b1b">${error.message}</body>`);
      preview.document.close();
      setMessage(error.message);
    }
    finally { setPreviewing(false); }
  }

  if (loading) return <section className="cert-template-shell"><div className="loading-state">Loading certificate editor…</div></section>;
  return <section className="cert-template-shell" aria-label="Certificate design editor">
    <div className="cert-template-heading"><div><span>Certificate design</span><h2>Certificate editor</h2><p>Control the live certificate page design. New and existing public certificate pages use the active saved template.</p></div><div className="toolbar-actions"><button className="toolbar-button" type="button" onClick={openPreview} disabled={previewing}>{previewing ? 'Rendering…' : 'Preview full page'}</button></div></div>
    <div className="cert-template-grid">
      <form className="cert-template-form" onSubmit={saveTemplate}>
        <fieldset><legend>Brand and headline</legend><label>Template name<input value={template.name} maxLength={80} onChange={e => update('name', e.target.value)} /></label><label>Brand name<input value={template.brandName} maxLength={80} onChange={e => update('brandName', e.target.value)} /></label><label>Promise line<textarea rows="2" value={template.brandPromise} maxLength={80} onChange={e => update('brandPromise', e.target.value)} /></label><label>Title<input value={template.title} maxLength={40} onChange={e => update('title', e.target.value)} /></label><label>Subtitle<input value={template.subtitle} maxLength={60} onChange={e => update('subtitle', e.target.value)} /></label></fieldset>
        <fieldset><legend>Certificate copy</legend><label>Intro line<input value={template.certifyCopy} maxLength={120} onChange={e => update('certifyCopy', e.target.value)} /></label><label>Completion line<input value={template.completionCopy} maxLength={160} onChange={e => update('completionCopy', e.target.value)} /></label><label>Commendation<textarea rows="2" value={template.commendation} maxLength={180} onChange={e => update('commendation', e.target.value)} /></label><label>Motto<input value={template.motto} maxLength={90} onChange={e => update('motto', e.target.value)} /></label><label>Signature<input value={template.signature} maxLength={80} onChange={e => update('signature', e.target.value)} /></label></fieldset>
        <fieldset><legend>Footer and colors</legend><label>Footer domain<input value={template.footerDomain} maxLength={60} onChange={e => update('footerDomain', e.target.value)} /></label><label>Footer tagline<input value={template.footerTagline} maxLength={80} onChange={e => update('footerTagline', e.target.value)} /></label><label>Disclaimer<textarea rows="2" value={template.disclaimer} maxLength={220} onChange={e => update('disclaimer', e.target.value)} /></label><div className="cert-color-grid">{Object.entries({ gold: 'Gold accent', ink: 'Text', paper: 'Paper', background: 'Page background', accentSoft: 'Soft glow' }).map(([key, label]) => <label key={key}>{label}<input type="color" value={template.colors?.[key] || DEFAULT_TEMPLATE.colors[key]} onChange={e => color(key, e.target.value)} /></label>)}</div></fieldset>
        <div className="toolbar-actions"><button className="primary-button admin-save-button" disabled={saving}>{saving ? 'Saving…' : 'Save certificate template'}</button><button className="toolbar-button" type="button" onClick={() => setTemplate(DEFAULT_TEMPLATE)}>Reset preview defaults</button></div>
      </form>
      <CertificatePreview template={template} />
    </div>
  </section>;
}

export function AdminCertificationsPage(){
  const [data,setData]=useState({certificates:[],courses:[],total:0,stats:{}}),[page,setPage]=useState(1),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[courseId,setCourseId]=useState(''),[policy,setPolicy]=useState(null),[reason,setReason]=useState(''),[filter,setFilter]=useState('all'),[search,setSearch]=useState('');
  async function load(){if(!requireAdmin())return;setBusy(true);try{setData(await adminJson(`/api/admin/certifications?page=${page}`));}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  useEffect(()=>{document.title='Certification | Skillomate';load();},[page]);
  useEffect(()=>{let active=true;setPolicy(null);if(courseId)adminJson(`/api/admin/certification-policy/${courseId}`).then(value=>{if(active)setPolicy({questions:value.questions,durations:value.course.videos.map(v=>Number(v.duration)||0),videos:value.course.videos});}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[courseId]);
  async function save(e){e.preventDefault();setBusy(true);try{const result=await adminJson(`/api/admin/certification-policy/${courseId}`,{method:'PUT',body:JSON.stringify({durations:policy.durations,questions:policy.questions})});setMessage(result.message);}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  async function change(cert){const action=cert.status==='revoked'?'restore':'revoke';if(reason.trim().length<5){setMessage('Enter an audit reason of at least five characters.');return;}if(!window.confirm(`${action==='revoke'?'Revoke':'Restore'} certificate ${cert.certificateId}?`))return;setBusy(true);try{await adminJson(`/api/admin/certifications/${cert.certificateId}`,{method:'PATCH',body:JSON.stringify({action,reason})});setReason('');await load();setMessage('Certificate updated. The action and reason were recorded.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  function question(i,patch){setPolicy(p=>({...p,questions:p.questions.map((q,k)=>k===i?{...q,...patch}:q)}));}
  const visibleCertificates=(data.certificates||[]).filter(c=>{const haystack=[c.learnerName,c.courseTitle,c.certificateId,c.status].join(' ').toLowerCase();return (filter==='all'||c.status===filter)&&(!search.trim()||haystack.includes(search.trim().toLowerCase()));});
  const stats=data.stats||{};
  const revoked=Number(stats.revokedCertificates ?? (data.certificates||[]).filter(c=>c.status==='revoked').length);
  const pending=Number(stats.pendingOnCurrentPage ?? (data.progress||[]).filter(item=>!item.eligible).length);
  const totalCertificates=Number(stats.totalCertificates ?? data.total ?? 0);
  const progressTotal=Number(stats.progressTotal ?? data.progress?.length ?? 0);
  const conversionPercent=Number(stats.conversionPercent ?? (progressTotal?Math.round((totalCertificates/progressTotal)*100):0));
  const courseOptions = useMemo(() => data.courses || [], [data.courses]);
  return <AdminShell activePage="certifications" title="Certification" subtitle="Manage certificate design, completion criteria, assessments and issued records." actions={<button className="toolbar-button" disabled={busy} onClick={load}>Refresh</button>}>
    <Message text={message} type="success"/>
    <section className="summary-grid admin-v2-summary"><div className="summary-card"><strong>Certificates issued</strong><span>{totalCertificates}</span><small>Total certificate records</small></div><div className="summary-card"><strong>Tracked learners</strong><span>{progressTotal}</span><small>Course progress records</small></div><div className="summary-card"><strong>Revoked certificates</strong><span>{revoked}</span><small>Audit required</small></div><div className="summary-card"><strong>Conversion</strong><span>{conversionPercent}%</span><small>Progress to active certificate</small></div></section>
    <TemplateEditor setMessage={setMessage} />
    <section className="health-intro"><div><h2>Completion policy</h2><p>Every lesson requires 90% tracked coverage. Learners need a verified mobile number and a profile name. Optional assessments require 70%. Changing durations or questions starts a new criteria version. Existing certificates remain valid.</p></div></section>
    <h2 className="admin-section-heading">Course criteria & assessment</h2>
    <label>Course <select value={courseId} onChange={e=>setCourseId(e.target.value)}><option value="">Choose a course</option>{courseOptions.map(c=><option value={c._id} key={c._id}>{c.title}</option>)}</select></label>
    {policy?<form onSubmit={save} className="certification-editor"><h3>Trusted lesson durations</h3><p>Enter actual durations in seconds. Missing durations block certification.</p>{policy.videos.map((v,i)=><label key={v._id||i}>{v.title||`Lesson ${i+1}`}<input type="number" required min="1" max="86400" step="any" value={policy.durations[i]} onChange={e=>setPolicy(p=>({...p,durations:p.durations.map((d,k)=>k===i?Number(e.target.value):d)}))}/></label>)}
      <h3>Final assessment (optional)</h3><p>No questions means a completion-only certificate.</p>
      {policy.questions.map((q,i)=><fieldset key={i}><legend>Question {i+1}</legend><label>Question<input required maxLength={1000} value={q.prompt} onChange={e=>question(i,{prompt:e.target.value})}/></label>{q.options.map((o,j)=><label key={j}>Choice {j+1}<input required maxLength={300} value={o} onChange={e=>question(i,{options:q.options.map((value,k)=>k===j?e.target.value:value)})}/></label>)}<label>Correct choice<select value={q.answer} onChange={e=>question(i,{answer:Number(e.target.value)})}>{q.options.map((_,j)=><option value={j} key={j}>{j+1}</option>)}</select></label><button type="button" className="toolbar-button" onClick={()=>setPolicy(p=>({...p,questions:p.questions.filter((_,k)=>k!==i)}))}>Remove question</button></fieldset>)}
      <div className="toolbar-actions"><button type="button" className="toolbar-button" disabled={policy.questions.length>=30} onClick={()=>setPolicy(p=>({...p,questions:[...p.questions,{prompt:'',options:['','','',''],answer:0}]}))}>Add question</button><button className="toolbar-button" disabled={busy}>Save criteria</button></div>
    </form>:null}
    <h2 className="admin-section-heading">Recent learner completion</h2><div className="health-check-grid">{(data.progress||[]).map((item,i)=><article className="health-check" key={`${item.courseId}-${i}`}><h3>{item.learnerName}</h3><p>{item.courseTitle} · {item.completedLessons}/{item.totalLessons} lessons</p><p>{item.eligible?'Eligible for certificate':item.requirements.join(' ')}</p></article>)}</div>{!data.progress?.length?<p>No verified playback records yet.</p>:null}
    <h2 className="admin-section-heading">Issued certificates · {totalCertificates}</h2><div className="controls-panel"><div><label>Search certificate</label><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Learner, course, certificate ID"/></div><div><label>Status</label><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All</option><option value="issued">Issued</option><option value="revoked">Revoked</option><option value="pending">Pending</option></select></div><div><label>Audit reason for revoke / restore</label><input value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="Explain why the certificate needs to change"/></div></div>
    <div className="health-check-grid" style={{marginTop:16}}>{visibleCertificates.map(c=><article className="health-check" key={c.certificateId}><div className="health-check-heading"><h3>{c.learnerName}</h3><span className={`health-badge ${c.status==='revoked'?'error':'healthy'}`}>{c.status}</span></div><p>{c.courseTitle}</p><p>{new Date(c.issuedAt).toLocaleDateString()} · {c.courseVersion?'Current criteria':'Legacy record'}</p><small>{c.certificateId}</small><div className="toolbar-actions"><a className="toolbar-button" href={api(`/api/certificates/verify/${c.certificateId}`)} target="_blank" rel="noreferrer">View / Download</a><button className="toolbar-button" disabled={busy}>Reissue</button><button className="toolbar-button" disabled={busy} onClick={()=>change(c)}>{c.status==='revoked'?'Restore':'Revoke'}</button></div>{c.audit?.length?<details><summary>Audit history</summary>{c.audit.map((a,i)=><p key={i}>{new Date(a.at).toLocaleString()} · {a.action}: {a.reason}</p>)}</details>:null}</article>)}</div>
    {!visibleCertificates.length?<p>No certificates match this view.</p>:null}<div className="health-controls"><button disabled={busy||page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span><button disabled={busy||page*25>=totalCertificates} onClick={()=>setPage(p=>p+1)}>Next</button></div>
  </AdminShell>;
}
