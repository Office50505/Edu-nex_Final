import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminShell, Message } from './AdminShell.jsx';
import { adminJson, requireAdmin } from './adminApi.js';

const labels = { healthy: 'Passing', attention: 'Needs attention', error: 'Failing', unverified: 'Not verified' };
const groups = ['Platform', 'Integrations', 'Payments', 'Content'];
export function AdminHealthPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [auto, setAuto] = useState(false);
  const active = useRef(null);
  const refresh = useCallback(async () => {
    if (active.current || !requireAdmin()) return;
    const controller = new AbortController();
    active.current = controller;
    const timer = setTimeout(() => controller.abort(), 12000);
    setLoading(true);
    setError('');
    try {
      const data = await adminJson('/api/admin/system-health', { signal: controller.signal }, 'Health checks could not be loaded.');
      if (!Array.isArray(data.checks) || !data.summary) throw new Error('The backend returned an invalid health report.');
      if (active.current === controller) setReport(data);
    } catch (failure) {
      if (active.current === controller) setError(failure.name === 'AbortError' ? 'Health check timed out. Retry or check the backend connection.' : failure.message);
    } finally {
      clearTimeout(timer);
      if (active.current === controller) { active.current = null; setLoading(false); }
    }
  }, []);
  useEffect(() => {
    document.title = 'System Health | Skillomate';
    refresh();
    return () => { const controller = active.current; active.current = null; controller?.abort(); };
  }, [refresh]);
  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    return () => clearInterval(timer);
  }, [auto, refresh]);
  const visible = (report?.checks || []).filter(check => filter === 'all' || check.status === filter);
  return <AdminShell activePage="health" title="System health" subtitle="One place to inspect your platform, integrations and payment readiness." actions={<button className="toolbar-button" onClick={refresh} disabled={loading}>{loading ? 'Checking…' : 'Run checks'}</button>}>
    <Message text={error} type="error" />
    <section className="health-intro">
      <div><h2>{error ? 'Latest check unavailable' : !report ? 'Checking your workspace' : report.summary.error || report.summary.attention ? 'Some services need attention' : report.summary.unverified ? 'Live checks pass. Integrations still need verification.' : 'All reported checks pass'}</h2><p>Live checks test the API and database. Configuration checks do not send SMS, call AI, charge money or prove provider availability.</p></div>
      <span className="health-environment">{report?.environment || 'Connecting'}</span>
    </section>
    <div className="health-summary" aria-label="Check summary">
      {Object.entries(labels).map(([status, label]) => <button key={status} className={`health-summary-item ${status}`} aria-pressed={filter === status} onClick={() => setFilter(filter === status ? 'all' : status)}><strong>{report ? report.summary[status] : '—'}</strong><span>{label}</span></button>)}
    </div>
    <div className="health-controls">
      <label>Show <select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All checks</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label><input type="checkbox" checked={auto} onChange={event => setAuto(event.target.checked)} /> Refresh every 30 seconds</label>
      <span role="status">{report ? `${error ? 'Last successful check' : 'Checked'} ${new Date(report.checkedAt).toLocaleTimeString()}` : 'Waiting for results'}</span>
    </div>
    {loading && !report ? <div className="loading-state">Checking backend and database…</div> : null}
    {report && groups.map(group => {
      const checks = visible.filter(check => check.group === group);
      return checks.length ? <section className="health-section" key={group} aria-label={group}><h2>{group}<span>{checks.length} checks</span></h2><div className="health-check-grid">{checks.map(check => <article key={check.id} className="health-check"><div className="health-check-heading"><h3>{check.label}</h3><span className={`health-badge ${check.status}`}>{labels[check.status]}</span></div><small>{check.evidence}</small><p>{check.detail}</p>{check.action ? <p className="health-next"><strong>Next step</strong>{check.action}</p> : null}</article>)}</div></section> : null;
    })}
    {report && !visible.length ? <div className="empty-state">No checks match this filter.</div> : null}
  </AdminShell>;
}
