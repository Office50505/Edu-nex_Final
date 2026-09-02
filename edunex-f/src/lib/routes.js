const cleanRoutes = {
  "index.html": "/",
  "home-based.html": "/home-based",
  "about.html": "/about",
  "ai-tutor.html": "/ai-tutor",
  "certificates.html": "/certificates",
  "course.html": "/course",
  "courses.html": "/courses",
  "dashboard.html": "/dashboard",
  "edit-profile.html": "/edit-profile",
  "help.html": "/help",
  "lesson.html": "/lesson",
  "login.html": "/login",
  "otp.html": "/otp",
  "payment.html": "/payment",
  "privacy.html": "/privacy",
  "profile.html": "/profile",
  "signup.html": "/signup",
  "terms.html": "/terms",
  "videos.html": "/videos",
  "wishlist.html": "/wishlist",
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
  const lastSegment = normalized.split("/").filter(Boolean).pop() || "";
  return routeAliases[lastSegment] || (lastSegment.endsWith(".html") ? lastSegment : `${lastSegment}.html`);
}
