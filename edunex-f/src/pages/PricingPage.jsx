import { useEffect } from "react";
import { CheckList, LegalLayout, LegalSection } from "../components/legal/LegalLayout.jsx";
import { setPageMeta, subscriptionOffer } from "../lib/siteMeta.js";
import { route } from "../lib/routes.js";
import { EnxIcon } from "../components/EnxIcon.jsx";

export function PricingPage() {
  useEffect(() => {
    setPageMeta({
      title: "Pricing | Skillomate",
      description: "Skillomate Premium: ₹499/month or ₹4,999/year, automatically renewing until cancelled.",
      canonicalPath: "/pricing",
    });
  }, []);

  return (
    <LegalLayout
      pageKey="pricing.html"
      title="Pricing"
      description="Simple digital subscription pricing for Skillomate learning access."
      updated={false}
      actions={<a className="legal-button" href={route("payment.html")}>Continue with UPI <EnxIcon name="arrowRight" /></a>}
      sections={[
        { id: "plans", title: "Plans" },
        { id: "what-is-included", title: "What is included" },
        { id: "billing", title: "Billing terms" },
      ]}
    >
      <LegalSection id="plans" title="Choose your Skillomate access">
        <div className="pricing-plan-grid">
          <div className="pricing-card featured">
            <div className="pricing-badge">Skillomate Premium</div>
            <h2>Monthly subscription</h2>
            <div className="pricing-price-row">
              <div className="pricing-price">₹499</div>
              <div>
                <p className="pricing-renewal">per month</p>
                <p>Renews at <strong>{subscriptionOffer.renewal}</strong> until cancelled.</p>
              </div>
            </div>
            <div className="legal-callout"><strong>₹499/month. Your subscription automatically renews every month through UPI AutoPay until cancelled.</strong></div>
            <div className="pricing-includes">
              <span>Automatic renewal</span>
              <span>Cancel anytime</span>
              <span>Digital access only</span>
            </div>
            <a className="legal-button pricing-action" href={route("payment.html")}>Continue with UPI <EnxIcon name="arrowRight" /></a>
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
            <div className="legal-callout"><strong>Pay ₹4,999 for one year of Skillomate access. Renews automatically at ₹4,999/year until cancelled. No trial charge.</strong></div>
            <div className="pricing-includes">
              <span>One-year access</span>
              <span>Digital delivery</span>
              <span>No physical shipping</span>
            </div>
            <a className="legal-button pricing-action secondary" href={route("payment.html?plan=annual")}>Continue to checkout <EnxIcon name="arrowRight" /></a>
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
        <p>The monthly subscription costs ₹499, charged now and renewed every month through UPI AutoPay until cancelled.</p>
        <p>The annual web subscription costs ₹4,999, billed immediately and renewed automatically each year until cancelled. There is no trial charge. Cancel auto-renewal from your profile; access continues through the paid year.</p>
        <p>Users may cancel eligible recurring subscriptions anytime. After cancellation, access continues through the current paid period and future renewals stop after cancellation takes effect.</p>
        <p>No physical delivery applies because Skillomate provides digital educational services only.</p>
      </LegalSection>
    </LegalLayout>
  );
}
