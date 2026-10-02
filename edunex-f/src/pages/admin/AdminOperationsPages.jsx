import { AdminWrite } from "./AdminPermissions.jsx";
import { PaymentGatewaySettings } from './PaymentGatewaySettings.jsx';
import { MarketingSettings } from './MarketingSettings.jsx';
import { useEffect, useMemo, useState } from "react";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, adminRoutes, formatDate, formatDateTime, formatNumber, formatWatchDuration, getAdmin, requireAdmin } from "./adminApi.js";
import { AdminDateRangeFilter, dateInRange, defaultDateRange } from "./AdminDateRangeFilter.jsx";

function valueText(value, fallback = "Not returned") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(number / 100) : "₹0";
}

function Badge({ tone = "", children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function subscriptionLabel(status) {
  const value = String(status || "none").toLowerCase();
  const labels = {
    active: "Active",
    subscribed: "Subscribed",
    trial: "Trial",
    "1rs trial": "Rs 1 trial",
    grace: "Grace period",
    expired: "Expired",
    cancelled: "Cancelled",
    none: "No subscription",
  };
  return labels[value] || value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function subscriptionTone(status) {
  const value = String(status || "none").toLowerCase();
  if (["active", "subscribed"].includes(value)) return "good";
  if (["trial", "1rs trial", "grace"].includes(value)) return "warn";
  if (["expired", "cancelled"].includes(value)) return "bad";
  return "";
}

function subscriptionHint(status) {
  const value = String(status || "none").toLowerCase();
  if (["active", "subscribed"].includes(value)) return "Paid or manually enabled learner access.";
  if (["trial", "1rs trial"].includes(value)) return "Trial cohort that may need conversion follow-up.";
  if (value === "grace") return "Temporary access window before renewal or expiry.";
  if (["expired", "cancelled"].includes(value)) return "Needs retention, billing, or access review.";
  return "Learners without active subscription access.";
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

function StatusTable({ columns, rows, emptyText = "No records found.", className = "" }) {
  if (!rows.length) return <div className="empty-state">{emptyText}</div>;
  return (
    <div className={`admin-data-table ${className}`.trim()} role="table">
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

function orderTypeLabel(type) {
  const labels = {
    trial_charge: "Trial charge",
    mandate_setup: "Mandate setup",
    subscription_charge: "Subscription renewal",
    one_time_access: "Direct access",
    refund: "Refund",
  };
  return labels[type] || valueText(type, "Payment");
}

function paymentMethodLabel(order) {
  if (order.orderType === "subscription_charge") return "AutoPay";
  if (order.razorpaySubscriptionId || order.subscription?.razorpaySubscriptionId) return "Direct subscription";
  if (order.orderType === "trial_charge") return "Trial payment";
  if (order.orderType === "one_time_access") return "Direct payment";
  if (order.orderType === "mandate_setup") return "Mandate setup";
  return "Direct payment";
}

function customerStage(order) {
  const status = String(order.user?.subscriptionStatus || order.subscription?.status || "none").toLowerCase();
  if (["active", "subscribed"].includes(status)) return "Customer";
  if (["trial", "1rs trial"].includes(status)) return "Trial";
  return "None";
}

function paymentReference(order) {
  if (order.ledgerSource === "subscription_period") return `Subscription period ${order.razorpaySubscriptionId || order.subscription?.razorpaySubscriptionId || ""}`.trim();
  return order.razorpayPaymentId
    || order.phonePeTransactionId
    || order.phonePeMerchantTransactionId
    || order.razorpaySubscriptionId
    || order.subscription?.razorpaySubscriptionId
    || order._id
    || "No reference";
}

function messageText(message) {
  if (typeof message === "string") return message;
  return String(message?.content || message?.text || message?.message || message?.answer || "");
}

function messageRole(message) {
  return String(message?.role || message?.sender || "message").toLowerCase();
}

function clippedText(value, max = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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
  const [ledger, setLedger] = useState({ loading: true, error: "", payments: [], summary: {}, limited: false });
  const [dateRange, setDateRange] = useState(() => defaultDateRange("allTime"));
  const [query, setQuery] = useState("");
  useEffect(() => {
    let active = true;
    async function loadPayments() {
      if (!requireAdmin()) return;
      setLedger((current) => ({ ...current, loading: true, error: "" }));
      try {
        const data = await adminJson("/api/admin/payments?limit=500", {}, "Unable to load payment ledger.");
        if (active) setLedger({ loading: false, error: "", payments: data.payments || [], summary: data.summary || {}, limited: Boolean(data.limited) });
      } catch (error) {
        if (active) setLedger((current) => ({ ...current, loading: false, error: error.message || "Unable to load payment ledger." }));
      }
    }
    loadPayments();
    return () => { active = false; };
  }, []);
  const totals = analytics?.totals || {};
  const paymentChecks = (health?.checks || []).filter((check) => ["payment-mode", "payments", "webhooks"].includes(check.id));
  const filteredPayments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (ledger.payments || []).filter((order) => {
      const matchesDate = dateInRange(order.paidAt || order.createdAt, dateRange);
      if (!matchesDate) return false;
      if (!needle) return true;
      return [
        order.user?.fullName,
        order.user?.mobileNumber,
        order.user?.email,
        order.gateway,
        order.status,
        order.orderType,
        order.razorpayPaymentId,
        order.razorpayOrderId,
        order._id,
      ].some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [ledger.payments, dateRange, query]);
  const filteredSummary = useMemo(() => ({
    count: filteredPayments.length,
    totalAmount: filteredPayments.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
    autoPayCount: filteredPayments.filter((order) => paymentMethodLabel(order) === "AutoPay").length,
    directCount: filteredPayments.filter((order) => paymentMethodLabel(order) !== "AutoPay").length,
    autoPayAmount: filteredPayments.filter((order) => paymentMethodLabel(order) === "AutoPay").reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
    directAmount: filteredPayments.filter((order) => paymentMethodLabel(order) !== "AutoPay").reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
  }), [filteredPayments]);
  const lifetimeSummary = ledger.summary || {};
  const lifetimeTotal = Number(lifetimeSummary.lifetimeTotalAmount ?? totals.totalRevenue ?? 0);
  const lifetimeBreakdown = Array.isArray(lifetimeSummary.lifetimeBreakdown) ? lifetimeSummary.lifetimeBreakdown : [];
  const revenueBreakdownRows = [
    {
      id: "autopay-total",
      label: "AutoPay renewals",
      amount: Number(lifetimeSummary.lifetimeAutoPayAmount || 0),
      count: Number(lifetimeSummary.lifetimeAutoPayCount || 0),
      note: "Subscribers charged by recurring renewal",
    },
    {
      id: "direct-total",
      label: "Direct payments",
      amount: Number(lifetimeSummary.lifetimeDirectAmount || 0),
      count: Number(lifetimeSummary.lifetimeDirectCount || 0),
      note: "Trial, mandate setup, and one-time access payments",
    },
    ...lifetimeBreakdown.map((row) => ({
      id: `type-${row.orderType || "unknown"}`,
      label: orderTypeLabel(row.orderType),
      amount: Number(row.amount || 0),
      count: Number(row.count || 0),
      note: "Order type detail",
    })),
  ].filter((row, index, rows) => row.amount > 0 || row.count > 0 || index < 2)
    .filter((row, index, rows) => rows.findIndex((candidate) => candidate.id === row.id) === index);
  const autoPayPayments = (ledger.payments || []).filter((order) => paymentMethodLabel(order) === "AutoPay");
  return (
    <AdminShell activePage="payments" shellClass="payments-shell" title="Payments" subtitle="Money received, AutoPay cuts, direct payments, and user payment context.">
      <Message text={error} type="error" />
      <Message text={ledger.error} type="error" />
      <section className="controls-panel date-filter-panel">
        <div>
          <label htmlFor="paymentLedgerSearch">Search</label>
          <input id="paymentLedgerSearch" type="search" placeholder="User, mobile, gateway, reference" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div>
          <label>Payment date</label>
          <AdminDateRangeFilter value={dateRange} onChange={setDateRange} label="Payment date" />
        </div>
        <button className="toolbar-button" type="button" onClick={() => { setQuery(""); setDateRange(defaultDateRange("allTime")); }}>Clear</button>
      </section>
      <MetricStrip items={[
        ["Ledger received", money(filteredSummary.totalAmount), `${formatNumber(filteredSummary.count)} paid rows shown`],
        ["Lifetime revenue", money(lifetimeTotal), `${money(lifetimeSummary.lifetimeAutoPayAmount)} AutoPay · ${money(lifetimeSummary.lifetimeDirectAmount)} direct`],
        ["AutoPay cuts", money(filteredSummary.autoPayAmount), `${formatNumber(filteredSummary.autoPayCount)} monthly renewals`],
        ["Direct payments", money(filteredSummary.directAmount), `${formatNumber(filteredSummary.directCount)} trial, mandate, or one-time payments`],
      ]} />
      <section className="dashboard-panel">
        <h2 className="panel-title">Revenue breakdown</h2>
        {ledger.loading ? <div className="loading-state">Loading revenue breakdown...</div> : (
          <StatusTable
            className="revenue-breakdown-table"
            columns={["Source", "Amount", "Paid orders", "Detail"]}
            rows={revenueBreakdownRows.map((row) => ({
              id: row.id,
              cells: [row.label, <strong>{money(row.amount)}</strong>, formatNumber(row.count), row.note],
            }))}
            emptyText="No paid revenue returned."
          />
        )}
      </section>
      <section className="dashboard-panel">
        <h2 className="panel-title">AutoPay subscribers</h2>
        {ledger.loading ? <div className="loading-state">Loading AutoPay subscribers...</div> : (
          <StatusTable
            className="autopay-subscriber-table"
            columns={["Subscriber", "Amount paid", "Paid at", "Subscription", "Reference"]}
            rows={autoPayPayments.map((order) => ({
              id: order._id || paymentReference(order),
              cells: [
                <span className="payment-user-cell"><strong>{order.user?.fullName || "Unknown user"}</strong><small>{order.user?.mobileNumber || order.user?.email || "No contact"}</small></span>,
                <span className="payment-amount-cell"><strong>{money(order.totalAmount)}</strong><small>{orderTypeLabel(order.orderType)}</small></span>,
                formatDateTime(order.paidAt || order.createdAt),
                valueText(order.razorpaySubscriptionId || order.subscription?.razorpaySubscriptionId, "No subscription id"),
                paymentReference(order),
              ],
            }))}
            emptyText="No AutoPay subscriber payments returned."
          />
        )}
      </section>
      <section className="dashboard-panel payment-ledger-panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Payment ledger</h2>
            <p>{formatNumber(filteredPayments.length)} shown from {formatNumber(ledger.payments.length)} paid records</p>
          </div>
          <Badge tone={ledger.limited ? "warn" : "good"}>{ledger.limited ? "Limited" : "Live"}</Badge>
        </div>
        {ledger.loading ? <div className="loading-state">Loading payment ledger...</div> : (
          <StatusTable
            className="payment-ledger-table"
            columns={["User", "Amount", "Date", "Payment mode", "Customer state", "Gateway", "Reference"]}
            rows={filteredPayments.map((order) => ({
              id: order._id || paymentReference(order),
              cells: [
                <span className="payment-user-cell"><strong>{order.user?.fullName || "Unknown user"}</strong><small>{order.user?.mobileNumber || order.user?.email || "No contact"}</small></span>,
                <span className="payment-amount-cell"><strong>{money(order.totalAmount)}</strong><small>{orderTypeLabel(order.orderType)}</small></span>,
                formatDateTime(order.paidAt || order.createdAt),
                <Badge tone={paymentMethodLabel(order) === "AutoPay" ? "good" : "warn"}>{paymentMethodLabel(order)}</Badge>,
                <Badge tone={customerStage(order) === "Customer" ? "good" : customerStage(order) === "Trial" ? "warn" : ""}>{customerStage(order)}</Badge>,
                valueText(order.gateway || order.subscription?.gateway, "Unknown"),
                paymentReference(order),
              ],
            }))}
            emptyText="No paid payments returned."
          />
        )}
      </section>
      <section className="dashboard-panel">
        <h2 className="panel-title">Gateway checks</h2>
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
      </section>
    </AdminShell>
  );
}

export function AdminAiChatsPage() {
  const [state, setState] = useState({ loading: true, error: "", sessions: [], summary: {} });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [dateRange, setDateRange] = useState(() => defaultDateRange("today"));

  useEffect(() => {
    let active = true;
    async function load() {
      if (!requireAdmin()) return;
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const data = await adminJson("/api/admin/ai-chats?limit=200", {}, "Unable to load Nex AI chat history.");
        if (active) {
          setState({ loading: false, error: "", sessions: data.sessions || [], summary: data.summary || {} });
          setSelectedId((current) => current || String(data.sessions?.[0]?._id || ""));
        }
      } catch (error) {
        if (active) setState((current) => ({ ...current, loading: false, error: error.message || "Unable to load Nex AI chat history." }));
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const inRange = state.sessions.filter((session) => dateInRange(session.lastUpdatedAt || session.updatedAt || session.createdAt, dateRange));
    if (!needle) return inRange;
    return inRange.filter((session) => [
      session.user?.fullName,
      session.user?.email,
      session.user?.mobileNumber,
      session.user?.subscriptionStatus,
      session.course?.title,
      ...(Array.isArray(session.messages) ? session.messages.map(messageText).slice(-6) : []),
    ].some((value) => String(value || "").toLowerCase().includes(needle)));
  }, [query, state.sessions, dateRange]);

  const selected = filtered.find((session) => String(session._id) === selectedId) || filtered[0] || null;
  const messages = Array.isArray(selected?.messages) ? selected.messages : [];

  return (
    <AdminShell activePage="aiChats" title="Nex AI Chats" subtitle="Review learner conversations with Nex AI by user, course, date, and message history.">
      <Message text={state.error} type="error" />
      <MetricStrip items={[
        ["Chat sessions", formatNumber(filtered.length), "User-course conversations"],
        ["Users", formatNumber(new Set(filtered.map((session) => session.user?._id || session.user?.mobileNumber || session.user?.email).filter(Boolean)).size), "Learners with saved chats"],
        ["Messages", formatNumber(filtered.reduce((sum, session) => sum + (Array.isArray(session.messages) ? session.messages.length : 0), 0)), "Saved user and AI messages"],
      ]} />
      <section className="controls-panel">
        <div className="filter-group">
          <label htmlFor="aiChatSearch">Search chats</label>
          <input id="aiChatSearch" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by user, phone, course, status, or message" />
        </div>
        <div>
          <label>Chat date</label>
          <AdminDateRangeFilter value={dateRange} onChange={setDateRange} label="Chat date" />
        </div>
      </section>
      {state.loading ? <div className="loading-state">Loading Nex AI chats...</div> : (
        <div className="analytics-grid ai-chat-grid">
          <section className="dashboard-panel">
            <h2 className="panel-title">Chat sessions</h2>
            <StatusTable
              columns={["User", "Course", "Messages", "Last active", "Last message"]}
              rows={filtered.map((session) => {
                const sessionMessages = Array.isArray(session.messages) ? session.messages : [];
                const last = sessionMessages[sessionMessages.length - 1];
                return {
                  id: session._id,
                  cells: [
                    <button className="toolbar-button" type="button" onClick={() => setSelectedId(String(session._id))}>
                      {session.user?.fullName || session.user?.mobileNumber || "Unknown user"}
                    </button>,
                    session.course?.title || "No course",
                    formatNumber(sessionMessages.length),
                    formatDateTime(session.lastUpdatedAt),
                    clippedText(messageText(last), 90) || "No messages",
                  ],
                };
              })}
              emptyText="No Nex AI chat sessions found."
            />
          </section>
          <section className="dashboard-panel">
            <h2 className="panel-title">Transcript</h2>
            {selected ? (
              <>
                <div className="data-list">
                  <div className="data-row"><span>User</span><strong>{selected.user?.fullName || "Unknown user"}</strong></div>
                  <div className="data-row"><span>Contact</span><strong>{selected.user?.mobileNumber || selected.user?.email || "No contact"}</strong></div>
                  <div className="data-row"><span>Subscription</span><strong>{selected.user?.subscriptionStatus || "none"}</strong></div>
                  <div className="data-row"><span>Course</span><strong>{selected.course?.title || "No course"}</strong></div>
                </div>
                <div className="payment-audit-grid">
                  {messages.map((message, index) => {
                    const role = messageRole(message);
                    return (
                      <article className="payment-audit-card" key={`${selected._id}-${index}`}>
                        <div className="payment-audit-card-head">
                          <strong>{role === "assistant" ? "Nex AI" : role === "user" ? "User" : valueText(role, "Message")}</strong>
                          <Badge tone={role === "assistant" ? "good" : "warn"}>{role}</Badge>
                        </div>
                        <p>{messageText(message) || "Empty message"}</p>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : <div className="empty-state">Select a chat session to view messages.</div>}
          </section>
        </div>
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
  const rows = Object.entries(mix)
    .map(([status, count]) => ({ status: String(status || "none").toLowerCase(), count: Number(count || 0) }))
    .sort((a, b) => {
      const priority = ["active", "subscribed", "trial", "1rs trial", "grace", "expired", "cancelled", "none"];
      return (priority.indexOf(a.status) === -1 ? priority.length : priority.indexOf(a.status)) - (priority.indexOf(b.status) === -1 ? priority.length : priority.indexOf(b.status));
    });
  const totalLearners = rows.reduce((sum, row) => sum + row.count, 0);
  const activeLearners = rows.filter((row) => ["active", "subscribed"].includes(row.status)).reduce((sum, row) => sum + row.count, 0);
  const trialLearners = rows.filter((row) => ["trial", "1rs trial", "grace"].includes(row.status)).reduce((sum, row) => sum + row.count, 0);
  const reviewLearners = rows.filter((row) => ["expired", "cancelled", "none"].includes(row.status)).reduce((sum, row) => sum + row.count, 0);
  return (
    <AdminShell activePage="subscriptions" shellClass="subscriptions-shell" title="Subscriptions" subtitle="Subscription mix, churn signals, and plan operations.">
      <Message text={error} type="error" />
      <PlaceholderNote>Select Manage learners to update subscription status and access duration.</PlaceholderNote>
      <MetricStrip items={[
        ["Tracked learners", formatNumber(totalLearners), "Across subscription statuses"],
        ["Paid / active", formatNumber(activeLearners), "Currently enabled"],
        ["Trial / grace", formatNumber(trialLearners), "Conversion follow-up"],
        ["Needs review", formatNumber(reviewLearners), "Expired, cancelled, or none"],
      ]} />
      {loading ? <div className="loading-state">Loading subscription mix...</div> : (
        <section className="subscription-mix-panel" aria-label="Subscription status mix">
          <header className="subscription-mix-toolbar">
            <div>
              <strong>Subscription status mix</strong>
              <span>{formatNumber(rows.length)} status groups from Analytics API rollup</span>
            </div>
            <a className="toolbar-button" href={adminRoutes.users}>View all learners</a>
          </header>
          <div className="subscription-mix-head" aria-hidden="true">
            <span>Status</span>
            <span>Learners</span>
            <span>Source</span>
            <span>Action</span>
          </div>
          <div className="subscription-mix-list">
            {rows.map((row) => {
              const tone = subscriptionTone(row.status);
              const share = totalLearners ? Math.round((row.count / totalLearners) * 100) : 0;
              return (
                <article className={`subscription-mix-row ${tone ? `is-${tone}` : "is-neutral"}`} key={row.status}>
                  <div className="subscription-status-cell">
                    <Badge tone={tone}>{subscriptionLabel(row.status)}</Badge>
                    <div>
                      <strong>{subscriptionLabel(row.status)}</strong>
                      <span>{subscriptionHint(row.status)}</span>
                    </div>
                  </div>
                  <div className="subscription-count-cell">
                    <strong>{formatNumber(row.count)}</strong>
                    <span>{formatNumber(share)}% of tracked learners</span>
                  </div>
                  <div className="subscription-source-cell">
                    <strong>Analytics API</strong>
                    <span>Live dashboard rollup</span>
                  </div>
                  <a className="toolbar-button" href={`${adminRoutes.users}?subscription=${encodeURIComponent(row.status)}`}>Manage learners</a>
                </article>
              );
            })}
            {!rows.length ? <div className="empty-state">No subscription mix returned yet.</div> : null}
          </div>
        </section>
      )}
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
          emptyText="No audit activity yet."
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
