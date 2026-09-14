import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "./BrandLogo.jsx";
import { EnxIcon } from "./EnxIcon.jsx";
import { preloadPage } from "../lib/pageLoaders.jsx";
import { route } from "../lib/routes.js";

const homeNavItem = { pageKey: "index.html", href: route("index.html"), label: "Home", icon: "home" };
const coursesNavItem = { pageKey: "courses.html", href: route("courses.html"), label: "Courses", icon: "bookOpen" };
const dashboardNavItem = { pageKey: "dashboard.html", href: route("dashboard.html"), label: "Dashboard", icon: "dashboard" };
const pricingNavItem = { pageKey: "pricing.html", href: route("pricing.html"), label: "Pricing", icon: "creditCard" };
const aboutNavItem = { pageKey: "about.html", href: route("about.html"), label: "About", icon: "info" };

const navItems = [
  homeNavItem,
  coursesNavItem,
  dashboardNavItem,
  pricingNavItem,
  aboutNavItem,
];

const mobileFooterItems = [
  homeNavItem,
  coursesNavItem,
  { pageKey: "ai-tutor.html", label: "AI", icon: "sparkles", action: "nex-ai" },
  dashboardNavItem,
  aboutNavItem,
];

function readUser() {
  try {
    const raw = localStorage.getItem("edunexUser") || sessionStorage.getItem("edunexUser");
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function hasToken() {
  return Boolean(localStorage.getItem("edunexAccessToken") || sessionStorage.getItem("edunexAccessToken"));
}

function avatarFallback(user) {
  const label = user?.fullName || user?.name || user?.email || user?.mobileNumber || "E";
  const initial = String(label).trim().charAt(0).toUpperCase() || "E";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="80" fill="#F3E4C8"/><rect x="2" y="2" width="156" height="156" rx="78" fill="#FFFDF8" stroke="#DAB77A" stroke-width="4"/><text x="80" y="96" text-anchor="middle" fill="#C58B2A" font-family="Arial, sans-serif" font-size="62" font-weight="800">${initial}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizePageKey(pageKey) {
  return pageKey || "index.html";
}

function firstName(user) {
  const label = user?.fullName || user?.name || user?.email || user?.mobileNumber || "";
  const first = String(label).trim().split(/\s+/)[0] || "Learner";
  return first.includes("@") ? first.split("@")[0] : first;
}

function clearAuthStorage() {
  ["edunexAccessToken", "edunexRefreshToken", "edunexUser"].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

export function Navbar({ pageKey }) {
  const [open, setOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState("");
  const [auth, setAuth] = useState(() => ({ token: hasToken(), user: readUser() }));
  const current = normalizePageKey(pageKey);

  useEffect(() => {
    const syncAuth = () => setAuth({ token: hasToken(), user: readUser() });
    window.addEventListener("storage", syncAuth);
    window.addEventListener("edunex:auth-changed", syncAuth);
    window.addEventListener("edunex:page-ready", syncAuth);
    syncAuth();
    return () => {
      window.removeEventListener("storage", syncAuth);
      window.removeEventListener("edunex:auth-changed", syncAuth);
      window.removeEventListener("edunex:page-ready", syncAuth);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pageKey]);

  const profileLabel = auth.user?.fullName || auth.user?.email || auth.user?.mobileNumber || "Profile Settings";
  const navAvatarFallback = useMemo(() => avatarFallback(auth.user), [auth.user]);
  const avatarSrc = auth.user?.avatar || navAvatarFallback;
  const greeting = auth.token ? `Hi, ${firstName(auth.user)}` : "";
  const preloadNavPage = (targetPageKey) => {
    if (!targetPageKey || targetPageKey === current) return;
    void preloadPage(targetPageKey);
  };
  const handleLogout = () => {
    clearAuthStorage();
    setAuth({ token: false, user: null });
    setOpen(false);
    window.dispatchEvent(new Event("edunex:auth-changed"));
    window.location.href = route("index.html");
  };
  const handleMobileSearch = (event) => {
    event.preventDefault();
    const formValue = new FormData(event.currentTarget).get("q");
    const value = String(formValue || mobileSearch).trim();
    window.location.href = value ? route(`courses.html?search=${encodeURIComponent(value)}`) : route("courses.html");
  };
  const handleNavAvatarError = (event) => {
    if (event.currentTarget.src !== navAvatarFallback) {
      event.currentTarget.src = navAvatarFallback;
    }
  };
  const openMobileNexAi = (event) => {
    event.preventDefault();
    const widgetRoot = document.getElementById("nex-ai-widget-root");
    const floatButton = document.getElementById("nai-float-btn");
    const widgetAvailable = widgetRoot && getComputedStyle(widgetRoot).display !== "none";
    if (widgetAvailable) {
      if (window.NexAIWidget?.open) {
        window.NexAIWidget.open();
      } else {
        floatButton?.click();
      }
      return;
    }
    window.location.href = route("ai-tutor.html");
  };

  return (
    <>
      <nav className="enx-navbar react-navbar">
        <div className="enx-nav-inner">
          <a href={route("index.html")} className="enx-nav-logo" aria-label="Skillomate AI home">
            <BrandLogo />
          </a>
          <form className="enx-mobile-top-search" role="search" onSubmit={handleMobileSearch}>
            <label className="enx-mobile-top-search-field">
              <EnxIcon name="search" />
              <input
                type="search"
                name="q"
                value={mobileSearch}
                onChange={(event) => setMobileSearch(event.target.value)}
                placeholder="Search"
                aria-label="Search courses"
              />
            </label>
          </form>
          <ul className="enx-nav-links">
            {navItems.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={current === item.pageKey ? "active" : undefined}
                  onMouseEnter={() => preloadNavPage(item.pageKey)}
                  onFocus={() => preloadNavPage(item.pageKey)}
                  onTouchStart={() => preloadNavPage(item.pageKey)}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="enx-nav-right">
            {greeting ? <span className="enx-nav-greeting">{greeting}</span> : null}
            {!auth.token ? <a href={route("login.html")} className="enx-nav-login" onMouseEnter={() => preloadNavPage("login.html")} onFocus={() => preloadNavPage("login.html")} onTouchStart={() => preloadNavPage("login.html")}>Login</a> : null}
            {auth.token ? <button type="button" className="enx-nav-logout" onClick={handleLogout}><EnxIcon name="logout" className="enx-logout-icon" />Log out</button> : null}
            <a href={route("profile.html")} className={`enx-nav-avatar${current === "profile.html" ? " active" : ""}`} title={profileLabel} aria-label={profileLabel} onMouseEnter={() => preloadNavPage("profile.html")} onFocus={() => preloadNavPage("profile.html")} onTouchStart={() => preloadNavPage("profile.html")}>
              {auth.token && auth.user ? <img src={avatarSrc} alt={profileLabel} onError={handleNavAvatarError} /> : <EnxIcon name="user" />}
            </a>
          </div>
          <a href={auth.token ? route("profile.html") : route("login.html")} className={`enx-mobile-top-account${current === "profile.html" ? " active" : ""}`} title={profileLabel} aria-label={auth.token ? profileLabel : "Login"} onTouchStart={() => preloadNavPage(auth.token ? "profile.html" : "login.html")} onFocus={() => preloadNavPage(auth.token ? "profile.html" : "login.html")}>
            {auth.token && auth.user ? <img src={avatarSrc} alt={profileLabel} onError={handleNavAvatarError} /> : <EnxIcon name="user" />}
          </a>
          <button className="enx-nav-hamburger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>

      <div className="enx-mobile-menu" style={{ display: open ? "flex" : "none" }}>
        {navItems.map((item) => (
          <a key={item.href} href={item.href} className={current === item.pageKey ? "active" : undefined} onTouchStart={() => preloadNavPage(item.pageKey)} onFocus={() => preloadNavPage(item.pageKey)}>{item.label}</a>
        ))}
        <div className="enx-mobile-actions">
          {auth.token ? (
            <>
              <a href={route("profile.html")} onTouchStart={() => preloadNavPage("profile.html")} onFocus={() => preloadNavPage("profile.html")}>Profile</a>
              <button type="button" onClick={handleLogout}><EnxIcon name="logout" className="enx-logout-icon" />Log out</button>
            </>
          ) : (
            <>
              <a href={route("login.html")} onTouchStart={() => preloadNavPage("login.html")} onFocus={() => preloadNavPage("login.html")}>Login</a>
              <a href={route("login.html")} onTouchStart={() => preloadNavPage("login.html")} onFocus={() => preloadNavPage("login.html")}>Get Started</a>
            </>
          )}
        </div>
        {greeting ? <span className="enx-mobile-greeting">{greeting}</span> : null}
      </div>

      <nav className="enx-mobile-footer" aria-label="Primary mobile navigation">
        <div className="enx-mobile-footer-shell">
          {mobileFooterItems.map((item) => {
            const active = current === item.pageKey;
            return item.action === "nex-ai" ? (
              <button
                key={item.action}
                type="button"
                className="enx-mobile-footer-link enx-mobile-ai-link"
                aria-label="Open Nex AI"
                onPointerEnter={() => preloadNavPage("ai-tutor.html")}
                onFocus={() => preloadNavPage("ai-tutor.html")}
                onClick={openMobileNexAi}
              >
                <EnxIcon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ) : (
              <a
                key={item.href}
                href={item.href}
                className={`enx-mobile-footer-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
                onPointerEnter={() => preloadNavPage(item.pageKey)}
                onFocus={() => preloadNavPage(item.pageKey)}
              >
                <EnxIcon name={item.icon} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </div>
      </nav>
    </>
  );
}
