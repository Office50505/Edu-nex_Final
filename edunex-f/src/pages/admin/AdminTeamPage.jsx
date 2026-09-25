import { useEffect, useState } from 'react';
import { AdminShell, Message } from './AdminShell.jsx';
import { adminJson } from './adminApi.js';
import { useAdminPermissions } from './AdminPermissions.jsx';
const empty = { username: '', name: '', password: '', role: 'viewer' };
const labels = { viewer: 'Viewer', developer: 'Developer', admin: 'Admin' };
export function AdminTeamPage() {
  const { canManageRoles, admin } = useAdminPermissions();
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reset, setReset] = useState(null);
  async function load() {
    try { const data = await adminJson('/api/admin/team'); setAccounts(data.accounts); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { if (canManageRoles) void load(); }, [canManageRoles]);
  if (!canManageRoles) return <p role="alert">This page is available to admins only.</p>;
  async function mutate(path, method, body) {
    setBusy(true); setError(''); setMessage('');
    try {
      await adminJson(path, { method, body: JSON.stringify(body) });
      setMessage('Team account saved. Changed accounts must sign in again.');
      await load();
      return true;
    } catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }
  async function create(event) {
    event.preventDefault();
    if (await mutate('/api/admin/team', 'POST', form)) setForm(empty);
  }
  return <AdminShell activePage="team" title="Team access" subtitle="Manage who can use this workspace and what they can change.">
    <Message text={error} type="error" /><Message text={message} />
    <p>Viewer: read only. Developer: manages app data without access to team roles. Admin: full access, including team accounts.</p>
    <form className="admin-settings-form" onSubmit={create}>
      <h2>Add team member</h2>
      <label>Name<input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label>Username<input required autoComplete="off" minLength={3} maxLength={80} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></label>
      <label>Password<input required type="password" autoComplete="new-password" minLength={12} maxLength={72} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
      <label>Role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{Object.entries(labels).map(([role, label]) => <option value={role} key={role}>{label}</option>)}</select></label>
      <button className="primary-button" disabled={busy}>Create account</button>
    </form>
    <section className="report-list" aria-label="Team members">{accounts.map(account => <article key={account.id} className="panel" style={{ padding: 20 }}>
      <h3>{account.name}</h3><p>{account.username} · {account.isActive ? 'Enabled' : 'Disabled'}</p>
      <label>Role for {account.username}<select disabled={busy || account.id === admin.id} value={account.role} onChange={e => void mutate(`/api/admin/team/${account.id}`, 'PATCH', { role: e.target.value })}>{Object.entries(labels).map(([role, label]) => <option value={role} key={role}>{label}</option>)}</select></label>
      <button className="toolbar-button" disabled={busy || account.id === admin.id} onClick={() => void mutate(`/api/admin/team/${account.id}`, 'PATCH', { isActive: !account.isActive })}>{account.isActive ? 'Disable' : 'Enable'} {account.username}</button>
      <button className="toolbar-button" disabled={busy} onClick={() => setReset({ id: account.id, username: account.username, password: '' })}>Reset password for {account.username}</button>
    </article>)}</section>
    {reset ? <form className="admin-settings-form" onSubmit={async e => { e.preventDefault(); if (await mutate(`/api/admin/team/${reset.id}`, 'PATCH', { password: reset.password })) setReset(null); }}>
      <label>New password for {reset.username}<input autoFocus type="password" required minLength={12} maxLength={72} autoComplete="new-password" value={reset.password} onChange={e => setReset({ ...reset, password: e.target.value })} /></label>
      <button disabled={busy}>Save password</button><button type="button" onClick={() => setReset(null)}>Cancel</button>
    </form> : null}
  </AdminShell>;
}
