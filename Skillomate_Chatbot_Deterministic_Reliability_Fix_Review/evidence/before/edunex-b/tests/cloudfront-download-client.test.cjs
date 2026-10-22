const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { canFallbackToCloudFrontHlsDownload, requestPreparedCloudfrontDownload } = require(path.join(
  __dirname,
  '../../appcopyai/services/cloudfrontDownload.js',
));

test('prepared CloudFront download returns the prepared grant when the job is ready', async () => {
  const requests = [];
  const session = {
    requestJson: async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1) return { downloadUrl: '/prepared.mp4', statusUrl: '/status' };
      return { status: 'ready' };
    },
  };

  const result = await requestPreparedCloudfrontDownload({ session, courseId: 'course 1', videoId: 'video/1' });
  assert.equal(result.downloadUrl, '/prepared.mp4');
  assert.equal(requests[0].url, '/api/courses/course%201/videos/video%2F1/download-grant');
  assert.equal(JSON.parse(requests[0].options.body).prepared, true);
  assert.equal(requests[1].url, '/status');
});

test('missing prepared job falls back to a single-request direct download', async () => {
  const requests = [];
  const missing = Object.assign(new Error('Download preparation was not found. Start the download again.'), { status: 404 });
  const session = {
    requestJson: async (url, options) => {
      requests.push({ url, options });
      if (requests.length === 1) return { downloadUrl: '/prepared.mp4?job=lost', statusUrl: '/status?job=lost' };
      if (requests.length === 2) throw missing;
      return { downloadUrl: '/prepared-again.mp4', directDownloadUrl: '/direct.mp4' };
    },
  };

  const result = await requestPreparedCloudfrontDownload({ session, courseId: 'course', videoId: 'video' });
  assert.equal(result.downloadUrl, '/direct.mp4');
  assert.equal(result.statusUrl, '');
  assert.equal(JSON.parse(requests[2].options.body).prepared, false);
});

test('authorization failures do not retry through the direct route', async () => {
  const forbidden = Object.assign(new Error('Course access could not be verified.'), { status: 403 });
  let calls = 0;
  const session = {
    requestJson: async () => {
      calls += 1;
      if (calls === 1) return { downloadUrl: '/prepared.mp4', statusUrl: '/status' };
      throw forbidden;
    },
  };

  await assert.rejects(
    requestPreparedCloudfrontDownload({ session, courseId: 'course', videoId: 'video' }),
    error => error === forbidden,
  );
  assert.equal(calls, 2);
});

test('iOS HLS fallback is limited to server conversion failures', () => {
  assert.equal(canFallbackToCloudFrontHlsDownload({ status: 502, message: 'Download failed' }), true);
  assert.equal(canFallbackToCloudFrontHlsDownload({ status: 425, message: 'Still preparing' }), true);
  assert.equal(canFallbackToCloudFrontHlsDownload({ status: 403, message: 'Course access denied' }), false);
});
