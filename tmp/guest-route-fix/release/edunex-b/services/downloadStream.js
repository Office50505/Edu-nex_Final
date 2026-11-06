const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

async function pipeDownloadBody(upstreamBody, response) {
  if (!upstreamBody) {
    throw Object.assign(new Error('The video provider returned an empty response.'), { statusCode: 502 });
  }

  try {
    await pipeline(Readable.fromWeb(upstreamBody), response);
  } catch (error) {
    // A disconnected client is expected to close the response while pipeline
    // cancels the upstream body. Do not try to write a second HTTP response.
    if (response.destroyed || response.writableEnded) return;
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    throw error;
  }
}

module.exports = { pipeDownloadBody };
