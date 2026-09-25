import { AdminWrite, AdminEditFields } from "./AdminPermissions.jsx";
import { useEffect, useState } from 'react';
import { adminJson } from './adminApi';

export function MarketingSettings() {
  const [settings, setSettings] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [pixelId, setPixelId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    adminJson('/api/admin/marketing-settings', { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        setSettings(data);
        setEnabled(Boolean(data.metaPixelEnabled));
        setPixelId(data.metaPixelId || '');
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, []);

  async function save(event) {
    event.preventDefault();
    setSaving(true); setError(''); setMessage('');
    try {
      const data = await adminJson('/api/admin/marketing-settings', {
        method: 'PUT',
        body: JSON.stringify({ metaPixelEnabled: enabled, metaPixelId: pixelId }),
      });
      setSettings(data);
      setEnabled(Boolean(data.metaPixelEnabled));
      setPixelId(data.metaPixelId || '');
      setMessage(data.metaPixelEnabled ? 'Meta Pixel is enabled for offer tracking.' : 'Meta Pixel is turned off.');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  const dirty = settings && (enabled !== Boolean(settings.metaPixelEnabled) || pixelId !== (settings.metaPixelId || ''));

  return <section className="panel admin-settings-card" aria-labelledby="marketing-heading">
    <div className="admin-settings-card-head">
      <div>
        <span className="admin-settings-eyebrow">Marketing</span>
        <h2 id="marketing-heading">Meta Pixel tracking</h2>
        <p>Track offer traffic, OTP funnel, checkout starts, and purchases from browser Pixel events.</p>
      </div>
      {settings ? <span className={`admin-status-pill ${settings.metaPixelEnabled ? 'is-live' : 'is-off'}`}>{settings.metaPixelEnabled ? 'Pixel on' : 'Pixel off'}</span> : null}
    </div>
    {error ? <p className="admin-inline-message is-error" role="alert">{error}</p> : null}
    {message ? <p className="admin-inline-message is-success" role="status">{message}</p> : null}
    {!settings ? <p>{error ? 'Reload to retry loading marketing settings.' : 'Loading marketing settings…'}</p> : <form className="admin-settings-form" onSubmit={save}><AdminEditFields>
      <fieldset className="admin-fieldset" disabled={saving}>
        <label className="admin-field-label" htmlFor="metaPixelId">
          <span>Meta Pixel ID</span>
          <input
            id="metaPixelId"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={pixelId}
            onChange={event => { setPixelId(event.target.value.replace(/\D/g, '').slice(0, 30)); setMessage(''); }}
            placeholder="Example: 123456789012345"
          />
        </label>
        <label className="admin-switch-row">
          <input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setMessage(''); }} />
          <span className="admin-switch" aria-hidden="true"></span>
          <span>
            <strong>Enable Meta Pixel on offer pages</strong>
            <small>{enabled ? 'Events will be sent when a Pixel ID is saved.' : 'No Meta Pixel events are sent while this is off.'}</small>
          </span>
        </label>
      </fieldset>
      <p className="admin-settings-note">Phone numbers, OTPs, and emails are not sent to Meta. Only funnel events and purchase values are tracked.</p>
      <button className="primary-button admin-save-button" type="submit" disabled={saving || !dirty || (enabled && !pixelId)}>
        {saving ? 'Saving…' : 'Save Meta Pixel settings'}
      </button>
    </AdminEditFields></form>}
  </section>;
}
