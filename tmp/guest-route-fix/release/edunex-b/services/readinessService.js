const SERVICE_NAME = 'Skillomate API';

async function isMongoReady(mongoose) {
  if (mongoose?.connection?.readyState !== 1) return false;

  try {
    const admin = mongoose.connection.db?.admin?.();
    if (!admin || typeof admin.ping !== 'function') return false;
    await admin.ping();
    return true;
  } catch (_error) {
    return false;
  }
}

async function isRedisReady(getSharedRedisClient) {
  try {
    const client = await getSharedRedisClient();
    if (!client?.isReady || typeof client.ping !== 'function') return false;
    return await client.ping() === 'PONG';
  } catch (_error) {
    return false;
  }
}

function createReadinessHandler({ mongoose, getSharedRedisClient }) {
  return async function readinessHandler(_req, res) {
    const [mongodbReady, redisReady] = await Promise.all([
      isMongoReady(mongoose),
      isRedisReady(getSharedRedisClient),
    ]);
    const ok = mongodbReady && redisReady;

    return res.status(ok ? 200 : 503).json({
      ok,
      service: SERVICE_NAME,
      mongodb: mongodbReady ? 'connected' : 'disconnected',
      redis: redisReady ? 'connected' : 'disconnected',
    });
  };
}

module.exports = {
  createReadinessHandler,
  isMongoReady,
  isRedisReady,
};
