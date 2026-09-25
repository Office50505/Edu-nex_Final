import { AdminPermissions } from "./AdminPermissions.jsx";
import { AdminTeamPage } from "./AdminTeamPage.jsx";
import { AdminCertificationsPage } from "./AdminCertificationsPage.jsx";
import { AdminHealthPage } from "./AdminHealthPage.jsx";
import { useEffect, useState } from "react";
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
import { adminPageFromPath, canonicalAdminPath, adminJson, adminRoutes, getToken, saveSession } from "./adminApi.js";

const adminPages = {
  login: AdminLoginPage,
  team: AdminTeamPage,
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
  const [identity, setIdentity] = useState(null);
  const [accessError, setAccessError] = useState('');
  useEffect(() => {
    if (page === 'login') return;
    let active = true;
    setIdentity(null); setAccessError('');
    adminJson('/api/admin/me').then(({ admin }) => {
      if (!active) return;
      saveSession({ admin, token: getToken() }, Boolean(localStorage.getItem('edunexAdminToken')));
      setIdentity(admin);
    }).catch(error => { if (active) setAccessError(error.message); });
    return () => { active = false; };
  }, [page]);

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

  if (page === 'login') return <Page />;
  if (accessError) return <main><p role="alert">{accessError}</p><a href={adminRoutes.login}>Sign in again</a></main>;
  if (!identity) return <p role="status">Checking workspace access…</p>;
  const permissions = { admin: identity, canWrite: ['admin', 'developer'].includes(identity.role), canManageRoles: identity.role === 'admin' };
  if ((page === 'team' && !permissions.canManageRoles) || (page === 'upload' && !permissions.canWrite)) return <main><p role="alert">You do not have access to this page.</p><a href={adminRoutes.dashboard}>Back to dashboard</a></main>;
  return <AdminPermissions.Provider value={permissions}><Page /></AdminPermissions.Provider>;
}

export { adminPageFromPath };
