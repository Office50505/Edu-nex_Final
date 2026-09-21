export function apiUrl(path) {
  const builder = globalThis.window?.EduNex?.apiUrl;
  return typeof builder === "function" ? builder(path) : path;
}

export function apiFetch(path, options) {
  return fetch(apiUrl(path), options);
}
