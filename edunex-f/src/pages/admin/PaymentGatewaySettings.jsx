import { AdminWrite, AdminEditFields } from "./AdminPermissions.jsx";
import { useEffect, useState } from 'react';
import { adminJson } from './adminApi';

export function PaymentGatewaySettings() {
  const [settings, setSettings] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState('razorpay');
  const [selectedMode, setSelectedMode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    adminJson('/api/admin/payment-settings', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setSettings(data); setSelectedProvider(data.provider || 'razorpay'); setSelectedMode(data.mode); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, []);
  async function save(event) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const data = await adminJson('/api/admin/payment-settings', { method: 'PUT', body: JSON.stringify({ provider: selectedProvider, mode: selectedMode }) });
      setSettings(data); setSelectedProvider(data.provider || 'razorpay'); setSelectedMode(data.mode);
      setMessage(`New checkouts now use ${data.provider === 'phonepe' ? 'PhonePe' : `Razorpay ${data.mode === 'live' ? 'Live' : 'Test'}`}.`);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <section className="panel admin-settings-card" aria-labelledby="gateway-heading">
    <div className="admin-settings-card-head">
      <div>
        <span className="admin-settings-eyebrow">Payments</span>
        <h2 id="gateway-heading">Payment gateway</h2>
        <p>Choose whether new learner checkouts use Razorpay or PhonePe. Existing subscriptions keep their original provider.</p>
      </div>
      {settings ? <span className={`admin-status-pill ${settings.provider === 'phonepe' || settings.mode === 'live' ? 'is-live' : 'is-test'}`}>{settings.provider === 'phonepe' ? 'PhonePe' : settings.mode === 'live' ? 'Razorpay live' : 'Razorpay test'}</span> : null}
    </div>
    {error ? <p className="admin-inline-message is-error" role="alert">{error}</p> : null}
    {message ? <p className="admin-inline-message is-success" role="status">{message}</p> : null}
    {!settings ? <p>{error ? 'Reload to retry loading payment settings.' : 'Loading payment settings…'}</p> : <form className="admin-settings-form" onSubmit={save}><AdminEditFields>
      <fieldset className="admin-choice-grid" disabled={saving}>
        <legend>Gateway for new checkouts</legend>
        {['razorpay', 'phonepe'].map(provider => {
          const configured = provider === 'phonepe'
            ? settings.providers?.phonepe?.configured
            : Object.values(settings.providers?.razorpay?.modes || settings.modes || {}).some(item => item.configured);
          const active = selectedProvider === provider;
          return <label key={provider} className={`admin-choice-card ${active ? 'is-selected' : ''} ${!configured ? 'is-disabled' : ''}`}>
            <input type="radio" name="gateway-provider" value={provider} checked={active}
              disabled={!configured} onChange={() => { setSelectedProvider(provider); setMessage(''); }} />
            <span className="admin-choice-dot" aria-hidden="true"></span>
            <span>
              <strong>{provider === 'phonepe' ? 'PhonePe — redirect checkout' : 'Razorpay — embedded checkout'}</strong>
              <small>{configured ? (provider === 'phonepe' ? 'Uses PhonePe Standard Checkout for new payments.' : 'Use Razorpay test/live modes below.') : (provider === 'phonepe' ? settings.providers?.phonepe?.detail : 'No Razorpay mode is configured.')}</small>
            </span>
          </label>;
        })}
      </fieldset>
      {selectedProvider === 'razorpay' ? <fieldset className="admin-choice-grid" disabled={saving}>
        <legend>Razorpay mode</legend>
        {['test', 'live'].map(mode => {
          const configured = settings.providers?.razorpay?.modes?.[mode]?.configured ?? settings.modes?.[mode]?.configured;
          const detail = settings.providers?.razorpay?.modes?.[mode]?.detail ?? settings.modes?.[mode]?.detail;
          const active = selectedMode === mode;
          return <label key={mode} className={`admin-choice-card ${active ? 'is-selected' : ''} ${!configured ? 'is-disabled' : ''}`}>
            <input type="radio" name="gateway-mode" value={mode} checked={active}
              disabled={!configured} onChange={() => { setSelectedMode(mode); setMessage(''); }} />
            <span className="admin-choice-dot" aria-hidden="true"></span>
            <span>
              <strong>{mode === 'live' ? 'Live — charge real money' : 'Test — use Razorpay test payments'}</strong>
              <small>{configured ? (mode === 'live' ? 'Uses live Razorpay keys and real mandates.' : 'Safe for local checkout testing.') : detail}</small>
            </span>
          </label>;
        })}
      </fieldset> : null}
      <p className="admin-settings-note">This changes checkout for all learners. Existing subscriptions keep their original gateway and are not cancelled by this switch.</p>
      <button className="primary-button admin-save-button" type="submit" disabled={saving || (selectedProvider === settings.provider && (selectedProvider === 'phonepe' || selectedMode === settings.mode)) || (selectedProvider === 'phonepe' ? !settings.providers?.phonepe?.configured : !settings.providers?.razorpay?.modes?.[selectedMode]?.configured && !settings.modes?.[selectedMode]?.configured)}>
        {saving ? 'Checking and saving…' : `Apply ${selectedProvider === 'phonepe' ? 'PhonePe' : `Razorpay ${selectedMode === 'live' ? 'Live' : 'Test'}`}`}
      </button>
    </AdminEditFields></form>}
  </section>;
}
