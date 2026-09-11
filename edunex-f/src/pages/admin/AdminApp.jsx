import { AdminCertificationsPage } from "./AdminCertificationsPage.jsx";
import { AdminHealthPage } from "./AdminHealthPage.jsx";
import { useEffect } from "react";
import "../../../admin/auth.css";
import "../../../admin/motion.css";
import "../../../admin/premium-nav.css";
import "../../../admin/admin-theme.css";
import "./admin-react.css";
import { AdminCoursesPage } from "./AdminCoursesPage.jsx";
import { AdminDashboardPage } from "./AdminDashboardPage.jsx";
import { AdminLoginPage } from "./AdminLoginPage.jsx";
import { AdminUploadPage } from "./AdminUploadPage.jsx";
import { AdminUsersPage } from "./AdminUsersPage.jsx";
import { adminPageFromPath, canonicalAdminPath } from "./adminApi.js";

const adminPages = {
  login: AdminLoginPage,
  dashboard: AdminDashboardPage,
  users: AdminUsersPage,
  courses: AdminCoursesPage,
  upload: AdminUploadPage,
  health: AdminHealthPage,
  certifications: AdminCertificationsPage,
};

export function AdminApp({ page }) {
  const Page = adminPages[page] || AdminDashboardPage;

  useEffect(() => {
    document.body.classList.add("premium-nav-page", "premium-nav-admin");
    const canonical = canonicalAdminPath(window.location.pathname);
    if (canonical) {
      window.history.replaceState(window.history.state, "", `${canonical}${window.location.search}${window.location.hash}`);
    }
    return () => {
      document.body.classList.remove("premium-nav-page", "premium-nav-admin", "admin-theme-light", "admin-theme-dark");
    };
  }, []);

  return <Page />;
}

export { adminPageFromPath };
