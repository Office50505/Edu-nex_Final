const BillingCancellationJob = require('../models/BillingCancellationJob');
const razorpay = require('./razorpayService');
const phonePe = require('./phonePeService');

const TERMINAL_RAZORPAY_STATES = new Set(['cancelled', 'completed', 'expired']);

async function cancelTarget(target) {
  if (target.provider === 'phonepe') {
    const result = await phonePe.cancelMandate(target.referenceId);
    if (!result?.success) throw Object.assign(new Error('PhonePe mandate cancellation was not confirmed'), { code: 'PHONEPE_NOT_CONFIRMED' });
    return;
  }
  if (target.provider === 'razorpay') {
    const path = `/subscriptions/${encodeURIComponent(target.referenceId)}`;
    let remote = await razorpay.api(path, 'GET', undefined, target.mode);
    if (!TERMINAL_RAZORPAY_STATES.has(remote.status)) {
      await razorpay.api(`${path}/cancel`, 'POST', { cancel_at_cycle_end: 0 }, target.mode);
      remote = await razorpay.api(path, 'GET', undefined, target.mode);
    }
    if (!TERMINAL_RAZORPAY_STATES.has(remote.status)) {
      throw Object.assign(new Error('Razorpay cancellation is still processing'), { code: 'RAZORPAY_NOT_TERMINAL' });
    }
  }
}

async function retryPendingBillingCancellations({ limit = 25, now = new Date() } = {}) {
  const jobs = await BillingCancellationJob.find({
    status: { $in: ['pending', 'retrying'] },
    nextAttemptAt: { $lte: now },
  }).sort({ nextAttemptAt: 1 }).limit(limit);
  const result = { processed: 0, resolved: 0, pending: 0, manualReview: 0 };
  for (const job of jobs) {
    result.processed += 1;
    try {
      for (const target of job.cancellationTargets || []) await cancelTarget(target);
      job.status = 'resolved';
      job.updatedAt = new Date();
      job.lastErrorCode = null;
      await job.save();
      result.resolved += 1;
    } catch (error) {
      job.attempts += 1;
      job.lastErrorCode = String(error?.code || error?.name || 'PROVIDER_CANCELLATION_FAILED').slice(0, 120);
      job.lastErrorAt = new Date();
      job.updatedAt = new Date();
      if (job.attempts >= 8) {
        job.status = 'manual_review';
        result.manualReview += 1;
      } else {
        job.status = 'retrying';
        const minutes = Math.min(24 * 60, 15 * (2 ** Math.max(0, job.attempts - 1)));
        job.nextAttemptAt = new Date(Date.now() + minutes * 60 * 1000);
        result.pending += 1;
      }
      await job.save();
    }
  }
  return result;
}

module.exports = { cancelTarget, retryPendingBillingCancellations };
