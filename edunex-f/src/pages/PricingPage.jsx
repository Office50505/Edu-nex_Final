import { useEffect, useState } from "react";
import { CheckList, LegalLayout, LegalSection } from "../components/legal/LegalLayout.jsx";
import { setPageMeta, subscriptionOffer } from "../lib/siteMeta.js";
import { route } from "../lib/routes.js";
import { EnxIcon } from "../components/EnxIcon.jsx";
import { apiFetch } from "../lib/apiUrl.js";

export function PricingPage() {
  const [pricing, setPricing] = useState(null);
  const [pricingError, setPricingError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch("/api/payment/config", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Pricing is unavailable");
        setPricing(await response.json());
      })
      .catch(error => { if (error.name !== "AbortError") setPricingError(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setPageMeta({
      title: "Pricing | Skillomate",
      description: pricing?.gateway === "phonepe"
        ? "Skillomate Premium: one-time ₹299 payment for 30 days of access."
        : "Skillomate Premium: ₹499/month, automatically renewing until cancelled.",
      canonicalPath: "/pricing",
    });
  }, [pricing]);

  if (pricing?.gateway === "phonepe" || pricing?.gateway === "simulated") {
    return (
      <LegalLayout pageKey="pricing.html" title="Pricing" description="Simple digital access pricing for Skillomate learning." updated={false}
        actions={<a className="legal-button" href={route("payment.html")}>Continue with PhonePe <EnxIcon name="arrowRight" /></a>}
        sections={[{ id: "plans", title: "Access" }, { id: "billing", title: "Payment terms" }]}>
        <LegalSection id="plans" title="Skillomate Premium">
          <div className="pricing-plan-grid"><div className="pricing-card featured">
            <div className="pricing-badge">One-time payment</div>
            <h2>{pricing.accessDays}-day access</h2>
            <div className="pricing-price-row"><div className="pricing-price">₹{pricing.oneTimeAmountPaise / 100}</div><p>paid once through PhonePe</p></div>
            <div className="legal-callout"><strong>Access expires after {pricing.accessDays} days. There is no mandate or automatic renewal.</strong></div>
            <div className="pricing-includes"><span>Online courses</span><span>AI learning tools</span><span>No automatic renewal</span></div>
            <a className="legal-button pricing-action" href={route("payment.html")}>Continue with PhonePe <EnxIcon name="arrowRight" /></a>
          </div></div>
        </LegalSection>
        <LegalSection id="billing" title="Payment terms">
          <p>Pay ₹{pricing.oneTimeAmountPaise / 100} once for {pricing.accessDays} days of Premium access. To continue after access expires, you can make another payment.</p>
          <p>No physical delivery applies because Skillomate provides digital educational services only.</p>
        </LegalSection>
      </LegalLayout>
    );
  }

  if (!pricing) return <LegalLayout pageKey="pricing.html" title="Pricing" description="Skillomate pricing" updated={false} sections={[]}>
    <p>{pricingError ? "Pricing is temporarily unavailable. Please try again later." : "Loading pricing…"}</p>
  </LegalLayout>;

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
        <p>Users may cancel eligible recurring subscriptions anytime. After cancellation, access continues through the current paid period and future renewals stop after cancellation takes effect.</p>
        <p>No physical delivery applies because Skillomate provides digital educational services only.</p>
      </LegalSection>
    </LegalLayout>
  );
}
