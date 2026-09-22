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
        body: JSON.stringify({ metaPixelEnabled: enabled, metaPixelId }),
      });
      setSettings(data);
      setEnabled(Boolean(data.metaPixelEnabled));
      setPixelId(data.metaPixelId || '');
      setMessage(data.metaPixelEnabled ? 'Meta Pixel is enabled for offer tracking.' : 'Meta Pixel is turned off.');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  const dirty = settings && (enabled !== Boolean(settings.metaPixelEnabled) || pixelId !== (settings.metaPixelId || ''));

  return <section className="panel" aria-labelledby="marketing-heading">
    <h2 id="marketing-heading">Meta Pixel tracking</h2>
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {!settings ? <p>{error ? 'Reload to retry loading marketing settings.' : 'Loading marketing settings…'}</p> : <form onSubmit={save}>
      <p>Current status: <strong>{settings.metaPixelEnabled ? 'On — offer events are being sent' : 'Off — no Meta Pixel events are sent'}</strong></p>
      <fieldset disabled={saving}>
        <label style={{ display: 'block', margin: '12px 0' }}>
          Meta Pixel ID
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={pixelId}
            onChange={event => { setPixelId(event.target.value.replace(/\D/g, '').slice(0, 30)); setMessage(''); }}
            placeholder="Example: 123456789012345"
            style={{ display: 'block', width: '100%', marginTop: 8 }}
          />
        </label>
        <label style={{ display: 'block', margin: '12px 0' }}>
          <input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setMessage(''); }} />
          {' '}Enable Meta Pixel on offer pages
        </label>
      </fieldset>
      <p>This controls browser Pixel tracking for offer visitors, video engagement, OTP funnel, checkout start, payment success, and subscription events. Phone numbers, OTPs, and emails are not sent.</p>
      <button className="primary-button" type="submit" disabled={saving || !dirty || (enabled && !pixelId)}>
        {saving ? 'Saving…' : 'Save Meta Pixel settings'}
      </button>
    </form>}
  </section>;
}
