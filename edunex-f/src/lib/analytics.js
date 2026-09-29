const GA_MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim();
const CLARITY_PROJECT_ID = String(import.meta.env.VITE_CLARITY_PROJECT_ID || "").trim();

let gaInitialized = false;
let clarityInitialized = false;

function appendAsyncScript(src, id) {
  if (typeof document === "undefined") return null;
  if (id && document.getElementById(id)) return document.getElementById(id);

  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  if (id) script.id = id;
  document.head.appendChild(script);
  return script;
}

export function initAnalytics() {
  if (typeof window === "undefined") return;

  if (GA_MEASUREMENT_ID && !gaInitialized) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
    appendAsyncScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`, "skillomate-ga4");
    gaInitialized = true;
  }

  if (CLARITY_PROJECT_ID && !clarityInitialized) {
    window.clarity = window.clarity || function clarity() {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
    appendAsyncScript(`https://www.clarity.ms/tag/${encodeURIComponent(CLARITY_PROJECT_ID)}`, "skillomate-clarity");
    clarityInitialized = true;
  }
}

export function trackPageView(path, title = document.title) {
  if (typeof window === "undefined") return;
  const pagePath = path || `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const pageLocation = `${window.location.origin}${pagePath}`;

  if (gaInitialized && typeof window.gtag === "function") {
    window.gtag("event", "page_view", {
      page_title: title,
      page_location: pageLocation,
      page_path: pagePath,
    });
  }

  if (clarityInitialized && typeof window.clarity === "function") {
    window.clarity("set", "page_path", pagePath);
  }
}
