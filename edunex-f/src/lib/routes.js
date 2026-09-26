const cleanRoutes = {
  "delete-account.html": "/delete-account",
  "index.html": "/",
  "home-based.html": "/home-based",
  "about.html": "/about",
  "account-deletion.html": "/account-deletion",
  "ai-tutor.html": "/ai-tutor",
  "certificates.html": "/certificates",
  "contact.html": "/contact",
  "course.html": "/course",
  "courses.html": "/courses",
  "cookie-policy.html": "/cookie-policy",
  "dashboard.html": "/dashboard",
  "edit-profile.html": "/edit-profile",
  "help.html": "/help",
  "lesson.html": "/lesson",
  "login.html": "/login",
  "otp.html": "/otp",
  "offer.html": "/static-pages/skillomate-ai-influencer-course/#paywall",
  ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => {
    const number = index + 2;
    return [`offer${number}.html`, `/offer${number}`];
  })),
  "payment.html": "/payment",
  "pricing.html": "/pricing",
  "privacy.html": "/privacy",
  "profile.html": "/profile",
  "refund-policy.html": "/refund-policy",
  "shipping-policy.html": "/shipping-policy",
  "signup.html": "/signup",
  "subscription-policy.html": "/subscription-policy",
  "terms.html": "/terms",
  "videos.html": "/videos",
  "wishlist.html": "/wishlist",
  "admin-login.html": "/admin/login",
  "admin-dashboard.html": "/admin/dashboard",
  "admin-users.html": "/admin/users",
  "admin-courses.html": "/admin/courses",
  "course-posting.html": "/admin/upload",
};

const routeAliases = Object.fromEntries(
  Object.entries(cleanRoutes).flatMap(([pageKey, cleanPath]) => {
    const cleanKey = cleanPath.replace(/^\/+/, "");
    return [
      [pageKey, pageKey],
      [pageKey.replace(/\.html$/, ""), pageKey],
      [cleanKey, pageKey],
    ];
  })
);

routeAliases[""] = "index.html";
routeAliases.home = "index.html";
routeAliases.ai = "offer.html";
routeAliases["1rs-offer-page"] = "offer.html";
routeAliases["skillomate-1rs-for-24-hours-full-course-access"] = "offer.html";
routeAliases["skillomate-1rs-offer-for-24-hours-full-course-access"] = "offer.html";
routeAliases["static-pages/skillomate-1rs-for-24-hours-full-course-access"] = "offer.html";
routeAliases["static-pages/skillomate-ai-influencer-course"] = "offer.html";
routeAliases["privacy-policy"] = "privacy.html";
routeAliases["delete-account"] = "delete-account.html";
routeAliases.support = "help.html";

function splitRoute(value) {
  const match = String(value || "").trim().match(/^([^?#]*)([?#].*)?$/);
  return {
    pathname: match?.[1] || "",
    suffix: match?.[2] || "",
  };
}

export function route(value = "/") {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  if (/^(mailto:|tel:|sms:|data:|blob:|#)/i.test(raw)) return raw;
  if (/^(https?:)?\/\//i.test(raw)) return raw;
  if (raw === "/api" || raw.startsWith("/api/")) return raw;

  const { pathname, suffix } = splitRoute(raw);
  const normalized = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  const pageKey = routeAliases[normalized];
  if (pageKey && cleanRoutes[pageKey]) {
    return `${cleanRoutes[pageKey]}${suffix}`;
  }

  return pathname.startsWith("/") ? `${pathname}${suffix}` : `/${pathname}${suffix}`;
}

export function pageKeyFromPath(pathname = "/") {
  const normalized = String(pathname || "/").replace(/\/+$/, "").replace(/^\/+/, "");
  if (!normalized) return "index.html";
  if (routeAliases[normalized]) return routeAliases[normalized];
  const lastSegment = normalized.split("/").filter(Boolean).pop() || "";
  return routeAliases[lastSegment] || (lastSegment.endsWith(".html") ? lastSegment : `${lastSegment}.html`);
}
