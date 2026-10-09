import { useEffect } from "react";
import { CheckList, LegalLayout, LegalSection } from "../components/legal/LegalLayout.jsx";
import { SUPPORT_EMAIL, businessInfo, setPageMeta, subscriptionOffer, storeSubscriptionDisclosures } from "../lib/siteMeta.js";
import { route } from "../lib/routes.js";
import { EnxIcon } from "../components/EnxIcon.jsx";

const supportSections = [
  {
    id: "getting-started",
    icon: "user",
    title: "Getting Started",
    items: ["Creating an account", "Phone OTP issues", "Updating profile details and avatar"],
  },
  {
    id: "subscriptions",
    icon: "receipt",
    title: "Subscriptions",
    items: [subscriptionOffer.disclosure, storeSubscriptionDisclosures.googlePlay, storeSubscriptionDisclosures.apple, "Cancellation stops future renewals; already-paid access continues until its verified expiry."],
  },
  {
    id: "payments",
    icon: "key",
    title: "Payments",
    items: ["Payment successful but access missing", "Payment pending", "Billing questions"],
  },
  {
    id: "courses",
    icon: "bookOpen",
    title: "Courses",
    items: ["Accessing lessons", "Tracking progress", "Downloads", "Certificates"],
  },
  {
    id: "account",
    icon: "dashboard",
    title: "Account",
    items: ["Updating profile", "Managing wishlist", "Deleting account"],
  },
  {
    id: "technical",
    icon: "video",
    title: "Technical Support",
    items: ["Video playback", "App issues", "Notifications", "Download issues"],
  },
];

function SupportCard({ section }) {
  return (
    <article className="support-card">
      <span aria-hidden="true"><EnxIcon name={section.icon} /></span>
      <h3>{section.title}</h3>
      <ul className="legal-plain-list">
        {section.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

export function HelpPage() {
  useEffect(() => {
    setPageMeta({
      title: "Help & Support | Skillomate",
      description: "Skillomate Help Center for accounts, OTP, subscriptions, payments, courses, certificates, downloads and technical support.",
      canonicalPath: "/help",
    });
  }, []);

  return (
    <LegalLayout
      title="Help & Support"
      description="Find help for accounts, subscriptions, payments, courses, certificates, downloads and technical issues."
      updated={false}
      actions={<a className="legal-button" href={`mailto:${SUPPORT_EMAIL}`}>Contact support <EnxIcon name="mail" /></a>}
      sections={supportSections.map(({ id, title }) => ({ id, title }))}
    >
      <LegalSection id="overview" title="How support works">
        <p>Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your registered phone number and a short description of the issue. Do not send passwords, OTPs, full card details or UPI PINs.</p>
        <CheckList items={[`Support hours: ${businessInfo.supportHours}`, `Typical response: ${businessInfo.responseTime}`, "Market: India only", "Currency: INR"]} />
      </LegalSection>
      <div className="support-grid">
        {supportSections.map((section) => <SupportCard section={section} key={section.id} />)}
      </div>
      <LegalSection id="fast-links" title="Helpful links">
        <div className="legal-link-cards">
          <a href={route("pricing.html")}><span>Pricing</span><EnxIcon name="arrowRight" /></a>
          <a href={route("subscription-policy.html")}><span>Subscription policy</span><EnxIcon name="arrowRight" /></a>
          <a href={route("refund-policy.html")}><span>Refund policy</span><EnxIcon name="arrowRight" /></a>
          <a href={route("account-deletion.html")}><span>Account deletion</span><EnxIcon name="arrowRight" /></a>
        </div>
      </LegalSection>
    </LegalLayout>
  );
}
