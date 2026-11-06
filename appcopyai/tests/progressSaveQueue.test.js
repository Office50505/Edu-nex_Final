const test = require('node:test');
const assert = require('node:assert/strict');
const { createProgressSaveQueue, PROGRESS_SAVE_ERROR } = require('../services/progressSaveQueue');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function fixture() {
  let current = true;
  const statuses = [], applied = [];
  const queue = createProgressSaveQueue({ isCurrent: () => current, onChange: status => statuses.push(status) });
  const entry = (key, request, currentTime = 30) => ({ key, payload: { courseId: 'course', videoId: key, currentTime, duration: 120 }, request, onSuccess: data => applied.push(data) });
  return { queue, statuses, applied, entry, leave: () => { current = false; } };
}

test('failed saves show a warning and retry the original position without fabricated watch time', async () => {
  const f = fixture(); const payloads = []; let online = false;
  const request = async payload => { payloads.push(payload); if (!online) throw new Error('network'); return { progress: { resumePosition: 30 } }; };
  assert.equal((await f.queue.save(f.entry('lesson', request))).error, PROGRESS_SAVE_ERROR);
  assert.equal(f.statuses.at(-1).count, 1); assert.equal(f.applied.length, 0);
  online = true; await f.queue.retry();
  assert.deepEqual(payloads[0], payloads[1]);
  assert.equal(f.applied.length, 1); assert.deepEqual(f.statuses.at(-1), { count: 0, retrying: false });
});

test('repeated failures retain one warning per lesson and retry only its latest position', async () => {
  const f = fixture(); let online = false; const retried = [];
  const request = async payload => { if (!online) throw new Error('offline'); retried.push(payload.currentTime); return {}; };
  await f.queue.save(f.entry('lesson', request, 10));
  await f.queue.save(f.entry('lesson', request, 40));
  assert.equal(f.statuses.at(-1).count, 1);
  online = true; await f.queue.retry(); assert.deepEqual(retried, [40]);
});

test('a successful heartbeat automatically clears that lesson while preserving other failures', async () => {
  const f = fixture(); const fail = async () => { throw new Error('offline'); };
  await f.queue.save(f.entry('one', fail)); await f.queue.save(f.entry('two', fail));
  await f.queue.save(f.entry('one', async () => ({ progress: {} })));
  assert.equal(f.statuses.at(-1).count, 1);
  await f.queue.retry(); assert.equal(f.statuses.at(-1).count, 1);
});

test('rapid retry taps share one request and keep the warning after another failure', async () => {
  const f = fixture(); let count = 0; const pending = deferred();
  await f.queue.save(f.entry('lesson', async () => { count++; if (count === 1) throw new Error('offline'); return pending.promise; }));
  const a = f.queue.retry(); const b = f.queue.retry(); assert.equal(a, b);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(count, 2); assert.equal(f.statuses.at(-1).retrying, true);
  pending.reject(new Error('offline')); await a;
  assert.deepEqual(f.statuses.at(-1), { count: 1, retrying: false });
});

test('late older responses cannot clear a newer failure or overwrite newer saved progress', async () => {
  for (const olderFails of [false, true]) {
    const f = fixture(); const old = deferred();
    const a = f.queue.save(f.entry('lesson', () => old.promise)); await Promise.resolve();
    await f.queue.save(f.entry('lesson', async () => { if (!olderFails) throw new Error('offline'); return { position: 60 }; }, 60));
    if (olderFails) old.reject(new Error('offline')); else old.resolve({ position: 30 });
    await a;
    assert.equal(f.statuses.at(-1).count, olderFails ? 0 : 1);
    assert.deepEqual(f.applied, olderFails ? [{ position: 60 }] : []);
  }
});

test('retry waits for a newer heartbeat already in flight instead of resending a stale position', async () => {
  const f = fixture(); const next = deferred(); let attempts = 0;
  await f.queue.save(f.entry('lesson', async () => { attempts++; throw new Error('offline'); }, 10));
  const saving = f.queue.save(f.entry('lesson', () => next.promise, 50));
  const retry = f.queue.retry(); next.resolve({ position: 50 }); await Promise.all([saving, retry]);
  assert.equal(attempts, 1); assert.equal(f.applied.length, 1); assert.equal(f.statuses.at(-1).count, 0);
});

test('logout and session replacement prevent late success, failure or retry from affecting the next account', async () => {
  for (const reject of [false, true]) {
    const f = fixture(); const pending = deferred();
    const save = f.queue.save(f.entry('lesson', () => pending.promise)); await Promise.resolve();
    f.leave();
    if (reject) pending.reject(new Error('offline')); else pending.resolve({ progress: {} });
    await save; await f.queue.retry();
    assert.deepEqual(f.statuses, []); assert.deepEqual(f.applied, []);
    f.queue.dispose();
  }
});
