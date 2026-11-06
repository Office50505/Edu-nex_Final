// Keep both metadata and video bytes inside an authenticated account's namespace.
function createAccountDownloadScope({ user, fs, storage, isCurrent = () => true }) {
  if (!user?._id || !user?.sessionId) return null;
  const owner = encodeURIComponent(String(user._id)).replace(/\./g, '%2E');
  const root = fs.cacheDirectory ? `${fs.cacheDirectory}skillomate_accounts/${owner}/` : null;
  let cancelled = false;
  const tasks = new Set();
  const children = new Set();
  const directories = new Set();
  const controller = new AbortController();
  const active = () => !cancelled && isCurrent();
  const check = () => {
    if (!active()) throw Object.assign(new Error('Download cancelled.'), { name: 'AbortError' });
  };
  const scopedFs = { ...fs, cacheDirectory: root, documentDirectory: null };
  for (const name of ['makeDirectoryAsync', 'deleteAsync', 'moveAsync', 'getInfoAsync', 'readAsStringAsync', 'writeAsStringAsync']) {
    scopedFs[name] = async (...args) => {
      check();
      if (name === 'makeDirectoryAsync') directories.add(args[0]);
      const result = await fs[name](...args);
      check();
      return result;
    };
  }
  scopedFs.createDownloadResumable = (url, path, options, onProgress) => {
    check();
    const task = fs.createDownloadResumable(url, path, options, progress => {
      if (active()) onProgress?.(progress);
    });
    tasks.add(task);
    return {
      async downloadAsync() {
        try {
          check();
          const result = await task.downloadAsync();
          check();
          return result;
        } finally { tasks.delete(task); }
      },
    };
  };
  const storageKey = key => `${key}:account:${owner}`;
  return {
    fs: scopedFs, root, storageKey, active, check, signal: controller.signal,
    storage: {
      async getItem(key) { check(); const value = await storage.getItem(storageKey(key)); check(); return value; },
      async setItem(key, value) { check(); await storage.setItem(storageKey(key), value); check(); },
    },
    session(session) {
      return { async requestJson(path, options = {}) {
        check();
        let abort;
        const interrupted = new Promise((_, reject) => {
          abort = () => reject(Object.assign(new Error('Download cancelled.'), { name: 'AbortError' }));
          controller.signal.addEventListener('abort', abort, { once: true });
        });
        try {
          const value = await Promise.race([session.requestJson(path, { ...options, signal: controller.signal }), interrupted]);
          check(); return value;
        } finally { controller.signal.removeEventListener('abort', abort); }
      } };
    },
    fork() {
      check();
      const child = createAccountDownloadScope({ user, fs, storage, isCurrent: active });
      children.add(child);
      child.release = () => children.delete(child);
      return child;
    },
    async cleanup() {
      // Only this task's private download directories may be removed.
      for (const path of directories) {
        if (root && path.startsWith(`${root}skillomate_dl/`)) await fs.deleteAsync(path, { idempotent: true }).catch(() => {});
      }
    },
    cancel() {
      cancelled = true;
      controller.abort();
      return Promise.allSettled([
        ...[...tasks].map(task => Promise.resolve().then(() => task.cancelAsync())),
        ...[...children].map(child => child.cancel()),
      ]);
    },
  };
}

module.exports = { createAccountDownloadScope };
