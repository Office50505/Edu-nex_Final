// Read-only diagnostics. Never return secret values, provider errors, or user records.
async function systemHealth({ env = process.env, connection, Course, RazorpayBilling, BillingWebhook, uptime = process.uptime } = {}) {
  const checks = [];
  const add = (id, group, label, status, evidence, detail, action = '') => checks.push({ id, group, label, status, evidence, detail, action });
  const configured = (id, group, label, keys, detail) => {
    const missing = keys.filter(key => !String(env[key] || '').trim());
    add(id, group, label, missing.length ? 'attention' : 'unverified', 'Configuration only',
      missing.length ? `Missing: ${missing.join(', ')}` : detail,
      missing.length ? 'Complete the server configuration and restart the backend.' : 'Validate the complete user flow in the provider test environment.');
  };
  add('api', 'Platform', 'Backend API', 'healthy', 'Live check', `Responding · uptime ${Math.floor(uptime())} seconds`);
  let databaseReady = false;
  const started = Date.now();
  try {
    if (connection?.readyState !== 1) throw new Error('Disconnected');
    await connection.db.command({ ping: 1 }, { timeoutMS: 3000 });
    databaseReady = true;
    add('database', 'Platform', 'MongoDB', 'healthy', 'Live check', `Database ping succeeded in ${Date.now() - started} ms.`);
  } catch {
    add('database', 'Platform', 'MongoDB', 'error', 'Live check', 'Database is disconnected or did not respond.', 'Check database access, network permissions and server logs.');
  }
  configured('auth', 'Platform', 'Learner authentication', ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'JWT_SIGNUP_SECRET'], 'Signing secrets are present. Login, OTP and refresh have not been exercised by this check.');
  add('cache', 'Platform', 'Cache', 'unverified', 'Configuration only', env.REDIS_URL ? 'Redis is configured; connectivity has not been tested.' : 'Using process-memory fallback; no shared Redis cache is configured.');
  add('jobs', 'Platform', 'Scheduled jobs', env.DISABLE_BACKGROUND_JOBS === 'true' ? 'attention' : 'unverified', 'Configuration only', env.DISABLE_BACKGROUND_JOBS === 'true' ? 'Background jobs are disabled in this process.' : 'Jobs are enabled after database connection. Successful execution is not recorded here.');
  const otp = String(env.OTP_PROVIDER || env.OTP_DELIVERY_PROVIDER || (env.NODE_ENV === 'production' ? 'msg91' : 'demo')).toLowerCase();
  if (otp === 'msg91') configured('otp', 'Integrations', 'MSG91 OTP', ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID'], 'MSG91 credentials are present. No SMS was sent and delivery is unverified.');
  else add('otp', 'Integrations', 'OTP delivery', 'attention', 'Configuration only', 'MSG91 is not selected; development or alternative OTP delivery is active.', 'Select and validate the production OTP provider before launch.');
  const aiKey = env.FAL_API_KEY || env.FAL_KEY;
  add('ai', 'Integrations', 'NEX AI', aiKey ? 'unverified' : 'attention', 'Configuration only', aiKey ? 'Model credentials are present. No model request was made.' : 'Model key is missing. The basic course-guide fallback will be used.', aiKey ? 'Run the tutor evaluation to verify grounding and provider availability.' : 'Configure the model provider on the backend.');
  configured('media', 'Integrations', 'Bunny video', ['BUNNY_STREAM_LIBRARY_ID', 'BUNNY_STREAM_API_KEY'], 'Library and API credentials are present. Video playback has not been tested.');
  const gateway = String(env.PAYMENT_GATEWAY_MODE || '').toLowerCase();
  if (gateway === 'razorpay') {
    configured('payments', 'Payments', 'Razorpay checkout', ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_PLAN_ID', 'RAZORPAY_WEBHOOK_SECRET'], 'Checkout configuration is present. No charge or mandate was created.');
    const expected = env.NODE_ENV === 'production' ? 'rzp_live_' : 'rzp_test_';
    add('payment-mode', 'Payments', 'Payment key mode', String(env.RAZORPAY_KEY_ID || '').startsWith(expected) ? 'unverified' : 'attention', 'Configuration only', String(env.RAZORPAY_KEY_ID || '').startsWith(expected) ? `Key prefix matches ${env.NODE_ENV === 'production' ? 'production' : 'test'} mode; credential validity is unverified.` : 'Payment key mode does not match the backend environment.', 'Use test keys for development and live keys for production.');
  } else add('payments', 'Payments', 'Payment gateway', 'attention', 'Configuration only', 'Razorpay is not the selected gateway. Legacy or simulated checkout requires separate validation.');
  if (databaseReady) {
    await Promise.all([
      (async () => {
        try {
          const published = await Course.countDocuments({ status: 'published' }).maxTimeMS(3000);
          add('catalogue', 'Content', 'Published courses', published ? 'healthy' : 'attention', 'Database check', `${published} published courses available.`, published ? '' : 'Publish a course from Content → Course library.');
          const incomplete = await Course.countDocuments({ status: 'published', videos: { $elemMatch: { $or: [{ duration: { $lte: 0 } }, { duration: { $exists: false } }] } } }).maxTimeMS(3000);
          add('certification', 'Content', 'Certification durations', incomplete ? 'attention' : 'healthy', 'Database check', `${incomplete} published courses have missing lesson durations.`, incomplete ? 'Open Operations → Certification and configure actual durations before learners can qualify.' : 'Required duration metadata is present; completion and assessment workflows still need end-to-end testing.');
        } catch { add('catalogue', 'Content', 'Published courses', 'error', 'Database check', 'Could not read the course catalogue.'); }
      })(),
      (async () => {
        try {
          const count = await RazorpayBilling.countDocuments({ $or: [{ phase: 'uncertain' }, { phase: 'creating', updatedAt: { $lt: new Date(Date.now() - 5 * 60000) } }] }).maxTimeMS(3000);
          add('checkout-recovery', 'Payments', 'Checkout recovery', count ? 'attention' : 'healthy', 'Database check', `${count} uncertain or stalled checkout attempts.`, count ? 'Reconcile these subscriptions with Razorpay before creating replacement mandates.' : 'No recovery backlog detected; this is not a payment success test.');
        } catch { add('checkout-recovery', 'Payments', 'Checkout recovery', 'error', 'Database check', 'Could not inspect checkout attempts.'); }
      })(),
      (async () => {
        try {
          const last = await BillingWebhook.findOne({ processedAt: { $ne: null } }).sort({ processedAt: -1 }).select('processedAt -_id').maxTimeMS(3000).lean();
          add('webhooks', 'Payments', 'Webhook processing', 'unverified', 'Historical evidence', last?.processedAt ? `Last processed event: ${new Date(last.processedAt).toISOString()}. This does not prove current delivery.` : 'No processed webhook is recorded yet.', 'Send a test event from Razorpay and check its delivery result.');
        } catch { add('webhooks', 'Payments', 'Webhook processing', 'error', 'Database check', 'Could not inspect webhook history.'); }
      })(),
    ]);
  } else {
    for (const [id, group, label] of [['certification', 'Content', 'Certification durations'], ['catalogue', 'Content', 'Published courses'], ['checkout-recovery', 'Payments', 'Checkout recovery'], ['webhooks', 'Payments', 'Webhook processing']]) add(id, group, label, 'unverified', 'Check skipped', 'Requires a working database connection.');
  }
  checks.sort((a, b) => a.id.localeCompare(b.id));
  return { checkedAt: new Date().toISOString(), environment: env.NODE_ENV === 'production' ? 'production' : 'development',
    summary: Object.fromEntries(['healthy', 'attention', 'error', 'unverified'].map(status => [status, checks.filter(check => check.status === status).length])), checks };
}
module.exports = { systemHealth };
