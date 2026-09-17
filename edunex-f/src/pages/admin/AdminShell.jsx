import { useEffect, useState } from "react";
import { adminRoutes, logout } from "./adminApi.js";

const sections = [
  { label: 'Overview', links: [['dashboard', 'Analytics', adminRoutes.dashboard, '01']] },
  { label: 'People', links: [['users', 'Learners', adminRoutes.users, '02']] },
  { label: 'Content', links: [['courses', 'Course library', adminRoutes.courses, '03'], ['upload', 'Create course', adminRoutes.upload, '+']] },
  { label: 'Operations', links: [['health', 'System health', adminRoutes.health, '04'], ['certifications', 'Certification', adminRoutes.certifications, '05']] },
];

export function Message({ text, type = "success" }) {
  return text ? <div className={`message ${type}`} role={type === 'error' ? 'alert' : 'status'}>{text}</div> : null;
}

export function AdminShell({ activePage, title, subtitle, children, actions = null, shellClass = "dashboard-shell", navLabels = {} }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("edunexAdminTheme") || "dark");
  useEffect(() => {
    document.body.classList.toggle("admin-theme-light", theme === "light");
    document.body.classList.toggle("admin-theme-dark", theme !== "light");
    localStorage.setItem("edunexAdminTheme", theme);
  }, [theme]);
  const section = sections.find(item => item.links.some(([key]) => key === activePage))?.label || 'Overview';
  return (
    <div className="admin-workspace">
      <a className="admin-skip-link" href="#admin-main">Skip to content</a>
      <aside className="admin-sidebar">
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
        <nav aria-label="Administration sections">
          {sections.map(group => <div className="admin-nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.links.map(([key, label, href, icon]) => <a key={key} href={href} className={activePage === key ? 'is-active' : ''} aria-current={activePage === key ? 'page' : undefined}><span aria-hidden="true">{icon}</span>{navLabels[key] || label}</a>)}
          </div>)}
        </nav>
        <div className="admin-sidebar-footer"><a href="/" target="_blank" rel="noreferrer">View website ↗</a><button type="button" onClick={logout}>Log out</button></div>
      </aside>
      <main id="admin-main" tabIndex={-1} className={`app-shell ${shellClass} admin-workspace-main`}>
        <header className="admin-workspace-header">
          <div><p className="admin-breadcrumb">Workspace / {section}</p><h1>{title}</h1><p className="admin-header-description">{subtitle}</p></div>
          <div className="toolbar-actions">
            <button className="toolbar-button" type="button" onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')} aria-pressed={theme === 'light'}>{theme === 'light' ? 'Dark theme' : 'Light theme'}</button>
            {actions}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
