import { EnxIcon } from "./EnxIcon.jsx";
import { route } from "../lib/routes.js";

const learnLinks = [
  ["Verified Courses", route("courses.html")],
  ["Certificates", route("certificates.html")],
  ["AI Tutor", route("ai-tutor.html")],
];

const platformLinks = [
  ["All Courses", route("courses.html")],
  ["My Dashboard", route("dashboard.html")],
  ["Course Notes", route("videos.html")],
];

const accountLinks = [
  ["Profile", route("profile.html")],
  ["Login", route("login.html")],
  ["Wishlist", route("wishlist.html")],
];

const companyLinks = [
  ["About", route("about.html")],
  ["Support", route("help.html")],
  ["Contact", "mailto:support@skillomate.ai"],
];

const legalLinks = [
  ["Terms", route("terms.html")],
  ["Privacy", route("privacy.html")],
  ["Help", route("help.html")],
];

const appDownloadLinks = [
  {
    label: "App Store",
    detail: "Download on the",
    href: "https://apps.apple.com/us/search?term=Skillomate",
    icon: "apple",
  },
  {
    label: "Google Play",
    detail: "Get it on",
    href: "https://play.google.com/store/apps/details?id=com.skillomate.app",
    icon: "playStore",
  },
];

function LinkList({ title, links }) {
  return (
    <div className="enx-footer-column">
      <div className="enx-footer-heading">{title}</div>
      <ul className="enx-footer-links">
        {links.map(([label, href]) => (
          <li key={label}><a href={href}>{label}</a></li>
        ))}
      </ul>
    </div>
  );
}

function AppDownloadColumn() {
  return (
    <div className="enx-footer-column enx-footer-app-download">
      <div className="enx-footer-heading">App Download</div>
      <div className="enx-store-links">
        {appDownloadLinks.map(({ label, detail, href, icon }) => (
          <a
            key={label}
            className="enx-store-badge"
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={`${detail} ${label}`}
          >
            <EnxIcon name={icon} className="enx-store-icon" />
            <span>
              <small>{detail}</small>
              <strong>{label}</strong>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="enx-footer">
      <div className="enx-footer-shell">
        <div className="enx-footer-top">
          <div className="enx-footer-intro enx-footer-intro--single">
            <div className="enx-footer-cta">
              <div className="enx-footer-heading">Need Help?</div>
              <p>Use your dashboard to continue enrolled courses, open notes from lessons, or contact support if access does not look right.</p>
              <a href={route("payment.html")}>Start ₹1 Trial <EnxIcon name="arrowRight" /></a>
              <div className="enx-footer-support">
                <a href="mailto:support@skillomate.ai"><EnxIcon name="mail" /> support@skillomate.ai</a>
                <a href={route("about.html")}><EnxIcon name="info" /> About Skillomate</a>
              </div>
            </div>
          </div>

          <LinkList title="Learn" links={learnLinks} />
          <LinkList title="Access" links={platformLinks} />
          <LinkList title="Account" links={accountLinks} />
          <LinkList title="Company" links={companyLinks} />
          <LinkList title="Legal" links={legalLinks} />
          <AppDownloadColumn />

        </div>

        <div className="enx-footer-bottom">
          <span>© 2026 Skillomate AI. All rights reserved.</span>
          <div>
            <a href={route("login.html")}>Login</a>
            <a href={route("terms.html")}>Terms</a>
            <a href={route("privacy.html")}>Privacy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
