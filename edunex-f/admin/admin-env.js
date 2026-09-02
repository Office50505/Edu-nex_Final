window.EDUNEX_ADMIN_ENV = {
  API_BASE_URL: ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:3000'
    : 'https://edunex-b-production.up.railway.app',
  BUNNY_STREAM_LIBRARY_ID: '675520',
  BUNNY_STREAM_CDN_HOSTNAME: 'vz-de7b157c-7fc.b-cdn.net',
};

window.EDUNEX_ADMIN_API_BASE = window.EDUNEX_ADMIN_ENV.API_BASE_URL.replace(/\/$/, '');
window.adminApi = function adminApi(path) {
  return `${window.EDUNEX_ADMIN_API_BASE}${path}`;
};
