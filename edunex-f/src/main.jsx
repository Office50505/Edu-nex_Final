import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/fonts.css";

const ADMIN_STANDALONE = import.meta.env.VITE_ADMIN_STANDALONE === "true";

function loadDeferredAiWidget() {
  void import("../js/nex-ai-widget.js").catch((error) => {
    console.error("Nex AI widget could not be loaded:", error);
  });
}

function scheduleDeferredTask(task, delay, { onUserIntent = true } = {}) {
  let started = false;
  let timer = 0;

  function cleanup() {
    window.clearTimeout(timer);
    window.removeEventListener("pointerdown", run);
    window.removeEventListener("keydown", run);
    window.removeEventListener("touchstart", run);
    window.removeEventListener("load", schedule);
  }

  function run() {
    if (started) return;
    started = true;
    cleanup();
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(task, { timeout: 1500 });
      return;
    }
    window.setTimeout(task, 0);
  }

  function schedule() {
    timer = window.setTimeout(run, delay);
  }

  if (onUserIntent) {
    window.addEventListener("pointerdown", run, { once: true, passive: true });
    window.addEventListener("keydown", run, { once: true });
    window.addEventListener("touchstart", run, { once: true, passive: true });
  }
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

function routeFromLocation() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function shouldUseAdminNavigation(event, adminPageFromPath) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = event.target.closest?.("a[href]");
  if (!anchor) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;

  const rawHref = anchor.getAttribute("href") || "";
  if (!rawHref || rawHref.startsWith("#")) return null;
  if (/^(mailto:|tel:|sms:|data:|blob:|javascript:)/i.test(rawHref)) return null;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (!adminPageFromPath(url.pathname)) return null;
  return url;
}

async function renderAdminStandalone(root) {
  const { AdminApp, adminPageFromPath } = await import("./pages/admin/AdminApp.jsx");

  function AdminStandaloneRoot() {
    const [routeKey, setRouteKey] = useState(routeFromLocation);
    const page = adminPageFromPath(window.location.pathname) || "login";

    useEffect(() => {
      const syncRoute = () => setRouteKey(routeFromLocation());
      const handleClick = (event) => {
        const url = shouldUseAdminNavigation(event, adminPageFromPath);
        if (!url) return;

        event.preventDefault();
        const nextRoute = `${url.pathname}${url.search}${url.hash}`;
        if (nextRoute !== routeFromLocation()) {
          window.history.pushState(window.history.state, "", nextRoute);
        }
        syncRoute();
      };

      window.addEventListener("popstate", syncRoute);
      document.addEventListener("click", handleClick);
      return () => {
        window.removeEventListener("popstate", syncRoute);
        document.removeEventListener("click", handleClick);
      };
    }, []);

    return <AdminApp key={routeKey} page={page} />;
  }

  root.render(<AdminStandaloneRoot />);
}

async function renderMainFrontend(root) {
  await Promise.all([
    import("../js/edunex-api.js"),
    import("./styles/app.css"),
    import("./styles/mobile-footer-fix.css"),
    import("../css/theme.css"),
  ]);
  const [{ default: App }, { initAnalytics }] = await Promise.all([
    import("./App.jsx"),
    import("./lib/analytics.js"),
  ]);

  root.render(<App />);
  scheduleDeferredTask(initAnalytics, 4000);
  scheduleDeferredTask(loadDeferredAiWidget, 6000, { onUserIntent: false });
}

const root = createRoot(document.getElementById("root"));
if (ADMIN_STANDALONE) {
  void renderAdminStandalone(root);
} else {
  void renderMainFrontend(root);
}
