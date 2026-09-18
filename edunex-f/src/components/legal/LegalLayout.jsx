import { EnxIcon } from "../EnxIcon.jsx";
import { POLICY_LAST_UPDATED, SUPPORT_EMAIL, businessInfo } from "../../lib/siteMeta.js";
import { route } from "../../lib/routes.js";
import "./LegalPages.css";

export function LegalHero({ eyebrow = "Skillomate", title, description, updated = true, actions = null }) {
  return (
    <section className="legal-hero" aria-labelledby="legal-page-title">
      <div className="legal-crumbs" aria-label="Breadcrumb">
        <a href={route("index.html")}>Home</a>
        <span>/</span>
        <span>{title}</span>
      </div>
      <p className="legal-eyebrow">{eyebrow}</p>
      <h1 id="legal-page-title">{title}</h1>
      {description ? <p className="legal-hero-copy">{description}</p> : null}
      <div className="legal-hero-meta">
        {updated ? <span><EnxIcon name="info" /> Last updated: {POLICY_LAST_UPDATED}</span> : null}
        <span><EnxIcon name="mail" /> <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></span>
      </div>
      {actions ? <div className="legal-hero-actions">{actions}</div> : null}
    </section>
  );
}

export function LegalSection({ id, title, children }) {
  return (
    <section className="legal-section" id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function LegalLayout({ title, description, children, sections = [], updated = true, aside, actions, pageKey }) {
  return (
    <main className="react-page-root legal-page-root" data-page={pageKey || undefined}>
      <LegalHero title={title} description={description} updated={updated} actions={actions} />
      {sections.length ? (
        <details className="legal-mobile-toc">
          <summary>On this page</summary>
          <div>
            {sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
          </div>
        </details>
      ) : null}
      <div className="legal-shell">
        {sections.length || aside ? (
          <aside className="legal-sidebar">
            {sections.length ? (
              <nav className="legal-toc" aria-label={`${title} table of contents`}>
                <p>On this page</p>
                {sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
              </nav>
            ) : null}
            {aside || <PolicyContactBox />}
          </aside>
        ) : null}
        <article className="legal-article">
          {children}
        </article>
      </div>
    </main>
  );
}

export function PolicyContactBox() {
  return (
    <div className="policy-contact-box">
      <span aria-hidden="true"><EnxIcon name="mail" /></span>
      <h2>Need help?</h2>
      <p>Email Skillomate support during business hours. We usually respond within 5 business days.</p>
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
    </div>
  );
}

export function InfoGrid({ items }) {
  return (
    <div className="legal-info-grid">
      {items.map((item) => (
        <article className="legal-info-card" key={item.title}>
          <span aria-hidden="true"><EnxIcon name={item.icon || "info"} /></span>
          <h3>{item.title}</h3>
          <p>{item.copy}</p>
        </article>
      ))}
    </div>
  );
}

export function CheckList({ items }) {
  return (
    <ul className="legal-check-list">
      {items.map((item) => <li key={item}><EnxIcon name="checkCircle" /> <span>{item}</span></li>)}
    </ul>
  );
}

export function PlainList({ items }) {
  return <ul className="legal-plain-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

export function BusinessAddress() {
  return (
    <address className="legal-address">
      <strong>{businessInfo.operator}</strong>
      <span>Sole Proprietorship owned by {businessInfo.proprietor}</span>
      {businessInfo.addressLines.map((line) => <span key={line}>{line}</span>)}
    </address>
  );
}

export function LinkCards({ links }) {
  return (
    <div className="legal-link-cards">
      {links.map((link) => (
        <a key={link.href} href={link.href}>
          <span>{link.label}</span>
          <EnxIcon name="arrowRight" />
        </a>
      ))}
    </div>
  );
}
