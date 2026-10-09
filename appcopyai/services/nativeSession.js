// Own credentials in one place so concurrent requests share refresh and storage writes.
const accessToken = user => user?.accessToken || user?.token || '';
const identity = user => user ? `${user._id}:${user.sessionId}` : '';
export const sessionChanged = () => Object.assign(new Error('The signed-in account changed.'), { code: 'SESSION_CHANGED' });

export function createNativeSession({ baseUrl, storage, onChange, onExpired = () => {}, onRefreshed = () => {}, fetcher = fetch, requestTimeoutMs = 30000, refreshTimeoutMs = 15000 }) {
  let current = null;
  let generation = 0;
  let refreshFlight = null;
  let persistence = Promise.resolve();

  function setUser(value) {
    const next = typeof value === 'function' ? value(current) : value;
    if (next === current) return current;
    if (identity(next) !== identity(current)) generation += 1;
    current = next;
    onChange(next);
    // Serialize writes/removals: a late token write must not resurrect a logged-out user.
    const saved = next ? JSON.stringify(next) : null;
    persistence = persistence.catch(() => {}).then(() => saved === null ? storage.removeItem('user') : storage.setItem('user', saved));
    persistence.catch(() => {});
    return next;
  }
  function assertCurrent(version) {
    if (version !== generation || !current) throw sessionChanged();
  }
  function expire(version) {
    assertCurrent(version);
    setUser(null);
    onExpired();
    throw Object.assign(new Error('Your session has ended. Please log in again.'), { code: 'SESSION_EXPIRED' });
  }
  async function json(path, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${baseUrl}${path}`, { ...options, signal: controller.signal });
      // Authentication failures are authoritative even when a proxy returns a non-JSON body.
      const data = response.status === 401 ? null : await response.json();
      return { response, data };
    } finally { clearTimeout(timer); }
  }
  async function refresh(version, rejectedToken) {
    assertCurrent(version);
    if (accessToken(current) !== rejectedToken) return;
    if (refreshFlight?.version === version) return refreshFlight.promise;
    const refreshToken = current.refreshToken;
    if (!refreshToken) return expire(version);
    const flight = { version };
    flight.promise = (async () => {
      const { response, data } = await json('/api/auth/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }),
      }, refreshTimeoutMs);
      assertCurrent(version);
      if (current.refreshToken !== refreshToken) return;
      if (response.status === 401) return expire(version);
      if (!response.ok) throw new Error('Session refresh is temporarily unavailable. Please retry.');
      if (!data?.accessToken || !data?.refreshToken || typeof data.accessToken !== 'string' || typeof data.refreshToken !== 'string'
        || String(data._id) !== String(current._id) || data.sessionId !== current.sessionId) {
        throw new Error('Session refresh returned an invalid response. Please retry.');
      }
      // Retain the latest profile fields; only this response owns the new credentials.
      setUser({ ...current, accessToken: data.accessToken, token: data.accessToken, refreshToken: data.refreshToken });
      try { await persistence; }
      catch { throw new Error('Your refreshed session could not be saved on this device. Please retry.'); }
      assertCurrent(version);
      onRefreshed(current);
    })().finally(() => { if (refreshFlight === flight) refreshFlight = null; });
    refreshFlight = flight;
    return flight.promise;
  }
  async function requestJson(path, options = {}) {
    const version = generation;
    if (!current) throw Object.assign(new Error('Please log in again.'), { code: 'SESSION_EXPIRED' });
    const token = accessToken(current);
    const send = () => json(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${accessToken(current)}` } }, requestTimeoutMs);
    try {
    let result = await send();
    assertCurrent(version);
    if (result.response.status === 401) {
      await refresh(version, token);
      assertCurrent(version);
      result = await send();
      assertCurrent(version);
      if (result.response.status === 401) return expire(version);
    }
    if (!result.response.ok) throw Object.assign(new Error(result.data?.error || 'AI is unavailable. Please try again.'), { status: result.response.status });
    return result.data;
    } catch (error) {
      if (error.code !== 'SESSION_EXPIRED' && version !== generation) throw sessionChanged();
      throw error;
    }
  }
  async function restore() {
    const version = generation;
    const saved = await storage.getItem('user');
    if (version !== generation) return current;
    let user;
    try { user = JSON.parse(saved || 'null'); } catch { user = null; }
    return setUser(user?._id && user?.sessionId ? user : null);
  }
  return { setUser, getUser: () => current, requestJson, restore, flush: () => persistence };
}
