import { apiUrl } from './apiUrl.js';

const RETRYABLE_STATUS = new Set([502, 503, 504]);

function wait(delayMs, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    if (signal?.aborted) return cancel();
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

async function responseData(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json') || typeof response.text !== 'function') return response.json();
  const text = await response.text();
  return text ? { error: text.slice(0, 300) } : {};
}

// Bound requests, tolerate one transient gateway failure, and do not hide an
// actionable HTTP status when an upstream proxy returns HTML instead of JSON.
export async function courseRequest(url, options = {}) {
  const { timeoutMs = 15000, retryDelayMs = 350, signal, ...init } = options;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; cancel(); }, timeoutMs);
  try {
    const requestUrl = apiUrl(url);
    let requestInit = init;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        let response = await fetch(requestUrl, { ...requestInit, signal: controller.signal });
        if (response.status === 401 && new Headers(requestInit.headers).has('Authorization')) {
          const refresh = window.EduNex?.refreshAccessToken;
          if (!refresh) throw new Error('Session refresh is not ready. Please retry.');
          const token = await refresh();
          if (token) {
            const headers = new Headers(requestInit.headers);
            headers.set('Authorization', `Bearer ${token}`);
            requestInit = { ...requestInit, headers };
            response = await fetch(requestUrl, { ...requestInit, signal: controller.signal });
          }
        }
        if (attempt === 0 && RETRYABLE_STATUS.has(response.status)) {
          await wait(retryDelayMs, controller.signal);
          continue;
        }
        return { response, data: await responseData(response) };
      } catch (error) {
        if (controller.signal.aborted || attempt > 0 || error.message === 'Session refresh is not ready. Please retry.') throw error;
        await wait(retryDelayMs, controller.signal);
      }
    }
    throw new Error('Could not load course data. Check your connection and retry.');
  } catch (error) {
    if (timedOut) throw new Error('The course server took too long to respond. Please retry.');
    if (signal?.aborted) throw error;
    throw new Error('Could not load course data. Check your connection and retry.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
