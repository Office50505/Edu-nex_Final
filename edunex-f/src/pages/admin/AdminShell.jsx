import { adminRoutes, logout } from "./adminApi.js";

const navItems = [
  ["dashboard", "Analytics", adminRoutes.dashboard],
  ["users", "Users", adminRoutes.users],
  ["courses", "Courses", adminRoutes.courses],
  ["upload", "Upload", adminRoutes.upload],
];

export function Message({ text, type = "success" }) {
  return (
    <div className={`message${text ? ` ${type}` : ""}`} role="status">
      {text || ""}
    </div>
  );
}

export function AdminShell({ activePage, title, subtitle, children, actions = null, shellClass = "dashboard-shell" }) {
  return (
    <>
      <nav className="premium-site-nav" data-premium-nav>
        <div className="premium-nav-panel">
          <a aria-label="EduNex admin home" className="premium-brand" href={adminRoutes.dashboard}>
            <span className="premium-brand-mark" aria-hidden="true" />
            <span className="premium-brand-name">
              Edu<span>Nex</span>
            </span>
          </a>
          <div className="premium-nav-links">
            {navItems.map(([key, label, href]) => (
              <a key={key} className={activePage === key ? "is-active" : ""} href={href}>
                {label}
              </a>
            ))}
          </div>
          <div className="premium-nav-actions">
            <button className="toolbar-button" type="button" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </nav>

      <main className={`app-shell ${shellClass}`}>
        <header className={`app-header ${activePage}-header`}>
          <div>
            <div className="brand-mark">E</div>
            <h1 className="app-title">{title}</h1>
            <p className="app-subtitle">{subtitle}</p>
          </div>
          <nav className="toolbar-actions" aria-label="Admin navigation">
            {navItems
              .filter(([key]) => key !== activePage)
              .map(([key, label, href]) => (
                <a key={key} className="toolbar-button" href={href}>
                  {label}
                </a>
              ))}
            {actions}
            <button className="toolbar-button" type="button" onClick={logout}>
              Log out
            </button>
          </nav>
        </header>
        {children}
      </main>
    </>
  );
}
