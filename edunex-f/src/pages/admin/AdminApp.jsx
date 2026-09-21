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
import {
  AdminAuditLogPage,
  AdminCourseReviewPage,
  AdminOrdersPage,
  AdminPaymentsPage,
  AdminPaymentAuditorPage,
  AdminProgressPage,
  AdminSettingsPage,
  AdminSubscribersPage,
  AdminSubscriptionsPage,
} from "./AdminOperationsPages.jsx";
import { AdminUploadPage } from "./AdminUploadPage.jsx";
import { AdminUsersPage } from "./AdminUsersPage.jsx";
import { AdminReportsPage } from "./AdminReportsPage.jsx";
import { adminPageFromPath, canonicalAdminPath } from "./adminApi.js";

const adminPages = {
  login: AdminLoginPage,
  dashboard: AdminDashboardPage,
  users: AdminUsersPage,
  subscribers: AdminSubscribersPage,
  courses: AdminCoursesPage,
  upload: AdminUploadPage,
  courseReview: AdminCourseReviewPage,
  orders: AdminOrdersPage,
  payments: AdminPaymentsPage,
  paymentAuditor: AdminPaymentAuditorPage,
  subscriptions: AdminSubscriptionsPage,
  progress: AdminProgressPage,
  reports: AdminReportsPage,
  health: AdminHealthPage,
  certifications: AdminCertificationsPage,
  auditLog: AdminAuditLogPage,
  settings: AdminSettingsPage,
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
