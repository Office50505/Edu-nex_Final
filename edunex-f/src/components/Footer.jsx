import { EnxIcon } from "./EnxIcon.jsx";
import { route } from "../lib/routes.js";

const learnLinks = [
  ["All Courses", route("courses.html")],
  ["Video Lessons", route("videos.html")],
  ["My Dashboard", route("dashboard.html")],
  ["Certificates", route("certificates.html")],
];

const platformLinks = [
  ["Start ₹1 Trial", route("payment.html")],
  ["Profile", route("profile.html")],
  ["Wishlist", route("wishlist.html")],
  ["Login", route("login.html")],
];

const accountLinks = [
  ["Create Account", route("signup.html")],
  ["Profile", route("profile.html")],
  ["Dashboard", route("dashboard.html")],
  ["Course Notes", route("videos.html")],
];

const companyLinks = [
  ["About", route("about.html")],
  ["Courses", route("courses.html")],
  ["Contact Support", "mailto:support@edunex.ai"],
  ["Help", route("help.html")],
];

const legalLinks = [
  ["Terms", route("terms.html")],
  ["Privacy", route("privacy.html")],
  ["Help", route("help.html")],
];

function LinkList({ title, links }) {
  return (
    <div>
      <div className="enx-footer-heading">{title}</div>
      <ul className="enx-footer-links">
        {links.map(([label, href]) => (
          <li key={label}><a href={href}>{label}</a></li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="enx-footer">
      <div className="enx-footer-shell">
        <div className="enx-footer-top">
          <div>
            <a href={route("index.html")} className="enx-footer-brand" aria-label="EduNex AI home">
              <span className="enx-footer-brand-icon">E</span>
              <span>EduNex <span>AI</span></span>
            </a>
            <p className="enx-footer-copy">Practical AI-powered learning with real courses, guided videos, progress tracking, and focused tools for modern technical careers.</p>
            <div className="enx-footer-trust-row">
              <span><EnxIcon name="checkCircle" /> Verified courses</span>
              <span><EnxIcon name="award" /> Certificates</span>
              <span><EnxIcon name="sparkles" /> AI tutor</span>
            </div>
          </div>

          <LinkList title="Learn" links={learnLinks} />
          <LinkList title="Access" links={platformLinks} />
          <LinkList title="Account" links={accountLinks} />
          <LinkList title="Company" links={companyLinks} />
          <LinkList title="Legal" links={legalLinks} />

          <div className="enx-footer-cta">
            <div className="enx-footer-heading">Need Help?</div>
            <p>Use your dashboard to continue enrolled courses, open notes from lessons, or contact support if access does not look right.</p>
            <a href={route("payment.html")}>Start ₹1 Trial <EnxIcon name="arrowRight" /></a>
            <div className="enx-footer-support">
              <a href="mailto:support@edunex.ai"><EnxIcon name="mail" /> support@edunex.ai</a>
              <a href={route("about.html")}><EnxIcon name="info" /> About EduNex</a>
            </div>
          </div>
        </div>

        <div className="enx-footer-bottom">
          <span>© 2026 EduNex AI. All rights reserved.</span>
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
