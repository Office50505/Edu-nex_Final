const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('stream');

const { pipeDownloadBody } = require('../services/downloadStream');

test('video download piping keeps the response open until every byte is written', async () => {
  const chunks = [Buffer.from('video-'), Buffer.from('payload-'), Buffer.from('complete')];
  let index = 0;
  const upstream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
  });
  const received = [];
  const response = new Writable({
    write(chunk, _encoding, callback) {
      received.push(Buffer.from(chunk));
      setImmediate(callback);
    },
  });
  response.headersSent = true;

  await pipeDownloadBody(upstream, response);

  assert.equal(Buffer.concat(received).toString(), 'video-payload-complete');
  assert.equal(response.writableEnded, true);
});

test('an empty provider body is rejected before starting the response', async () => {
  await assert.rejects(
    pipeDownloadBody(null, new Writable({ write(_chunk, _encoding, callback) { callback(); } })),
    error => error.statusCode === 502 && /empty response/i.test(error.message)
  );
});
