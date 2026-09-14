import { lazy } from "react";

function namedPage(exportName) {
  return (module) => ({ default: module[exportName] });
}

const pageModules = {
  "account-deletion.html": () => import("../pages/DeleteAccountPage.jsx"),
  "delete-account.html": () => import("../pages/DeleteAccountPage.jsx"),
  "about.html": () => import("../pages/AboutPage.jsx").then(namedPage("AboutPage")),
  "ai-tutor.html": () => import("../pages/AiTutorPage.jsx").then(namedPage("AiTutorPage")),
  "certificates.html": () => import("../pages/CertificatesPage.jsx").then(namedPage("CertificatesPage")),
  "contact.html": () => import("../pages/ContactPage.jsx").then(namedPage("ContactPage")),
  "course.html": () => import("../pages/CourseDetailsPage.jsx").then(namedPage("CourseDetailsPage")),
  "courses.html": () => import("../pages/CoursesPage.jsx").then(namedPage("CoursesPage")),
  "cookie-policy.html": () => import("../pages/LegalPage.jsx").then((module) => ({
    default: () => <module.LegalPage type="cookies" />,
  })),
  "dashboard.html": () => import("../pages/DashboardPage.jsx").then(namedPage("DashboardPage")),
  "edit-profile.html": () => import("../pages/EditProfilePage.jsx").then(namedPage("EditProfilePage")),
  "help.html": () => import("../pages/HelpPage.jsx").then(namedPage("HelpPage")),
  "index.html": () => import("../pages/HomePage.jsx").then(namedPage("HomePage")),
  "lesson.html": () => import("../pages/LessonPage.jsx").then(namedPage("LessonPage")),
  "login.html": () => import("../pages/LoginPage.jsx").then(namedPage("LoginPage")),
  "otp.html": () => import("../pages/OtpPage.jsx").then(namedPage("OtpPage")),
  "payment.html": () => import("../pages/PaymentPage.jsx").then(namedPage("PaymentPage")),
  "pricing.html": () => import("../pages/PricingPage.jsx").then(namedPage("PricingPage")),
  "profile.html": () => import("../pages/ProfilePage.jsx").then(namedPage("ProfilePage")),
  "refund-policy.html": () => import("../pages/LegalPage.jsx").then((module) => ({
    default: () => <module.LegalPage type="refund" />,
  })),
  "shipping-policy.html": () => import("../pages/LegalPage.jsx").then((module) => ({
    default: () => <module.LegalPage type="shipping" />,
  })),
  "signup.html": () => import("../pages/SignupPage.jsx").then(namedPage("SignupPage")),
  "subscription-policy.html": () => import("../pages/LegalPage.jsx").then((module) => ({
    default: () => <module.LegalPage type="subscription" />,
  })),
  "videos.html": () => import("../pages/VideosPage.jsx").then(namedPage("VideosPage")),
  "wishlist.html": () => import("../pages/WishlistPage.jsx").then(namedPage("WishlistPage")),
  "home-based.html": () => import("../pages/HomeBasedPage.jsx").then(namedPage("HomeBasedPage")),
  "terms.html": () => import("../pages/LegalPage.jsx").then((module) => ({
    default: () => <module.LegalPage type="terms" />,
  })),
  "privacy.html": () => import("../pages/LegalPage.jsx").then((module) => ({
    default: () => <module.LegalPage type="privacy" />,
  })),
};

const preloadCache = new Map();

export function preloadPage(pageKey) {
  const loader = pageModules[pageKey];
  if (!loader) return Promise.resolve(null);
  if (!preloadCache.has(pageKey)) {
    preloadCache.set(
      pageKey,
      loader().catch((error) => {
        preloadCache.delete(pageKey);
        throw error;
      })
    );
  }
  return preloadCache.get(pageKey);
}

export function hasReactPage(pageKey) {
  return Boolean(pageModules[pageKey]);
}

export const reactPageLoaders = Object.fromEntries(
  Object.keys(pageModules).map((pageKey) => [pageKey, lazy(() => preloadPage(pageKey))])
);
