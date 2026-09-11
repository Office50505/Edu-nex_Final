export const TOKEN_KEY = "edunexAdminToken";
export const ADMIN_KEY = "edunexAdmin";

export const adminRoutes = {
  login: "/admin/login",
  dashboard: "/admin/dashboard",
  users: "/admin/users",
  courses: "/admin/courses",
  upload: "/admin/upload",
  health: "/admin/system-health",
  certifications: "/admin/certifications",
};

const oldAdminRouteMap = {
  "admin/admin-login": adminRoutes.login,
  "admin/admin-login.html": adminRoutes.login,
  "admin-login": adminRoutes.login,
  "admin-login.html": adminRoutes.login,
  "admin/admin-dashboard": adminRoutes.dashboard,
  "admin/admin-dashboard.html": adminRoutes.dashboard,
  "admin-dashboard": adminRoutes.dashboard,
  "admin-dashboard.html": adminRoutes.dashboard,
  "admin/admin-users": adminRoutes.users,
  "admin/admin-users.html": adminRoutes.users,
  "admin-users": adminRoutes.users,
  "admin-users.html": adminRoutes.users,
  "admin/admin-courses": adminRoutes.courses,
  "admin/admin-courses.html": adminRoutes.courses,
  "admin-courses": adminRoutes.courses,
  "admin-courses.html": adminRoutes.courses,
  "admin/course-posting": adminRoutes.upload,
  "admin/course-posting.html": adminRoutes.upload,
  "course-posting": adminRoutes.upload,
  "course-posting.html": adminRoutes.upload,
};

const cleanAdminRouteMap = {
  "admin/login": "login",
  "admin/dashboard": "dashboard",
  "admin/users": "users",
  "admin/courses": "courses",
  "admin/upload": "upload",
  "admin/system-health": "health",
  "admin/certifications": "certifications",
};

function normalizedPath(pathname = "/") {
  return String(pathname || "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function adminPageFromPath(pathname = "/") {
  const normalized = normalizedPath(pathname);
  if (cleanAdminRouteMap[normalized]) return cleanAdminRouteMap[normalized];
  const cleanPath = oldAdminRouteMap[normalized];
  if (!cleanPath) return null;
  return cleanAdminRouteMap[normalizedPath(cleanPath)] || null;
}

export function canonicalAdminPath(pathname = "/") {
  const normalized = normalizedPath(pathname);
  if (cleanAdminRouteMap[normalized]) return null;
  return oldAdminRouteMap[normalized] || null;
}

export function api(path) {
  const base = (window.EDUNEX_ADMIN_API_BASE || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
}

export function getAdmin() {
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_KEY) || localStorage.getItem(ADMIN_KEY) || "null");
  } catch (_) {
    return null;
  }
}

export function saveSession(data, remember) {
  const store = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  store.setItem(TOKEN_KEY, data.adminToken || data.token || "");
  store.setItem(ADMIN_KEY, JSON.stringify(data.admin || null));
  other.removeItem(TOKEN_KEY);
  other.removeItem(ADMIN_KEY);
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ADMIN_KEY);
}

export function loginUrl() {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (window.location.pathname === adminRoutes.login) return adminRoutes.login;
  return `${adminRoutes.login}?next=${encodeURIComponent(current)}`;
}

export function requireAdmin() {
  if (getToken()) return true;
  window.location.href = loginUrl();
  return false;
}

export function errorMessage(data, fallback = "Request failed.") {
  if (typeof data?.message === "string" && data.message.trim()) return data.message;
  if (typeof data?.error === "string" && data.error.trim()) return data.error;
  if (typeof data?.error?.message === "string" && data.error.message.trim()) return data.error.message;
  if (typeof data?.error?.code === "string" && data.error.code.trim()) return data.error.code;
  return fallback;
}

export async function adminRequest(path, options = {}) {
  const token = getToken();
  const response = await fetch(api(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
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

export async function adminJson(path, options = {}, fallback = "Request failed.") {
  const response = await adminRequest(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(data, fallback));
  return data;
}

export async function logout() {
  const token = getToken();
  try {
    if (token) {
      await fetch(api("/api/admin/logout"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch (_) {
    // Local cleanup is enough if the server is unreachable.
  }
  clearSession();
  window.location.href = adminRoutes.login;
}

export function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("en-IN") : "0";
}

export function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatWatchDuration(value) {
  const minutes = Number(value || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  if (minutes < 60) return `${formatNumber(Math.round(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return remainingMinutes ? `${formatNumber(hours)}h ${formatNumber(remainingMinutes)}m` : `${formatNumber(hours)}h`;
}
