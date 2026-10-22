const test = require('node:test');
const assert = require('node:assert/strict');

const { DOWNLOAD_GRANT_LIFETIME_MS, createDownloadGrantService, normalizeGuid, tokenHash } = require('../services/downloadGrantService');

test('download grants are random, hashed at rest, short-lived and one-time', async () => {
  const start = Date.parse('2026-09-25T12:00:00Z');
  let clock = start;
  let stored;
  const DownloadGrant = {
    create: async value => { stored = { ...value, usedAt: null }; return stored; },
    findOneAndUpdate: async query => {
      if (!stored || stored.tokenHash !== query.tokenHash || stored.guid !== query.guid || stored.usedAt
        || stored.expiresAt <= query.expiresAt.$gt) return null;
      stored.usedAt = new Date(clock);
      return { lean: () => ({ ...stored }) };
    },
  };
  // Match the Mongoose query shape, which returns a thenable supporting lean().
  DownloadGrant.findOneAndUpdate = query => ({
    lean: async () => {
      if (!stored || stored.tokenHash !== query.tokenHash || stored.guid !== query.guid || stored.usedAt
        || stored.expiresAt <= query.expiresAt.$gt) return null;
      stored.usedAt = new Date(clock);
      return { ...stored };
    },
  });
  const service = createDownloadGrantService({ DownloadGrant, now: () => clock, randomBytes: () => Buffer.alloc(32, 7) });
  const grant = await service.issue({ userId: 'user-a', guid: 'video-guid-123', courseTitle: 'Course', videoTitle: 'Lesson' });
  assert.notEqual(stored.tokenHash, grant.token);
  assert.equal(stored.tokenHash, tokenHash(grant.token));
  assert.equal(+grant.expiresAt, start + DOWNLOAD_GRANT_LIFETIME_MS);
  assert.ok(await service.consume({ guid: 'video-guid-123', token: grant.token }));
  assert.equal(await service.consume({ guid: 'video-guid-123', token: grant.token }), null);

  const another = await service.issue({ userId: 'user-a', guid: 'video-guid-456' });
  clock += DOWNLOAD_GRANT_LIFETIME_MS + 1;
  assert.equal(await service.consume({ guid: 'video-guid-456', token: another.token }), null);
});

test('download grant validation rejects malformed identifiers and tokens', async () => {
  assert.throws(() => normalizeGuid('../secret'), /valid video identifier/);
  const service = createDownloadGrantService({ DownloadGrant: { create: async () => {}, findOneAndUpdate: () => ({ lean: async () => null }) } });
  assert.equal(await service.consume({ guid: 'video-guid-123', token: 'short' }), null);
});
