import { useEffect, useState } from 'react';
import { adminJson } from './adminApi';

export function PaymentGatewaySettings() {
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    adminJson('/api/admin/payment-settings', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setSettings(data); setSelected(data.mode); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, []);
  async function save(event) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const data = await adminJson('/api/admin/payment-settings', { method: 'PUT', body: JSON.stringify({ mode: selected }) });
      setSettings(data); setSelected(data.mode);
      setMessage(`New checkouts now use ${data.mode === 'live' ? 'Live' : 'Test'} mode.`);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <section className="panel admin-settings-card" aria-labelledby="gateway-heading">
    <div className="admin-settings-card-head">
      <div>
        <span className="admin-settings-eyebrow">Payments</span>
        <h2 id="gateway-heading">Razorpay gateway</h2>
        <p>Choose whether new learner checkouts use test credentials or live Razorpay billing.</p>
      </div>
      {settings ? <span className={`admin-status-pill ${settings.mode === 'live' ? 'is-live' : 'is-test'}`}>{settings.mode === 'live' ? 'Live mode' : 'Test mode'}</span> : null}
    </div>
    {error ? <p className="admin-inline-message is-error" role="alert">{error}</p> : null}
    {message ? <p className="admin-inline-message is-success" role="status">{message}</p> : null}
    {!settings ? <p>{error ? 'Reload to retry loading payment settings.' : 'Loading payment settings…'}</p> : <form className="admin-settings-form" onSubmit={save}>
      <fieldset className="admin-choice-grid" disabled={saving}>
        <legend>Gateway for new checkouts</legend>
        {['test', 'live'].map(mode => {
          const configured = settings.modes[mode].configured;
          const active = selected === mode;
          return <label key={mode} className={`admin-choice-card ${active ? 'is-selected' : ''} ${!configured ? 'is-disabled' : ''}`}>
            <input type="radio" name="gateway-mode" value={mode} checked={active}
              disabled={!configured} onChange={() => { setSelected(mode); setMessage(''); }} />
            <span className="admin-choice-dot" aria-hidden="true"></span>
            <span>
              <strong>{mode === 'live' ? 'Live — charge real money' : 'Test — use Razorpay test payments'}</strong>
              <small>{configured ? (mode === 'live' ? 'Uses live Razorpay keys and real mandates.' : 'Safe for local checkout testing.') : settings.modes[mode].detail}</small>
            </span>
          </label>;
        })}
      </fieldset>
      <p className="admin-settings-note">This changes checkout for all learners. Test payments can grant app access. Existing subscriptions keep their original gateway mode and are not cancelled by this switch.</p>
      <button className="primary-button admin-save-button" type="submit" disabled={saving || selected === settings.mode || !settings.modes[selected]?.configured}>
        {saving ? 'Checking and saving…' : `Apply ${selected === 'live' ? 'Live' : 'Test'} mode`}
      </button>
    </form>}
  </section>;
}
