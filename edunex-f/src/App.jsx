import { PageErrorBoundary } from "./components/PageErrorBoundary.jsx";
import { lazy, startTransition, Suspense, useCallback, useEffect, useState } from "react";
import { Navbar } from "./components/Navbar.jsx";
import { Footer } from "./components/Footer.jsx";
import { EnxIcon } from "./components/EnxIcon.jsx";
import { ProblemReport } from "./components/ProblemReport.jsx";
import { pageKeyFromPath, route } from "./lib/routes.js";
import { hasReactPage, preloadPage, reactPageLoaders } from "./lib/pageLoaders.jsx";
import { adminPageFromPath, canonicalAdminPath } from "./pages/admin/adminApi.js";
import { usePresenceHeartbeat } from "./hooks/usePresenceHeartbeat.js";

const AdminApp = lazy(() => import("./pages/admin/AdminApp.jsx").then((module) => ({ default: module.AdminApp })));

function currentLocationState() {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  };
}

function routeFromState(state) {
  return `${state.pathname}${state.search}${state.hash}`;
}

function shouldUseAppNavigation(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null;
  }

  const anchor = event.target.closest?.("a[href]");
  if (!anchor) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;

  const rawHref = anchor.getAttribute("href") || "";
  if (!rawHref || rawHref.startsWith("#")) return null;
  if (/^(mailto:|tel:|sms:|data:|blob:|javascript:)/i.test(rawHref)) return null;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return null;

  const nextPageKey = pageKeyFromPath(url.pathname);
  const nextAdminPage = adminPageFromPath(url.pathname);
  if (!nextAdminPage && !hasReactPage(nextPageKey)) return null;

  return { url, pageKey: nextAdminPage ? null : nextPageKey };
}

function scrollAfterNavigation(hash) {
  requestAnimationFrame(() => {
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

function goBackSafely() {
  if (window.history.length > 1 && document.referrer) {
    window.history.back();
    return;
  }
  window.location.href = route("index.html");
}

function NotFoundPage() {
  return (
    <main className="enx-not-found" aria-labelledby="not-found-title">
      <section className="enx-not-found-shell">
        <div className="enx-not-found-icon" aria-hidden="true">
          <EnxIcon name="sparkles" />
        </div>
        <p className="enx-not-found-kicker">404</p>
        <h1 id="not-found-title">Page not found</h1>
        <p className="enx-not-found-copy">
          The page you're looking for may have moved, been removed, or the link may be incorrect.
        </p>
        <div className="enx-not-found-actions">
          <a className="enx-not-found-primary" href={route("index.html")}>
            Go Home <EnxIcon name="arrowRight" />
          </a>
          <a className="enx-not-found-secondary" href={route("courses.html")}>Explore Courses</a>
          <button className="enx-not-found-ghost" type="button" onClick={goBackSafely}>Go Back</button>
        </div>
      </section>
    </main>
  );
}

function PageLoading() {
  return (
    <main className="enx-page-loading" aria-live="polite" aria-busy="true">
      <section className="enx-page-loading-card">
        <div className="enx-page-loading-mark" aria-hidden="true">
          <EnxIcon name="sparkles" />
        </div>
        <p>Loading Skillomate...</p>
      </section>
    </main>
  );
}

export default function App() {
  const [locationState, setLocationState] = useState(currentLocationState);
  const [reportOpen, setReportOpen] = useState(false);
  const adminPage = adminPageFromPath(locationState.pathname);
  const pageKey = pageKeyFromPath(locationState.pathname);
  const standaloneOffer = pageKey === "offer.html";
  const ReactPage = reactPageLoaders[pageKey];
  const routeKey = routeFromState(locationState);
  const openProblemReport = useCallback(() => setReportOpen(true), []);
  const closeProblemReport = useCallback(() => setReportOpen(false), []);
  usePresenceHeartbeat(!adminPage);

  const syncLocation = useCallback((nextState = currentLocationState()) => {
    startTransition(() => {
      setLocationState(nextState);
    });
  }, []);

  useEffect(() => {
    const adminCanonicalRoute = canonicalAdminPath(locationState.pathname);
    if (adminCanonicalRoute) {
      const nextState = {
        pathname: adminCanonicalRoute,
        search: locationState.search,
        hash: locationState.hash,
      };
      window.history.replaceState(
        window.history.state,
        "",
        routeFromState(nextState)
      );
      syncLocation(nextState);
      return;
    }
    if (adminPage) return;

    const canonicalRoute = route(`${pageKey}${locationState.search}${locationState.hash}`);
    const currentRoute = routeFromState(locationState);
    if (canonicalRoute !== currentRoute) {
      window.history.replaceState(window.history.state, "", canonicalRoute);
      syncLocation(currentLocationState());
    }
  }, [adminPage, locationState, pageKey, syncLocation]);

  useEffect(() => {
    const handlePopState = () => syncLocation();
    const handleClick = (event) => {
      const next = shouldUseAppNavigation(event);
      if (!next) return;

      event.preventDefault();
      if (next.pageKey) void preloadPage(next.pageKey);

      const nextState = {
        pathname: next.url.pathname,
        search: next.url.search,
        hash: next.url.hash,
      };
      const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const nextRoute = routeFromState(nextState);
      if (nextRoute !== currentRoute) {
        window.history.pushState(window.history.state, "", nextRoute);
      }
      syncLocation(nextState);
      window.dispatchEvent(new CustomEvent("edunex:route-changed", { detail: nextState }));
      scrollAfterNavigation(nextState.hash);
    };

    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleClick);
    };
  }, [syncLocation]);

  useEffect(() => {
    window.addEventListener("skillomate:open-problem-report", openProblemReport);
    return () => window.removeEventListener("skillomate:open-problem-report", openProblemReport);
  }, [openProblemReport]);

  if (adminPage) {
    return (
      <Suspense fallback={<PageLoading />}>
        <AdminApp key={routeKey} page={adminPage} />
      </Suspense>
    );
  }

  if (!ReactPage) {
    document.title = "Page Not Found | Skillomate";
  }

  return (
    <>
      {!standaloneOffer ? <Navbar pageKey={pageKey} onReportProblem={openProblemReport} /> : null}
      {ReactPage ? (
        <PageErrorBoundary key={routeKey}>
          <Suspense fallback={<PageLoading />}>
            <ReactPage key={routeKey} />
          </Suspense>
        </PageErrorBoundary>
      ) : null}
      {!ReactPage ? <NotFoundPage /> : null}
      {!standaloneOffer ? <Footer /> : null}
      {!standaloneOffer ? <ProblemReport open={reportOpen} onClose={closeProblemReport} /> : null}
    </>
  );
}
