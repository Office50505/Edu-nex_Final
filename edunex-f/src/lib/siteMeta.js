export const POLICY_LAST_UPDATED = "September 2026";
export const SITE_ORIGIN = "https://skillomate.in";
export const SUPPORT_EMAIL = "support@skillomate.in";

export const businessInfo = {
  brand: "Skillomate",
  operator: "Smartcart",
  proprietor: "Insha Noor",
  type: "Sole Proprietorship",
  addressLines: [
    "1B, 586, Sanjogepuri,",
    "Indore, Madhya Pradesh 452011,",
    "India",
  ],
  supportHours: "Monday-Friday, 10:00 AM - 6:00 PM IST",
  responseTime: "Within 5 business days",
};

// Web/Razorpay terms are independent of the offers shown by mobile app stores.
export const subscriptionOffer = {
  trialPrice: "₹1",
  trialHours: 24,
  renewal: "₹499/month",
  disclosure: "Web (Razorpay): Get 24 hours of Skillomate access for ₹1. After the 24-hour trial, your subscription automatically renews at ₹499/month using your authorized payment method until cancelled.",
};

export const storeSubscriptionDisclosures = {
  googlePlay: "Android (Google Play): Eligible customers in India pay ₹9 for the first 3 days, then ₹499/month. Automatically renews until cancelled. Google Play determines offer eligibility and shows the applicable localized prices and billing terms before purchase. Customers without the introductory offer see the regular monthly price. Manage or cancel in Google Play subscriptions.",
  apple: "iOS (Apple App Store): Apple subscriptions follow the prices, eligibility and renewal terms shown in the App Store purchase sheet. Manage or cancel through your Apple account subscriptions.",
};

function ensureMeta(name, attr, value) {
  let tag = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", value);
}

export function setPageMeta({ title, description, canonicalPath }) {
  document.title = title;
  document.documentElement.lang = "en";
  if (description) {
    ensureMeta("description", "name", description);
    ensureMeta("og:description", "property", description);
  }
  ensureMeta("og:title", "property", title);
  ensureMeta("og:type", "property", "website");

  const canonicalHref = `${SITE_ORIGIN}${canonicalPath || window.location.pathname}`;
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.setAttribute("rel", "canonical");
    document.head.appendChild(canonical);
  }
  canonical.setAttribute("href", canonicalHref);
  ensureMeta("og:url", "property", canonicalHref);
}
