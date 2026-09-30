const IOS_BLOCKED_PURCHASE_PATHS = [
  /\/(?:checkout|pricing|subscribe|subscription|upgrade|payment|plans?)(?:\/|$|[?#])/i,
  /[?&](?:checkout|subscribe|upgrade|purchase|payment)=/i,
];

const LEGAL_PATHS = [/\/(?:privacy|terms|refund|legal)(?:\/|$|[?#])/i];
const SUPPORT_PATHS = [/\/(?:support|help|contact)(?:\/|$|[?#])/i];
const ACCOUNT_PATHS = [/\/(?:account|profile|settings)(?:\/|$|[?#])/i];
const SKILLOMATE_HOSTS = new Set(["skillomate.in", "www.skillomate.in"]);
const TRUSTED_RESOURCE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "drive.google.com",
  "docs.google.com",
  "skillomate.in",
  "www.skillomate.in",
]);
const APPLE_SUBSCRIPTION_MANAGEMENT_URL = "https://apps.apple.com/account/subscriptions";
const GOOGLE_PLAY_SUBSCRIPTION_MANAGEMENT_URL = "https://play.google.com/store/account/subscriptions";
const SUPPORT_EMAIL_URL = "mailto:support@skillomate.in";

function classifyExternalUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch (_) {
    return { allowed: false, category: "unknown", reason: "invalid-url" };
  }

  if (
    url.protocol === "mailto:"
    && url.pathname.toLowerCase() === "support@skillomate.in"
    && !url.search
    && !url.hash
  ) {
    return { allowed: true, category: "support", url: SUPPORT_EMAIL_URL };
  }

  if (url.protocol !== "https:") {
    return { allowed: false, category: "unknown", reason: "scheme-not-allowed" };
  }

  const host = url.hostname.toLowerCase();
  const hrefPath = `${url.pathname}${url.search}${url.hash}`;
  if (host === "apps.apple.com" && url.pathname.replace(/\/+$/, "") === "/account/subscriptions" && !url.search && !url.hash) {
    return { allowed: true, category: "account-management", url: APPLE_SUBSCRIPTION_MANAGEMENT_URL };
  }
  if (host === "play.google.com" && url.pathname.replace(/\/+$/, "") === "/store/account/subscriptions" && !url.hash) {
    return { allowed: true, category: "account-management", url: url.href };
  }
  const isSkillomate = SKILLOMATE_HOSTS.has(host);
  if (isSkillomate && IOS_BLOCKED_PURCHASE_PATHS.some(pattern => pattern.test(hrefPath))) {
    return { allowed: false, category: "purchase", reason: "ios-external-purchase" };
  }
  if (isSkillomate && LEGAL_PATHS.some(pattern => pattern.test(hrefPath))) {
    return { allowed: true, category: "legal", url: url.href };
  }
  if (isSkillomate && SUPPORT_PATHS.some(pattern => pattern.test(hrefPath))) {
    return { allowed: true, category: "support", url: url.href };
  }
  if (isSkillomate && ACCOUNT_PATHS.some(pattern => pattern.test(hrefPath))) {
    return { allowed: true, category: "account", url: url.href };
  }
  if (TRUSTED_RESOURCE_HOSTS.has(host)) {
    return { allowed: true, category: "learning-resource", url: url.href };
  }
  return { allowed: false, category: "unknown", reason: "untrusted-domain" };
}

function canOpenExternalUrl(rawUrl, platform = "ios") {
  const result = classifyExternalUrl(rawUrl);
  if (platform !== "ios" && result.category === "purchase") {
    return { ...result, allowed: true, url: new URL(rawUrl).href };
  }
  return result;
}

module.exports = {
  APPLE_SUBSCRIPTION_MANAGEMENT_URL,
  GOOGLE_PLAY_SUBSCRIPTION_MANAGEMENT_URL,
  SUPPORT_EMAIL_URL,
  canOpenExternalUrl,
  classifyExternalUrl,
};
