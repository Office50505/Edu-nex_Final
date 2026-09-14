import { useEffect } from "react";
import { BusinessAddress, LegalLayout, LegalSection, LinkCards } from "../components/legal/LegalLayout.jsx";
import { SUPPORT_EMAIL, businessInfo, setPageMeta } from "../lib/siteMeta.js";
import { route } from "../lib/routes.js";

const contactLinks = [
  { label: "Privacy Policy", href: route("privacy.html") },
  { label: "Terms & Conditions", href: route("terms.html") },
  { label: "Refund Policy", href: route("refund-policy.html") },
  { label: "Help & Support", href: route("help.html") },
  { label: "Account Deletion", href: route("account-deletion.html") },
];

export function ContactPage() {
  useEffect(() => {
    setPageMeta({
      title: "Contact Skillomate",
      description: "Contact Skillomate, operated by Smartcart, for support, legal and account questions.",
      canonicalPath: "/contact",
    });
  }, []);

  return (
    <LegalLayout
      title="Contact Skillomate"
      description="Official contact details for Skillomate support, legal and account requests."
      updated={false}
      sections={[
        { id: "business", title: "Business details" },
        { id: "support", title: "Support contact" },
        { id: "links", title: "Useful links" },
      ]}
    >
      <LegalSection id="business" title="Business details">
        <p><strong>Skillomate</strong> is operated by <strong>Smartcart</strong>.</p>
        <p>Proprietor: {businessInfo.proprietor}</p>
        <BusinessAddress />
      </LegalSection>
      <LegalSection id="support" title="Support contact">
        <p>Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
        <p>Support hours: {businessInfo.supportHours}</p>
        <p>Typical response: {businessInfo.responseTime}</p>
        <p>Skillomate does not display a public phone number. Please use email for support and verification requests.</p>
      </LegalSection>
      <LegalSection id="links" title="Useful links">
        <LinkCards links={contactLinks} />
      </LegalSection>
    </LegalLayout>
  );
}
