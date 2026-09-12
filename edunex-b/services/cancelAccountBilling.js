const rzp = require('./razorpayService');
const phonePe = require('./phonePeService');
const terminal = new Set(['cancelled','completed','expired']);
async function cancelAccountBilling(billing, subscriptions) {
  if (billing && !billing.subscriptionId && billing.phase !== 'closed') {
    throw new Error('Payment setup is still being confirmed. Please retry account deletion shortly.');
  }
  const ids = new Set([billing?.subscriptionId, ...subscriptions.map(s=>s.razorpaySubscriptionId)].filter(Boolean));
  for (const id of ids) {
    const path = `/subscriptions/${encodeURIComponent(id)}`;
    let remote = await rzp.api(path);
    if (!terminal.has(remote.status)) {
      await rzp.api(`${path}/cancel`, 'POST', {cancel_at_cycle_end:0});
      remote = await rzp.api(path);
    }
    if (!terminal.has(remote.status)) throw new Error('Subscription cancellation is still processing. Please retry account deletion shortly.');
  }
  for (const sub of subscriptions) {
    if (!sub.phonePeMandateId || sub.gateway === 'razorpay' || sub.gateway === 'simulated' || /^SIM_MANDATE_/.test(sub.phonePeMandateId)) continue;
    const result = await phonePe.cancelMandate(sub.phonePeMandateId);
    if (!result.success) throw new Error('We could not automatically cancel your payment mandate. Your account has not been deleted. Please contact support.');
  }
}
module.exports = {cancelAccountBilling};
