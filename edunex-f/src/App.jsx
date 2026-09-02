import { lazy, Suspense, useEffect } from "react";
import { Navbar } from "./components/Navbar.jsx";
import { Footer } from "./components/Footer.jsx";
import { EnxIcon } from "./components/EnxIcon.jsx";
import { pageKeyFromPath, route } from "./lib/routes.js";

const reactPageLoaders = {
  "about.html": lazy(() => import("./pages/AboutPage.jsx").then((module) => ({ default: module.AboutPage }))),
  "ai-tutor.html": lazy(() => import("./pages/AiTutorPage.jsx").then((module) => ({ default: module.AiTutorPage }))),
  "certificates.html": lazy(() => import("./pages/CertificatesPage.jsx").then((module) => ({ default: module.CertificatesPage }))),
  "course.html": lazy(() => import("./pages/CourseDetailsPage.jsx").then((module) => ({ default: module.CourseDetailsPage }))),
  "courses.html": lazy(() => import("./pages/CoursesPage.jsx").then((module) => ({ default: module.CoursesPage }))),
  "dashboard.html": lazy(() => import("./pages/DashboardPage.jsx").then((module) => ({ default: module.DashboardPage }))),
  "edit-profile.html": lazy(() => import("./pages/EditProfilePage.jsx").then((module) => ({ default: module.EditProfilePage }))),
  "help.html": lazy(() => import("./pages/HelpPage.jsx").then((module) => ({ default: module.HelpPage }))),
  "index.html": lazy(() => import("./pages/HomePage.jsx").then((module) => ({ default: module.HomePage }))),
  "lesson.html": lazy(() => import("./pages/LessonPage.jsx").then((module) => ({ default: module.LessonPage }))),
  "login.html": lazy(() => import("./pages/LoginPage.jsx").then((module) => ({ default: module.LoginPage }))),
  "otp.html": lazy(() => import("./pages/OtpPage.jsx").then((module) => ({ default: module.OtpPage }))),
  "payment.html": lazy(() => import("./pages/PaymentPage.jsx").then((module) => ({ default: module.PaymentPage }))),
  "profile.html": lazy(() => import("./pages/ProfilePage.jsx").then((module) => ({ default: module.ProfilePage }))),
  "signup.html": lazy(() => import("./pages/SignupPage.jsx").then((module) => ({ default: module.SignupPage }))),
  "videos.html": lazy(() => import("./pages/VideosPage.jsx").then((module) => ({ default: module.VideosPage }))),
  "wishlist.html": lazy(() => import("./pages/WishlistPage.jsx").then((module) => ({ default: module.WishlistPage }))),
  "home-based.html": lazy(() => import("./pages/HomeBasedPage.jsx").then((module) => ({ default: module.HomeBasedPage }))),
  "terms.html": lazy(() => import("./pages/LegalPage.jsx").then((module) => ({
    default: () => <module.LegalPage type="terms" />,
  }))),
  "privacy.html": lazy(() => import("./pages/LegalPage.jsx").then((module) => ({
    default: () => <module.LegalPage type="privacy" />,
  }))),
};

function goBackSafely() {
  if (window.history.length > 1 && document.referrer) {
    window.history.back();
    return;
  }
  window.location.href = route("index.html");
}

function NotFoundPage() {
  return (
    <main className="enx-not-found" aria-labelledby="not-found-title">
      <section className="enx-not-found-shell">
        <div className="enx-not-found-icon" aria-hidden="true">
          <EnxIcon name="sparkles" />
        </div>
        <p className="enx-not-found-kicker">404</p>
        <h1 id="not-found-title">Page not found</h1>
        <p className="enx-not-found-copy">
          The page you're looking for may have moved, been removed, or the link may be incorrect.
        </p>
        <div className="enx-not-found-actions">
          <a className="enx-not-found-primary" href={route("index.html")}>
            Go Home <EnxIcon name="arrowRight" />
          </a>
          <a className="enx-not-found-secondary" href={route("courses.html")}>Explore Courses</a>
          <button className="enx-not-found-ghost" type="button" onClick={goBackSafely}>Go Back</button>
        </div>
      </section>
    </main>
  );
}

function PageLoading() {
  return (
    <main className="enx-page-loading" aria-live="polite" aria-busy="true">
      <section className="enx-page-loading-card">
        <div className="enx-page-loading-mark" aria-hidden="true">
          <EnxIcon name="sparkles" />
        </div>
        <p>Loading EduNex...</p>
      </section>
    </main>
  );
}

export default function App() {
  const pageKey = pageKeyFromPath(window.location.pathname);
  const ReactPage = reactPageLoaders[pageKey];

  useEffect(() => {
    if (!window.location.pathname.endsWith(".html")) return;
    const canonicalRoute = route(`${pageKey}${window.location.search}${window.location.hash}`);
    const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (canonicalRoute !== currentRoute) {
      window.history.replaceState(window.history.state, "", canonicalRoute);
    }
  }, [pageKey]);

  if (!ReactPage) {
    document.title = "Page Not Found | EduNex";
  }

  return (
    <>
      <Navbar pageKey={pageKey} />
      {ReactPage ? (
        <Suspense fallback={<PageLoading />}>
          <ReactPage />
        </Suspense>
      ) : null}
      {!ReactPage ? <NotFoundPage /> : null}
      <Footer />
    </>
  );
}
