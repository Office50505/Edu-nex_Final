// Bound both the request and response body so course loading cannot hang forever.
export async function courseRequest(url, options = {}) {
  const { timeoutMs = 15000, signal, ...init } = options;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; cancel(); }, timeoutMs);
  try {
    let response = await fetch(url, { ...init, signal: controller.signal });
    if (response.status === 401 && new Headers(init.headers).has('Authorization')) {
      const refresh = window.EduNex?.refreshAccessToken;
      if (!refresh) throw new Error('Session refresh is not ready. Please retry.');
      const token = await refresh();
      if (token) {
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${token}`);
        response = await fetch(url, {...init, headers, signal: controller.signal});
      }
    }
    const data = await response.json();
    return { response, data };
  } catch (error) {
    if (timedOut) throw new Error('The course server took too long to respond. Please retry.');
    if (signal?.aborted) throw error;
    throw new Error('Could not load course data. Check your connection and retry.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
