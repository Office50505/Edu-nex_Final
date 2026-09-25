import { AdminWrite } from "./AdminPermissions.jsx";
import { PaymentGatewaySettings } from './PaymentGatewaySettings.jsx';
import { MarketingSettings } from './MarketingSettings.jsx';
import { useEffect, useMemo, useState } from "react";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, adminRoutes, formatDate, formatDateTime, formatNumber, formatWatchDuration, getAdmin, requireAdmin } from "./adminApi.js";

function valueText(value, fallback = "Not returned") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? `₹${formatNumber(number)}` : "₹0";
}

function Badge({ tone = "", children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function PlaceholderNote({ children = "Backend API not connected for mutations yet. This page shows only live data returned by the current admin endpoints." }) {
  return <p className="admin-placeholder-note">{children}</p>;
}

function MetricStrip({ items }) {
  return (
    <section className="summary-grid admin-v2-summary">
      {items.map(([label, value, meta]) => (
        <div className="summary-card" key={label}>
          <strong>{label}</strong>
          <span>{value}</span>
          {meta ? <small>{meta}</small> : null}
        </div>
      ))}
    </section>
  );
}

function StatusTable({ columns, rows, emptyText = "No records found." }) {
  if (!rows.length) return <div className="empty-state">{emptyText}</div>;
  return (
    <div className="admin-data-table" role="table">
      <div className="admin-data-head" role="row">
        {columns.map((column) => <span role="columnheader" key={column}>{column}</span>)}
      </div>
      {rows.map((row, index) => (
        <div className="admin-data-row" role="row" key={row.id || index}>
          {row.cells.map((cell, cellIndex) => <span role="cell" key={`${row.id || index}-${cellIndex}`}>{cell}</span>)}
        </div>
      ))}
    </div>
  );
}

function useOperationsData({ users = false, courses = false, analytics = false, health = false, certifications = false } = {}) {
  const [state, setState] = useState({ loading: true, error: "", users: [], courses: [], analytics: null, health: null, certifications: null });
  useEffect(() => {
    let active = true;
    async function load() {
      if (!requireAdmin()) return;
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const [userRows, courseRows, analyticsData, healthData, certData] = await Promise.all([
          users ? adminJson("/api/admin/user-management", {}, "Unable to load learners.") : Promise.resolve([]),
          courses ? adminJson("/api/admin/courses?summary=1", {}, "Unable to load courses.") : Promise.resolve([]),
          analytics ? adminJson("/api/admin/analytics", {}, "Unable to load analytics.") : Promise.resolve(null),
          health ? adminJson("/api/admin/system-health", {}, "Unable to load system health.") : Promise.resolve(null),
          certifications ? adminJson("/api/admin/certifications?page=1", {}, "Unable to load certifications.") : Promise.resolve(null),
        ]);
        if (active) setState({ loading: false, error: "", users: userRows || [], courses: courseRows || [], analytics: analyticsData, health: healthData, certifications: certData });
      } catch (error) {
        if (active) setState((current) => ({ ...current, loading: false, error: error.message || "Unable to load admin data." }));
      }
    }
    load();
    return () => { active = false; };
  }, [users, courses, analytics, health, certifications]);
  return state;
}

function subscriptionStatus(user) {
  return String(user.subscriptionStatus || "none").toLowerCase();
}

function userWatchMinutes(user) {
  return Number(user.watchSummary?.watchedMinutes || 0);
}

function userProgress(user) {
  return Number(user.progressSummary?.averageProgress || 0);
}

export function AdminSubscribersPage() {
  const { loading, error, users } = useOperationsData({ users: true });
  const subscribers = users.filter((user) => ["active", "subscribed", "trial", "1rs trial"].includes(subscriptionStatus(user)));
  return (
    <AdminShell activePage="subscribers" title="Subscribers" subtitle="Subscription pipeline view derived from learner records until a dedicated subscriptions API is added.">
      <Message text={error} type="error" />
      <PlaceholderNote />
      <MetricStrip items={[
        ["Subscribers", formatNumber(subscribers.filter((user) => ["active", "subscribed"].includes(subscriptionStatus(user))).length), "Paid or active learners"],
        ["Trials", formatNumber(subscribers.filter((user) => ["trial", "1rs trial"].includes(subscriptionStatus(user))).length), "Trial learners"],
        ["Watch time", formatWatchDuration(subscribers.reduce((sum, user) => sum + userWatchMinutes(user), 0)), "Across subscriber rows"],
      ]} />
      {loading ? <div className="loading-state">Loading subscribers...</div> : (
        <StatusTable
          columns={["Learner", "Contact", "Subscription", "Courses", "Watch time", "Completion", "Joined"]}
          rows={subscribers.slice(0, 50).map((user) => ({
            id: user._id,
            cells: [
              user.fullName || "Learner",
              user.email || user.mobileNumber || "No contact",
              <Badge tone={["active", "subscribed"].includes(subscriptionStatus(user)) ? "good" : "warn"}>{user.subscriptionStatus || "none"}</Badge>,
              formatNumber(user.progressSummary?.totalCourses || 0),
              formatWatchDuration(userWatchMinutes(user)),
              `${formatNumber(userProgress(user))}%`,
              formatDate(user.createdAt),
            ],
          }))}
        />
      )}
    </AdminShell>
  );
}

function courseQaFlags(course) {
  const videos = Array.isArray(course.videos) ? course.videos : [];
  const flags = [];
  if (!course.thumbnailUrl && !course.thumbnailVerticalUrl) flags.push("Missing thumbnail");
  if (!videos.length && Number(course.videoCount || 0) === 0) flags.push("No lessons");
  if (videos.length && !videos[0]?.videoUrl && !videos[0]?.embedUrl && !videos[0]?.bunnyVideoId) flags.push("Missing intro video");
  if (course.status === "draft") flags.push("Draft review");
  if (!Number(course.totalStarted || 0)) flags.push("No enrollments");
  return flags;
}

export function AdminCourseReviewPage() {
  const { loading, error, courses } = useOperationsData({ courses: true });
  const rows = courses.map((course) => ({ ...course, flags: courseQaFlags(course) })).filter((course) => course.flags.length);
  return (
    <AdminShell activePage="courseReview" title="Course Review" subtitle="Content QA queue for launch readiness, missing assets, and publish checks.">
      <Message text={error} type="error" />
      <PlaceholderNote>QA flags are derived from live course fields. Backend review states are still needed for approvals, owners, and history.</PlaceholderNote>
      <MetricStrip items={[
        ["Courses flagged", formatNumber(rows.length), "Need admin attention"],
        ["Published flagged", formatNumber(rows.filter((course) => course.status === "published").length), "Live courses with QA flags"],
        ["Draft flagged", formatNumber(rows.filter((course) => course.status !== "published").length), "Drafts awaiting review"],
      ]} />
      {loading ? <div className="loading-state">Loading course review queue...</div> : (
        <StatusTable
          columns={["Course", "Status", "Category", "Lessons", "QA flags", "Action"]}
          rows={rows.map((course) => ({
            id: course._id,
            cells: [
              course.title || "Untitled course",
              <Badge tone={course.status === "published" ? "good" : "warn"}>{course.status || "draft"}</Badge>,
              course.category?.name || "Uncategorized",
              formatNumber(course.videoCount || course.videos?.length || 0),
              <span className="flag-list">{course.flags.map((flag) => <Badge tone="warn" key={flag}>{flag}</Badge>)}</span>,
              <AdminWrite><a className="toolbar-button" href={`${adminRoutes.upload}?courseId=${encodeURIComponent(course._id)}`}>Review</a></AdminWrite>,
            ],
          }))}
        />
      )}
    </AdminShell>
  );
}

export function AdminOrdersPage() {
  const { loading, error, analytics } = useOperationsData({ analytics: true });
  const orders = analytics?.recentOrders || [];
  const totals = analytics?.totals || {};
  return (
    <AdminShell activePage="orders" title="Orders" subtitle="Order monitoring for paid, pending, and failed checkout activity.">
      <Message text={error} type="error" />
      <PlaceholderNote>Uses analytics recent orders. Add a paginated `/api/admin/orders` endpoint for full search, refunds, and exports.</PlaceholderNote>
      <MetricStrip items={[
        ["Paid in range", formatNumber(totals.paidOrdersInRange), money(totals.revenueInRange)],
        ["Pending", formatNumber(totals.pendingOrdersInRange), "Needs reconciliation"],
        ["Failed", formatNumber(totals.failedOrdersInRange), "Retry or contact learner"],
      ]} />
      {loading ? <div className="loading-state">Loading orders...</div> : (
        <StatusTable
          columns={["Order", "Learner", "Plan / course", "Amount", "Status", "Date", "Actions"]}
          rows={orders.map((order) => ({
            id: order._id || order.orderId,
            cells: [
              order.orderId || order.razorpayOrderId || "No order id",
              order.user?.fullName || order.user?.email || "Unknown learner",
              order.course?.title || order.orderType || "Subscription",
              money(order.totalAmount || order.amount || order.amountInRupees),
              <Badge tone={order.status === "paid" ? "good" : order.status === "failed" ? "bad" : "warn"}>{order.status || "pending"}</Badge>,
              formatDate(order.createdAt),
              <button className="toolbar-button" type="button" disabled>View</button>,
            ],
          }))}
        />
      )}
    </AdminShell>
  );
}

export function AdminPaymentsPage() {
  const { loading, error, analytics, health } = useOperationsData({ analytics: true, health: true });
  const totals = analytics?.totals || {};
  const paymentChecks = (health?.checks || []).filter((check) => ["payment-mode", "payments", "webhooks"].includes(check.id));
  return (
    <AdminShell activePage="payments" title="Payments" subtitle="Payment gateway readiness, failed payment alerts, and revenue controls.">
      <Message text={error} type="error" />
      <MetricStrip items={[
        ["Revenue in range", money(totals.revenueInRange), "Selected analytics range"],
        ["Lifetime revenue", money(totals.totalRevenue), "All paid orders"],
        ["Failed payments", formatNumber(totals.failedOrdersInRange), "Needs follow-up"],
      ]} />
      {loading ? <div className="loading-state">Loading payment checks...</div> : (
        <StatusTable
          columns={["Check", "Status", "Detail", "Next step"]}
          rows={paymentChecks.map((check) => ({
            id: check.id,
            cells: [check.label, <Badge tone={check.status === "healthy" ? "good" : check.status === "attention" ? "warn" : ""}>{check.status}</Badge>, check.detail, check.action || "No action returned"],
          }))}
          emptyText="No payment checks returned."
        />
      )}
    </AdminShell>
  );
}

export function AdminPaymentAuditorPage() {
  const [state, setState] = useState({ loading: true, error: "", report: null });
  const [risk, setRisk] = useState("flagged");
  const [query, setQuery] = useState("");

  async function load() {
    if (!requireAdmin()) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const report = await adminJson("/api/admin/payment-audit", {}, "Unable to run the payment audit.");
      setState({ loading: false, error: "", report });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || "Unable to run the payment audit." }));
    }
  }

  useEffect(() => { load(); }, []);
  const records = state.report?.records || [];
  const visibleRecords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      if (risk === "flagged" && record.risk === "clear") return false;
      if (!["all", "flagged"].includes(risk) && record.risk !== risk) return false;
      if (!needle) return true;
      return [record.orderId, record.providerReference, record.gateway, record.status, record.orderType, record.user?.fullName, record.user?.email, record.user?.mobileNumber]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [records, risk, query]);
  const summary = state.report?.summary || {};

  return (
    <AdminShell
      activePage="paymentAuditor"
      title="Payment Auditor"
      subtitle="Reconcile payment records and surface data inconsistencies before they affect learner access or reporting."
      actions={<button className="toolbar-button" type="button" onClick={load} disabled={state.loading}>{state.loading ? "Auditing..." : "Run audit"}</button>}
    >
      <Message text={state.error} type="error" />
      <MetricStrip items={[
        ["Records scanned", formatNumber(state.report?.scanned), state.report?.limited ? "Most recent records" : "All returned records"],
        ["Critical", formatNumber(summary.critical), "Immediate reconciliation"],
        ["Warnings", formatNumber(summary.warning), "Review recommended"],
        ["Clear", formatNumber(summary.clear), "No automated flags"],
      ]} />
      <section className="payment-audit-toolbar" aria-label="Payment audit filters">
        <label>Risk
          <select value={risk} onChange={(event) => setRisk(event.target.value)}>
            <option value="flagged">All flagged</option>
            <option value="critical">Critical</option>
            <option value="warning">Warnings</option>
            <option value="clear">Clear</option>
            <option value="all">All records</option>
          </select>
        </label>
        <label>Search
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order, provider ID, learner..." />
        </label>
        <p>{formatNumber(visibleRecords.length)} shown · Generated {formatDateTime(state.report?.generatedAt)}</p>
      </section>
      {state.loading && !state.report ? <div className="loading-state">Auditing payment records...</div> : (
        <div className="payment-audit-list">
          {visibleRecords.map((record) => (
            <article className={`payment-audit-card is-${record.risk}`} key={record._id}>
              <header>
                <div><strong>{record.orderId || "Missing order ID"}</strong><span>{record.user?.fullName || record.user?.email || "Missing learner"}</span></div>
                <Badge tone={record.risk === "critical" ? "bad" : record.risk === "warning" ? "warn" : "good"}>{record.risk}</Badge>
              </header>
              <dl>
                <div><dt>Amount</dt><dd>{money(record.totalAmount)}</dd></div>
                <div><dt>Status</dt><dd>{record.status || "unknown"}</dd></div>
                <div><dt>Gateway</dt><dd>{record.gateway || "unknown"}{record.gatewayMode ? ` · ${record.gatewayMode}` : ""}</dd></div>
                <div><dt>Provider ID</dt><dd>{record.providerReference || "Missing"}</dd></div>
                <div><dt>Type</dt><dd>{String(record.orderType || "unknown").replaceAll("_", " ")}</dd></div>
                <div><dt>Created</dt><dd>{formatDateTime(record.createdAt)}</dd></div>
              </dl>
              <div className="payment-audit-findings">
                {record.issues?.length ? record.issues.map((issue) => <Badge tone={issue.severity === "critical" ? "bad" : "warn"} key={issue.code}>{issue.label}</Badge>) : <Badge tone="good">No automated issues</Badge>}
              </div>
            </article>
          ))}
          {!visibleRecords.length ? <div className="empty-state">No payment records match these filters.</div> : null}
        </div>
      )}
    </AdminShell>
  );
}

export function AdminSubscriptionsPage() {
  const { loading, error, analytics } = useOperationsData({ analytics: true });
  const mix = analytics?.breakdowns?.userSubscriptionStatus || analytics?.breakdowns?.subscriptionStatus || {};
  const rows = Object.entries(mix).map(([status, count]) => ({ id: status, cells: [status || "none", formatNumber(count), "Analytics API rollup", <a className="toolbar-button" href={`${adminRoutes.users}?subscription=${encodeURIComponent(status || "none")}`}>Manage learners</a>] }));
  return (
    <AdminShell activePage="subscriptions" title="Subscriptions" subtitle="Subscription mix, churn signals, and plan operations.">
      <Message text={error} type="error" />
      <PlaceholderNote>Select Manage learners to update subscription status and access duration.</PlaceholderNote>
      {loading ? <div className="loading-state">Loading subscription mix...</div> : <StatusTable columns={["Status", "Learners", "Source", "Actions"]} rows={rows} />}
    </AdminShell>
  );
}

export function AdminProgressPage() {
  const { loading, error, users } = useOperationsData({ users: true });
  const rows = users
    .filter((user) => Number(user.progressSummary?.totalCourses || 0) > 0 || userWatchMinutes(user) > 0)
    .sort((a, b) => userProgress(b) - userProgress(a))
    .slice(0, 60);
  return (
    <AdminShell activePage="progress" title="Learning Progress" subtitle="Learner engagement, low-progress detection, and completion monitoring.">
      <Message text={error} type="error" />
      <MetricStrip items={[
        ["Tracked learners", formatNumber(rows.length), "With progress or watch time"],
        ["Low progress", formatNumber(rows.filter((user) => userProgress(user) < 35).length), "Below 35% average"],
        ["Watch time", formatWatchDuration(rows.reduce((sum, user) => sum + userWatchMinutes(user), 0)), "Tracked rows"],
      ]} />
      {loading ? <div className="loading-state">Loading progress...</div> : (
        <StatusTable
          columns={["Learner", "Courses", "Completed", "Completion", "Watch time", "Last active"]}
          rows={rows.map((user) => ({
            id: user._id,
            cells: [
              user.fullName || user.email || "Learner",
              formatNumber(user.progressSummary?.totalCourses || 0),
              formatNumber(user.progressSummary?.completedCourses || 0),
              <Badge tone={userProgress(user) >= 70 ? "good" : userProgress(user) >= 35 ? "warn" : "bad"}>{formatNumber(userProgress(user))}%</Badge>,
              formatWatchDuration(userWatchMinutes(user)),
              formatDate(user.lastActiveAt || user.watchSummary?.lastWatchedAt || user.createdAt),
            ],
          }))}
        />
      )}
    </AdminShell>
  );
}

export function AdminAuditLogPage() {
  const { loading, error, analytics } = useOperationsData({ analytics: true });
  const events = analytics?.recentEvents || [];
  return (
    <AdminShell activePage="auditLog" title="Audit Log" subtitle="Administrative and platform activity trail.">
      <Message text={error} type="error" />
      <PlaceholderNote>Analytics events are shown when returned. Persistent admin audit records still need a backend actor/action/entity endpoint.</PlaceholderNote>
      {loading ? <div className="loading-state">Loading audit trail...</div> : (
        <StatusTable
          columns={["Actor", "Action", "Entity", "Timestamp", "Details"]}
          rows={events.slice(0, 50).map((event) => ({
            id: event._id,
            cells: [
              event.userId || "system",
              event.event || "activity",
              event.courseId || event.videoId || "platform",
              formatDate(event.createdAt),
              event.courseTitle || event.videoTitle || event.metadata?.message || "No details",
            ],
          }))}
          emptyText="No audit-like activity returned by analytics."
        />
      )}
    </AdminShell>
  );
}

export function AdminSettingsPage() {
  const { loading, error, health } = useOperationsData({ health: true });
  const admin = getAdmin() || { name: "Skillomate Admin", role: "admin" };
  const checks = health?.checks || [];
  const cache = checks.find((check) => check.id === "cache");
  const settings = useMemo(() => [
    ["Admin profile", admin.name || "Skillomate Admin", admin.role || "admin"],
    ["Theme preference", localStorage.getItem("edunexAdminTheme") || "dark", "Saved locally"],
    ["Cache backend", cache?.status || "Not checked", cache?.detail || "No cache status returned"],
    ["Session", "Active", "Use Log out from the sidebar to end this admin session"],
  ], [admin.name, admin.role, cache]);
  return (
    <AdminShell activePage="settings" title="Admin Settings" subtitle="Profile, session, environment readiness, and workspace preferences.">
      <Message text={error} type="error" />
      <PaymentGatewaySettings />
      <MarketingSettings />
      {loading ? <div className="loading-state">Loading settings...</div> : (
        <StatusTable columns={["Setting", "Value", "Detail"]} rows={settings.map(([name, value, detail]) => ({ id: name, cells: [name, value, detail] }))} />
      )}
    </AdminShell>
  );
}
