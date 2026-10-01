import { apiUrl } from "../../lib/apiUrl.js";

export const TOKEN_KEY = "edunexAdminToken";
export const ADMIN_KEY = "edunexAdmin";

const ADMIN_STANDALONE = import.meta.env.VITE_ADMIN_STANDALONE === "true";
const ADMIN_ROUTES_DISABLED = !ADMIN_STANDALONE;
const ADMIN_BASE_PATH = ADMIN_STANDALONE ? "" : "/admin";

function adminPath(slug = "") {
  const cleanSlug = String(slug || "").replace(/^\/+|\/+$/g, "");
  if (ADMIN_STANDALONE) return cleanSlug ? `/${cleanSlug}` : "/";
  return cleanSlug ? `${ADMIN_BASE_PATH}/${cleanSlug}` : ADMIN_BASE_PATH;
}

export const adminRoutes = {
  login: adminPath("login"),
  dashboard: adminPath("dashboard"),
  analytics: adminPath("analytics"),
  aiChats: adminPath("nex-ai-chats"),
  users: adminPath("users"),
  phonePeUsers: adminPath("phonepe-users"),
  razorpayUsers: adminPath("razorpay-users"),
  testerUsers: adminPath("test-accounts"),
  testerAnalytics: adminPath("tester-analytics"),
  subscribers: adminPath("subscribers"),
  courses: adminPath("courses"),
  upload: adminPath("upload"),
  courseReview: adminPath("course-review"),
  orders: adminPath("orders"),
  payments: adminPath("payments"),
  paymentAuditor: adminPath("payment-auditor"),
  subscriptions: adminPath("subscriptions"),
  progress: adminPath("progress"),
  reports: adminPath("reports"),
  health: adminPath("system-health"),
  certifications: adminPath("certifications"),
  auditLog: adminPath("audit-log"),
  settings: adminPath("settings"),
  team: adminPath("team"),
};

const adminPageBySlug = {
  login: "login",
  dashboard: "dashboard",
  analytics: "analytics",
  "nex-ai-chats": "aiChats",
  users: "users",
  "phonepe-users": "phonePeUsers",
  "razorpay-users": "razorpayUsers",
  "test-accounts": "testerUsers",
  "tester-analytics": "testerAnalytics",
  subscribers: "subscribers",
  courses: "courses",
  upload: "upload",
  "course-review": "courseReview",
  orders: "orders",
  payments: "payments",
  "payment-auditor": "paymentAuditor",
  subscriptions: "subscriptions",
  progress: "progress",
  reports: "reports",
  "system-health": "health",
  certifications: "certifications",
  "audit-log": "auditLog",
  settings: "settings",
  team: "team",
};

const oldAdminRouteMap = {
  "admin": adminRoutes.login,
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

function normalizedPath(pathname = "/") {
  return String(pathname || "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function adminPageForCleanPath(normalized) {
  if (ADMIN_STANDALONE) {
    if (!normalized) return "login";
    return adminPageBySlug[normalized] || null;
  }
  if (!normalized.startsWith("admin")) return null;
  const slug = normalized === "admin" ? "login" : normalized.replace(/^admin\/?/, "");
  return adminPageBySlug[slug] || null;
}

export function adminPageFromPath(pathname = "/") {
  if (ADMIN_ROUTES_DISABLED) return null;
  const normalized = normalizedPath(pathname);
  const cleanPage = adminPageForCleanPath(normalized);
  if (cleanPage) return cleanPage;
  const cleanPath = oldAdminRouteMap[normalized];
  if (!cleanPath) return null;
  return adminPageForCleanPath(normalizedPath(cleanPath));
}

export function canonicalAdminPath(pathname = "/") {
  if (ADMIN_ROUTES_DISABLED) return null;
  const normalized = normalizedPath(pathname);
  if (adminPageForCleanPath(normalized)) return null;
  const oldPath = oldAdminRouteMap[normalized];
  if (!oldPath) return null;
  const oldPage = adminPageForCleanPath(normalizedPath(oldPath));
  if (!oldPage) return null;
  const routeEntry = Object.entries(adminPageBySlug).find(([, page]) => page === oldPage);
  return routeEntry ? adminPath(routeEntry[0] === "login" ? "login" : routeEntry[0]) : null;
}

export function api(path) {
  return apiUrl(path);
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

  if (response.status === 401) {
    clearSession();
    window.location.href = loginUrl();
  }

  return response;
}

export async function adminJson(path, options = {}, fallback = "Request failed.") {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, 20000);
  try {
    const response = await adminRequest(path, { ...options, signal: controller.signal });
    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();
    let data = null;

    if (raw) {
      if (contentType.includes("application/json") || /^[\s]*[\[{]/.test(raw)) {
        try {
          data = JSON.parse(raw);
        } catch (_) {
          data = null;
        }
      }
    }

    if (!response.ok) {
      const statusText = response.status ? ` (${response.status})` : "";
      const isHtml = raw && /<\s*!doctype|<\s*html|<\s*h1|<\s*body/i.test(raw);
      const message = data
        ? errorMessage(data, fallback)
        : isHtml
          ? `${fallback}${statusText} The server returned an HTML error page instead of JSON.`
          : (raw?.trim() || `${fallback}${statusText}`);
      const error = new Error(message);
      error.code = data?.code || data?.error?.code || "";
      error.status = response.status;
      throw error;
    }

    if (data !== null) return data;
    if (!raw) return {};
    throw new Error(`${fallback} The server returned a non-JSON response.`);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out or was canceled. Reload to check the latest state.');
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
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

export function formatDateTime(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
