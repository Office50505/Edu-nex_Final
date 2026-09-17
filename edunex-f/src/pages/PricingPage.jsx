import { useEffect } from "react";
import { CheckList, LegalLayout, LegalSection } from "../components/legal/LegalLayout.jsx";
import { setPageMeta, subscriptionOffer } from "../lib/siteMeta.js";
import { route } from "../lib/routes.js";
import { EnxIcon } from "../components/EnxIcon.jsx";

export function PricingPage() {
  useEffect(() => {
    setPageMeta({
      title: "Pricing | Skillomate",
      description: "Skillomate pricing: ₹1 for a 24-hour trial, then ₹499/month until cancelled, or ₹4999 for one year.",
      canonicalPath: "/pricing",
    });
  }, []);

  return (
    <LegalLayout
      title="Pricing"
      description="Simple digital subscription pricing for Skillomate learning access."
      updated={false}
      actions={<a className="legal-button" href={route("payment.html")}>Try 24 Hours for ₹1 <EnxIcon name="arrowRight" /></a>}
      sections={[
        { id: "plans", title: "Plans" },
        { id: "what-is-included", title: "What is included" },
        { id: "billing", title: "Billing terms" },
      ]}
    >
      <LegalSection id="plans" title="Choose your Skillomate access">
        <div className="pricing-plan-grid">
          <div className="pricing-card featured">
            <div className="pricing-badge">Mandate offer</div>
            <h2>Monthly subscription</h2>
            <div className="pricing-price-row">
              <div className="pricing-price">{subscriptionOffer.trialPrice}</div>
              <div>
                <p className="pricing-renewal">24-hour trial</p>
                <p>Then <strong>{subscriptionOffer.renewal}</strong> until cancelled.</p>
              </div>
            </div>
            <div className="legal-callout"><strong>{subscriptionOffer.disclosure}</strong></div>
            <div className="pricing-includes">
              <span>Automatic renewal</span>
              <span>Cancel anytime</span>
              <span>Digital access only</span>
            </div>
            <a className="legal-button pricing-action" href={route("payment.html")}>Try 24 Hours for ₹1 <EnxIcon name="arrowRight" /></a>
          </div>

          <div className="pricing-card">
            <div className="pricing-badge muted">Yearly access</div>
            <h2>Annual plan</h2>
            <div className="pricing-price-row">
              <div className="pricing-price annual-price">{subscriptionOffer.annual}</div>
              <div>
                <p className="pricing-renewal">For 1 year</p>
                <p>One-year Skillomate digital learning access.</p>
              </div>
            </div>
            <div className="legal-callout"><strong>Pay ₹4999 for one year of Skillomate access. Renewal or cancellation terms may depend on the payment method or platform used at checkout.</strong></div>
            <div className="pricing-includes">
              <span>One-year access</span>
              <span>Digital delivery</span>
              <span>No physical shipping</span>
            </div>
            <a className="legal-button pricing-action secondary" href={route("payment.html")}>Continue to checkout <EnxIcon name="arrowRight" /></a>
          </div>
        </div>
      </LegalSection>
      <LegalSection id="what-is-included" title="What is included">
        <CheckList items={[
          "Online courses and video lessons",
          "AI-assisted learning tools",
          "Educational resources and downloads where available",
          "Learning progress tracking and wishlists",
          "Certificates for eligible course completion",
          "Search and course discovery",
        ]} />
      </LegalSection>
      <LegalSection id="billing" title="Billing terms">
        <p>The monthly mandate offer starts with a 24-hour trial for ₹1. After the trial ends, the subscription renews automatically at ₹499/month using the payment method or mandate authorized by the user until cancelled.</p>
        <p>The annual plan is priced at ₹4999 for one year of Skillomate access. Any renewal, cancellation, or refund handling for platform-specific purchases may depend on the applicable payment platform and checkout flow.</p>
        <p>Users may cancel eligible recurring subscriptions anytime. After cancellation, access continues through the current paid period and future renewals stop after cancellation takes effect.</p>
        <p>No physical delivery applies because Skillomate provides digital educational services only.</p>
      </LegalSection>
    </LegalLayout>
  );
}
