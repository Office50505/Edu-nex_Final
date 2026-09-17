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
  return <section className="panel" aria-labelledby="gateway-heading">
    <h2 id="gateway-heading">Razorpay gateway</h2>
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {!settings ? <p>{error ? 'Reload to retry loading payment settings.' : 'Loading payment settings…'}</p> : <form onSubmit={save}>
      <p>Active mode: <strong>{settings.mode === 'live' ? 'Live — real payments' : 'Test — simulated payments'}</strong></p>
      <fieldset disabled={saving}>
        <legend>Gateway for new checkouts</legend>
        {['test', 'live'].map(mode => <label key={mode} style={{ display: 'block', margin: '12px 0' }}>
          <input type="radio" name="gateway-mode" value={mode} checked={selected === mode}
            disabled={!settings.modes[mode].configured} onChange={() => { setSelected(mode); setMessage(''); }} />
          {' '}{mode === 'live' ? 'Live — charge real money' : 'Test — use Razorpay test payments'}
          {!settings.modes[mode].configured ? <small style={{ display: 'block' }}>{settings.modes[mode].detail}</small> : null}
        </label>)}
      </fieldset>
      <p>This changes checkout for all learners. Test payments can grant app access. Existing subscriptions keep their original gateway mode and are not cancelled by this switch.</p>
      <button className="primary-button" type="submit" disabled={saving || selected === settings.mode || !settings.modes[selected]?.configured}>
        {saving ? 'Checking and saving…' : `Apply ${selected === 'live' ? 'Live' : 'Test'} mode`}
      </button>
    </form>}
  </section>;
}
