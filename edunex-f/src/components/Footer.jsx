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
  ["About Skillomate", route("about.html")],
  ["Contact Us", route("contact.html")],
];

const supportLinks = [
  ["Help & Support", route("help.html")],
  ["Account Deletion", route("account-deletion.html")],
];

const legalLinks = [
  ["Privacy Policy", route("privacy.html")],
  ["Terms & Conditions", route("terms.html")],
  ["Refund & Cancellation", route("refund-policy.html")],
  ["Subscription & Billing", route("subscription-policy.html")],
  ["Digital Delivery & Shipping", route("shipping-policy.html")],
  ["Cookie Policy", route("cookie-policy.html")],
];

const pricingLinks = [
  ["Pricing", route("pricing.html")],
];

function LinkList({ title, links, className = "" }) {
  return (
    <div className={`enx-footer-column${className ? ` ${className}` : ""}`}>
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
          <div className="enx-footer-intro enx-footer-intro--single">
            <div className="enx-footer-cta">
              <div className="enx-footer-heading">Need Help?</div>
              <p>Use your dashboard to continue enrolled courses, open notes from lessons, or contact support if access does not look right.</p>
              <a href={route("pricing.html")}>See Pricing <EnxIcon name="arrowRight" /></a>
              <div className="enx-footer-support">
                <a href="mailto:support@skillomate.in"><EnxIcon name="mail" /> support@skillomate.in</a>
                <a href={route("contact.html")}><EnxIcon name="info" /> Contact Skillomate</a>
              </div>
            </div>
          </div>

          <LinkList title="Learn" links={learnLinks} />
          <LinkList title="Access" links={platformLinks} />
          <LinkList title="Account" links={accountLinks} />
          <LinkList title="Company" links={companyLinks} />
          <LinkList title="Support" links={supportLinks} />
          <LinkList title="Legal" links={legalLinks} />
          <LinkList title="Pricing" links={pricingLinks} className="enx-footer-pricing" />

        </div>

        <div className="enx-footer-mobile-top">
          <div className="enx-footer-intro enx-footer-intro--single">
            <div className="enx-footer-cta">
              <div className="enx-footer-heading">Need Help?</div>
              <p>Use your dashboard to continue enrolled courses, open notes from lessons, or contact support if access does not look right.</p>
              <a href={route("pricing.html")}>See Pricing <EnxIcon name="arrowRight" /></a>
              <div className="enx-footer-support">
                <a href="mailto:support@skillomate.in"><EnxIcon name="mail" /> support@skillomate.in</a>
                <a href={route("contact.html")}><EnxIcon name="info" /> Contact Skillomate</a>
              </div>
            </div>
          </div>

          <div className="enx-footer-mobile-stack">
            <LinkList title="Learn" links={learnLinks} />
            <LinkList title="Account" links={accountLinks} />
            <LinkList title="Support" links={supportLinks} />
            <LinkList title="Pricing" links={pricingLinks} className="enx-footer-pricing" />
          </div>

          <div className="enx-footer-mobile-stack">
            <LinkList title="Access" links={platformLinks} />
            <LinkList title="Company" links={companyLinks} />
            <LinkList title="Legal" links={legalLinks} />
          </div>
        </div>

        <div className="enx-footer-bottom">
          <span>© 2026 Skillomate AI. All rights reserved.</span>
          <div>
            <a href={route("login.html")}>Login</a>
            <a href={route("terms.html")}>Terms</a>
            <a href={route("privacy.html")}>Privacy</a>
            <a href={route("contact.html")}>Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
