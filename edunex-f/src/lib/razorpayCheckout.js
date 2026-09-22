let scriptPromise;
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    const timer = setTimeout(() => { script.remove(); reject(new Error('Checkout took too long to load. Please retry.')); }, 15000);
    script.onload = () => { clearTimeout(timer); window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Checkout failed to load.')); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Could not load Razorpay Checkout. Please retry.')); };
    document.head.appendChild(script);
  }).catch(error => { scriptPromise = null; throw error; });
  return scriptPromise;
}
export async function openRazorpay(data) {
  const prefill = Object.fromEntries(Object.entries(data.prefill || {}).filter(([, value]) => typeof value === 'string' && value.trim()).map(([key, value]) => [key, value.trim()]));
  const digits = String(prefill.contact || '').replace(/\D/g, '');
  if (digits) prefill.contact = `+${digits.length === 10 ? '91' : ''}${digits}`;
  const Razorpay = await loadRazorpay();
  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({ key: data.keyId, subscription_id: data.subscriptionId, name: 'Skillomate',
      description: data.paymentType === 'trial' ? '₹1 for 24 hours, then ₹499/month' : 'Monthly learning subscription', prefill, handler: resolve,
      readonly: { contact: Boolean(prefill.contact) },
      hidden: { contact: Boolean(prefill.contact), email: true },
      theme: { color: '#C58B2A', backdrop_color: 'rgba(10, 10, 12, 0.72)' },
      config: { display: { blocks: { upi: { name: 'UPI AutoPay', instruments: [{ method: 'upi' }] } }, sequence: ['block.upi'], preferences: { show_default_blocks: false } } },
      modal: { ondismiss: () => reject(new Error('Checkout closed. You can retry or cancel the unfinished mandate below.')) },
    });
    checkout.on('payment.failed', () => { checkout.close(); reject(new Error('A payment attempt was unsuccessful. Check payment status before retrying.')); });
    checkout.open();
  });
}
