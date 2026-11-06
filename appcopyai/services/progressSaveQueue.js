const PROGRESS_SAVE_ERROR = 'Progress could not be saved. Reconnect and retry. You may need to replay unrecorded parts.';

// Retain only the latest failed position for each lesson in this signed-in session.
// Retrying a position does not invent watched intervals or award completion.
function createProgressSaveQueue({ isCurrent, onChange }) {
  const failed = new Map();
  const versions = new Map();
  const inFlight = new Map();
  let disposed = false;
  let retryPromise = null;
  const active = () => !disposed && isCurrent();
  const notify = () => { if (active()) onChange({ count: failed.size, retrying: Boolean(retryPromise) }); };

  function save({ key, payload, request, onSuccess }) {
    if (!active()) return Promise.resolve();
    const version = (versions.get(key) || 0) + 1;
    versions.set(key, version);
    const latest = () => active() && versions.get(key) === version;
    const task = Promise.resolve().then(async () => {
      try {
        if (!active()) return;
        const data = await request(payload);
        if (!latest()) return;
        if (data?.error) throw new Error(data.error);
        onSuccess(data);
        failed.delete(key);
        notify();
        return data;
      } catch {
        if (!latest()) return;
        failed.set(key, { key, payload, request, onSuccess });
        notify();
        return { error: PROGRESS_SAVE_ERROR };
      } finally {
        if (versions.get(key) === version) inFlight.delete(key);
      }
    });
    inFlight.set(key, task);
    return task;
  }

  function retry() {
    if (!active()) return Promise.resolve();
    if (retryPromise) return retryPromise;
    // Defer execution until retryPromise is set, including synchronous failures.
    retryPromise = Promise.resolve().then(() => Promise.all([...failed.values()].map(entry => inFlight.get(entry.key) || save(entry))))
      .finally(() => { retryPromise = null; notify(); });
    notify();
    return retryPromise;
  }

  return { save, retry, dispose() { disposed = true; failed.clear(); versions.clear(); inFlight.clear(); } };
}

module.exports = { createProgressSaveQueue, PROGRESS_SAVE_ERROR };
