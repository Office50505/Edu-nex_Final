function configuredApiBaseUrl() {
  const metaBase = globalThis.document
    ?.querySelector('meta[name="skillomate-api-base-url"]')
    ?.getAttribute("content");
  const raw = String(metaBase || import.meta.env?.VITE_API_BASE_URL || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "").replace(/\/api$/i, "")}`;
  } catch (_) {
    return "";
  }
}

export function apiUrl(path) {
  const builder = globalThis.window?.EduNex?.apiUrl;
  if (typeof builder === "function") return builder(path);

  const raw = String(path || "").trim();
  if (/^(https?:)?\/\//i.test(raw)) return raw;

  const rooted = `/${raw.replace(/^\/+/, "")}`;
  const apiPath = rooted === "/api" || rooted.startsWith("/api/")
    ? rooted
    : `/api${rooted === "/" ? "" : rooted}`;
  const baseUrl = configuredApiBaseUrl();
  return baseUrl ? `${baseUrl}${apiPath}` : apiPath;
}

export function apiFetch(path, options) {
  return fetch(apiUrl(path), options);
}
