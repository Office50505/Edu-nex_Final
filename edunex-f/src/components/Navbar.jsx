import { useEffect, useMemo, useState } from "react";
import { EnxIcon } from "./EnxIcon.jsx";
import { route } from "../lib/routes.js";

const navItems = [
  { pageKey: "index.html", href: route("index.html"), label: "Home" },
  { pageKey: "courses.html", href: route("courses.html"), label: "Courses" },
  { pageKey: "dashboard.html", href: route("dashboard.html"), label: "Dashboard" },
  { pageKey: "about.html", href: route("about.html"), label: "About" },
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
  const avatarSrc = useMemo(() => auth.user?.avatar || avatarFallback(auth.user), [auth.user]);
  const greeting = auth.token ? `Hi, ${firstName(auth.user)}` : "";
  const handleLogout = () => {
    clearAuthStorage();
    setAuth({ token: false, user: null });
    setOpen(false);
    window.dispatchEvent(new Event("edunex:auth-changed"));
    window.location.href = route("index.html");
  };

  return (
    <>
      <nav className="enx-navbar react-navbar">
        <div className="enx-nav-inner">
          <a href={route("index.html")} className="enx-nav-logo">EduNex <span>AI</span></a>
          <ul className="enx-nav-links">
            {navItems.map((item) => (
              <li key={item.href}>
                <a href={item.href} className={current === item.pageKey ? "active" : undefined}>{item.label}</a>
              </li>
            ))}
          </ul>
          <div className="enx-nav-right">
            {greeting ? <span className="enx-nav-greeting">{greeting}</span> : null}
            {!auth.token ? <a href={route("login.html")} className="enx-nav-login">Login</a> : null}
            {auth.token ? <button type="button" className="enx-nav-logout" onClick={handleLogout}>Log out</button> : null}
            <a href={route("profile.html")} className={`enx-nav-avatar${current === "profile.html" ? " active" : ""}`} title={profileLabel} aria-label={profileLabel}>
              {auth.token && auth.user ? <img src={avatarSrc} alt={profileLabel} /> : <EnxIcon name="user" />}
            </a>
          </div>
          <button className="enx-nav-hamburger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>

      <div className="enx-mobile-menu" style={{ display: open ? "flex" : "none" }}>
        {navItems.map((item) => (
          <a key={item.href} href={item.href} className={current === item.pageKey ? "active" : undefined}>{item.label}</a>
        ))}
        <div className="enx-mobile-actions">
          {auth.token ? (
            <>
              <a href={route("profile.html")}>Profile</a>
              <button type="button" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <>
              <a href={route("login.html")}>Login</a>
              <a href={route("login.html")}>Get Started</a>
            </>
          )}
        </div>
        {greeting ? <span className="enx-mobile-greeting">{greeting}</span> : null}
      </div>
    </>
  );
}
