import { useAdminPermissions, AdminWrite } from "./AdminPermissions.jsx";
import { useEffect, useState } from "react";
import { adminRoutes, logout } from "./adminApi.js";

const sections = [
  { label: 'Workspace', links: [['dashboard', 'Dashboard', adminRoutes.dashboard, 'home']] },
  { label: 'Operate', links: [['users', 'Learners', adminRoutes.users, 'users'], ['testerAnalytics', 'Tester analytics', adminRoutes.testerAnalytics, 'test'], ['courses', 'Courses', adminRoutes.courses, 'book'], ['subscriptions', 'Subscriptions', adminRoutes.subscriptions, 'loop'], ['payments', 'Payments', adminRoutes.payments, 'pay'], ['reports', 'Reports', adminRoutes.reports, 'flag']] },
  { label: 'Create', links: [['upload', 'Create course', adminRoutes.upload, 'plus'], ['courseReview', 'Course review', adminRoutes.courseReview, 'check'], ['certifications', 'Certification', adminRoutes.certifications, 'award']] },
  { label: 'System', links: [['paymentAuditor', 'Payment auditor', adminRoutes.paymentAuditor, 'audit'], ['health', 'System health', adminRoutes.health, 'pulse'], ['auditLog', 'Audit log', adminRoutes.auditLog, 'log'], ['settings', 'Settings', adminRoutes.settings, 'gear'], ['team', 'Team access', adminRoutes.team, 'users']] },
];

export function Message({ text, type = "success" }) {
  return text ? <div className={`message ${type}`} role={type === 'error' ? 'alert' : 'status'}>{text}</div> : null;
}

function NavIcon({ type }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  const paths = {
    home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10.5V20h14v-9.5" /><path d="M9 20v-6h6v6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    test: <><path d="M9 3h6" /><path d="M10 3v5l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3" /><path d="M8 14h8" /><path d="M10 18h4" /></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4v15.5" /><path d="M6.5 4H20v13H6.5A2.5 2.5 0 0 0 4 19.5" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    check: <><path d="M20 6 9 17l-5-5" /><path d="M4 4h16v16H4z" /></>,
    bag: <><path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
    pay: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /><path d="M7 15h2" /></>,
    audit: <><path d="M9 4h6" /><path d="M9 2h6v4H9z" /><path d="M6 4H5a2 2 0 0 0-2 2v14h18V6a2 2 0 0 0-2-2h-1" /><path d="m7 12 2 2 4-4" /><path d="M7 18h10" /></>,
    loop: <><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="m7 23-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
    trend: <><path d="m3 17 6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
    award: <><circle cx="12" cy="8" r="5" /><path d="m8.5 12.5-1 8 4.5-2 4.5 2-1-8" /></>,
    flag: <><path d="M5 22V4" /><path d="M5 5c4-3 7 3 14 0v10c-7 3-10-3-14 0" /></>,
    pulse: <><path d="M22 12h-4l-3 8-6-16-3 8H2" /></>,
    log: <><path d="M4 5h16" /><path d="M4 12h16" /><path d="M4 19h10" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6V20h-4v-.08a1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1H4v-4h.08a1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.86-2.86.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6V4h4v.08a1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 .6 1H20v4h-.08a1.7 1.7 0 0 0-.52 1Z" /></>,
  };
  return <svg className="admin-nav-icon" {...common}>{paths[type] || paths.home}</svg>;
}

export function AdminShell({ activePage, title, subtitle, children, actions = null, shellClass = "dashboard-shell", navLabels = {} }) {
  const { canWrite, canManageRoles } = useAdminPermissions();
  const [theme, setTheme] = useState(() => localStorage.getItem("edunexAdminTheme") || "light");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    document.body.classList.toggle("admin-theme-light", theme === "light");
    document.body.classList.toggle("admin-theme-dark", theme !== "light");
    document.body.classList.toggle("admin-sidebar-collapsed", collapsed);
    document.body.classList.toggle("admin-mobile-menu-open", mobileMenuOpen);
    localStorage.setItem("edunexAdminTheme", theme);
  }, [theme, collapsed, mobileMenuOpen]);
  const section = sections.find(item => item.links.some(([key]) => key === activePage))?.label || 'Command';
  return (
    <div className={`admin-workspace${collapsed ? " is-collapsed" : ""}`}>
      <a className="admin-skip-link" href="#admin-main">Skip to content</a>
      <aside className="admin-sidebar">
        <div className="admin-sidebar-top">
          <a className="admin-workspace-brand" href={adminRoutes.dashboard}>
            <span className="admin-brand-symbol" aria-hidden="true">
              <img className="admin-theme-icon admin-icon-dark" src="/assets/brand/skillomate-admin-icon-dark.png" alt="" />
              <img className="admin-theme-icon admin-icon-light" src="/assets/brand/skillomate-admin-icon-light.png" alt="" />
            </span>
            <span className="admin-brand-copy">
              <span className="admin-brand-name" aria-label="Skillomate">
                <span className="admin-brand-text">Skill</span>
                <span className="admin-brand-o" aria-hidden="true">
                  <img className="admin-brand-o-image admin-icon-dark" src="/assets/brand/skillomate-wordmark-symbol-dark.png" alt="" />
                  <img className="admin-brand-o-image admin-icon-light" src="/assets/brand/skillomate-wordmark-symbol-light.png" alt="" />
                </span>
                <span className="admin-brand-mate">mate</span>
              </span>
              <small>ADMIN WORKSPACE</small>
            </span>
          </a>
          <button className="admin-sidebar-toggle" type="button" onClick={() => setCollapsed(value => !value)} aria-pressed={collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? ">" : "<"}</button>
          <button className="admin-mobile-menu-button" type="button" onClick={() => setMobileMenuOpen(value => !value)} aria-expanded={mobileMenuOpen} aria-controls="admin-mobile-nav" aria-label={mobileMenuOpen ? "Close admin navigation" : "Open admin navigation"}>
            <span />
            <span />
            <span />
          </button>
        </div>
        <nav id="admin-mobile-nav" aria-label="Administration sections">
          {sections.map(group => <div className="admin-nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.links.filter(([key]) => (canWrite || key !== "upload") && (canManageRoles || key !== "team")).map(([key, label, href, icon]) => <a key={key} href={href} title={navLabels[key] || label} onClick={() => setMobileMenuOpen(false)} className={activePage === key ? 'is-active' : ''} aria-current={activePage === key ? 'page' : undefined}><NavIcon type={icon} /><span>{navLabels[key] || label}</span></a>)}
          </div>)}
        </nav>
        <div className="admin-sidebar-footer">
          <a className="admin-sidebar-site-link" href="/" target="_blank" rel="noreferrer">View website ↗</a>
          <button className="admin-sidebar-logout" type="button" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main id="admin-main" tabIndex={-1} className={`app-shell ${shellClass} admin-workspace-main`}>
        <header className="admin-workspace-header">
          <div className="admin-header-main">
            <p className="admin-breadcrumb">Workspace / {section}</p>
            <h1>{title}</h1>
            <p className="admin-header-description">{subtitle}</p>
          </div>
          <div className="admin-header-tools">
            <div className="admin-status-cluster" aria-label="Workspace status">
              <span className="admin-mode-pill"><i aria-hidden="true" /> Live mode</span>
              <span className="admin-date-pill">{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
            </div>
            <div className="toolbar-actions">
              <AdminWrite><a className="toolbar-button admin-quick-create" href={adminRoutes.upload}>+ Create / Upload</a></AdminWrite>
              <button className="toolbar-button admin-theme-button" type="button" onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')} aria-pressed={theme === 'light'}>{theme === 'light' ? 'Dark' : 'Light'}</button>
              {actions}
            </div>
          </div>
        </header>
        {!canWrite ? <p className="admin-inline-message" role="status">Read-only access</p> : null}
        {children}
      </main>
    </div>
  );
}
