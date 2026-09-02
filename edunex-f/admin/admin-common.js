(function () {
  const TOKEN_KEY = 'edunexAdminToken';
  const ADMIN_KEY = 'edunexAdmin';

  function page(name) {
    return name;
  }

  function api(path) {
    if (typeof window.adminApi === 'function') return window.adminApi(path);
    const base = (window.EDUNEX_ADMIN_API_BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
    return `${base}${path}`;
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  }

  function getAdmin() {
    try {
      return JSON.parse(sessionStorage.getItem(ADMIN_KEY) || localStorage.getItem(ADMIN_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function saveSession(data, remember) {
    const store = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    store.setItem(TOKEN_KEY, data.adminToken || '');
    store.setItem(ADMIN_KEY, JSON.stringify(data.admin || null));
    other.removeItem(TOKEN_KEY);
    other.removeItem(ADMIN_KEY);
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
  }

  function loginUrl() {
    const next = window.location.pathname.split('/').pop() || 'admin-dashboard.html';
    return `${page('admin-login.html')}?next=${encodeURIComponent(next + window.location.search)}`;
  }

  function requireAdmin() {
    const token = getToken();
    if (!token) {
      window.location.href = loginUrl();
      return '';
    }
    return token;
  }

  async function request(path, options = {}) {
    const token = getToken();
    const response = await fetch(api(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (response.status === 401 || response.status === 403) {
      clearSession();
      window.location.href = loginUrl();
    }

    return response;
  }

  async function logout() {
    const token = getToken();
    try {
      if (token) {
        await fetch(api('/api/admin/logout'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (_) {
      // Local session cleanup is still required if the network is unavailable.
    }
    clearSession();
    window.location.href = page('admin-login.html');
  }

  function showMessage(element, text, type) {
    if (!element) return;
    element.textContent = text || '';
    element.className = `message${text ? ` ${type || 'success'}` : ''}`;
  }

  function errorMessage(data, fallback) {
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
    if (typeof data?.error?.message === 'string' && data.error.message.trim()) return data.error.message;
    if (typeof data?.error?.code === 'string' && data.error.code.trim()) return data.error.code;
    return fallback;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toLocaleString('en-IN') : '0';
  }

  function formatDate(value) {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not available';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  window.AdminPanel = {
    api,
    clearSession,
    escapeHtml,
    errorMessage,
    formatDate,
    formatNumber,
    getAdmin,
    getToken,
    logout,
    page,
    request,
    requireAdmin,
    saveSession,
    showMessage,
  };
})();
