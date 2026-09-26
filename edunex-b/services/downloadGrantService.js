const crypto = require('node:crypto');
const DownloadGrant = require('../models/DownloadGrant');

const DOWNLOAD_GRANT_LIFETIME_MS = 2 * 60 * 1000;

function normalizeGuid(value) {
  const guid = String(value || '').trim();
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(guid)) {
    const error = new Error('A valid video identifier is required');
    error.statusCode = 400;
    throw error;
  }
  return guid;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function createDownloadGrantService(dependencies = {}) {
  const Grant = dependencies.DownloadGrant || DownloadGrant;
  const now = dependencies.now || (() => Date.now());
  const randomBytes = dependencies.randomBytes || crypto.randomBytes;

  async function issue({ userId, guid, libraryId, courseId, courseTitle, videoTitle }) {
    const normalizedGuid = normalizeGuid(guid);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now() + DOWNLOAD_GRANT_LIFETIME_MS);
    await Grant.create({
      tokenHash: tokenHash(token),
      user: userId,
      guid: normalizedGuid,
      libraryId: libraryId || null,
      courseId: courseId || null,
      courseTitle: String(courseTitle || '').slice(0, 200) || null,
      videoTitle: String(videoTitle || '').slice(0, 200) || null,
      expiresAt,
    });
    return { token, expiresAt };
  }

  async function consume({ token, guid }) {
    const normalizedGuid = normalizeGuid(guid);
    if (typeof token !== 'string' || token.length < 32 || token.length > 256) return null;
    return Grant.findOneAndUpdate(
      {
        tokenHash: tokenHash(token),
        guid: normalizedGuid,
        usedAt: null,
        expiresAt: { $gt: new Date(now()) },
      },
      { $set: { usedAt: new Date(now()) } },
      { new: true }
    ).lean();
  }

  return { consume, issue };
}

module.exports = {
  DOWNLOAD_GRANT_LIFETIME_MS,
  createDownloadGrantService,
  normalizeGuid,
  tokenHash,
};
