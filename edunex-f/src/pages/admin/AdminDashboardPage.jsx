import { useAdminPermissions } from "./AdminPermissions.jsx";
import { useEffect, useMemo, useState } from "react";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, adminRoutes, formatDate, formatNumber, formatWatchDuration, requireAdmin } from "./adminApi.js";

function hasNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function chartNumber(value) {
  return hasNumber(value) ? Number(value) : 0;
}

function firstField(object, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object || {}, key)) return object[key];
  }
  return undefined;
}

function displayNumber(value) {
  return hasNumber(value) ? formatNumber(value) : "Not returned";
}

function money(value) {
  return hasNumber(value) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0) / 100) : "Not returned";
}

function textValue(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "Not returned";
}

function orderTypeLabel(value) {
  const type = String(value || "").trim();
  if (type === "trial_charge") return "1-Day Trial";
  if (type === "subscription_charge") return "Monthly Subscription";
  if (type === "mandate_setup") return "Mandate Setup";
  if (type === "refund") return "Refund";
  return textValue(type.replaceAll("_", " "));
}

function gatewayLabel(value) {
  const gateway = String(value || "").trim().toLowerCase();
  if (gateway === "phonepe") return "PhonePe";
  if (gateway === "razorpay") return "Razorpay";
  return gateway ? gateway.replaceAll("_", " ") : "Gateway not returned";
}

function subscriptionDateLine(subscription) {
  if (subscription?.cancelledAt) return `Cancelled ${formatDate(subscription.cancelledAt)}`;
  if (subscription?.nextBillingAt) return `Next ${formatDate(subscription.nextBillingAt)}`;
  if (subscription?.currentPeriodEnd) return `Period ends ${formatDate(subscription.currentPeriodEnd)}`;
  if (subscription?.trialExpiresAt) return `Trial ends ${formatDate(subscription.trialExpiresAt)}`;
  return "Billing date not returned";
}

function sumCounts(items) {
  return Array.isArray(items) ? items.reduce((sum, item) => sum + chartNumber(item.count), 0) : 0;
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function datesForPreset(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - Number(days) + 1);
  return { startDate: toDateInput(start), endDate: toDateInput(end) };
}

function DataRow({ title, meta, value }) {
  return (
    <div className="data-row">
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <b>{value}</b>
    </div>
  );
}

function DataList({ rows, emptyText }) {
  if (!rows.length) return <div className="empty-state compact-empty">{emptyText}</div>;
  return rows.map((row, index) => <DataRow key={`${row.title}-${row.meta}-${row.value}-${index}`} {...row} />);
}

function Badge({ tone = "", children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function compactBreakdown(items, limit = 3) {
  const labels = (Array.isArray(items) ? items : [])
    .filter((item) => chartNumber(item.count) > 0)
    .sort((a, b) => chartNumber(b.count) - chartNumber(a.count))
    .slice(0, limit)
    .map((item) => `${textValue(item.label, item.type)} ${displayNumber(item.count)}`);

  return labels.length ? labels.join(", ") : "No records returned";
}

function DashboardMetrics({ data }) {
  const totals = data?.totals || {};
  const learning = data?.learning || {};
  const activeSubscriptionCount = firstField(totals, ["activeSubscriptions", "subscribedUsers"]);
  const trialUserCount = firstField(totals, ["trialUsers", "oneRupeeTrialUsers"]);
  const metrics = [
    { label: "Total learners", value: displayNumber(totals.users), meta: `${displayNumber(totals.newUsers)} new in range` },
    { label: "Active learners", value: displayNumber(totals.activeUsers), meta: `${displayNumber(totals.mobileVerifiedUsers)} mobile verified` },
    { label: "New learners", value: displayNumber(totals.newUsers), meta: "Selected range" },
    { label: "Subscribers", value: displayNumber(activeSubscriptionCount), meta: `${displayNumber(trialUserCount)} trials` },
    { label: "Trials", value: displayNumber(trialUserCount), meta: `${displayNumber(totals.noSubscriptionUsers)} no plan` },
    { label: "AutoPay active", value: displayNumber(totals.autoPayActiveSubscriptions), meta: "Mandates ready to renew" },
    { label: "Cancelled mandates", value: displayNumber(totals.cancelledMandates), meta: "Needs retention follow-up" },
    { label: "Renewal pending", value: displayNumber(totals.renewalPendingSubscriptions), meta: "Trial elapsed, monthly charge not seen" },
    { label: "Revenue in range", value: money(totals.revenueInRange), meta: `${money(totals.totalRevenue)} lifetime` },
    { label: "Lifetime revenue", value: money(totals.totalRevenue), meta: "All paid orders" },
    { label: "Orders", value: displayNumber(totals.paidOrdersInRange), meta: `${displayNumber(totals.failedOrdersInRange)} failed, ${displayNumber(totals.pendingOrdersInRange)} pending` },
    { label: "Failed payments", value: displayNumber(totals.failedOrdersInRange), meta: "Needs follow-up" },
    { label: "Pending payments", value: displayNumber(totals.pendingOrdersInRange), meta: "Needs reconciliation" },
    { label: "Courses", value: displayNumber(totals.courses), meta: `${displayNumber(totals.publishedCourses)} published` },
    { label: "Published courses", value: displayNumber(totals.publishedCourses), meta: `${displayNumber(totals.draftCourses)} drafts` },
    { label: "Draft courses", value: displayNumber(totals.draftCourses), meta: "Awaiting review" },
    { label: "Watch Time", value: hasNumber(learning.watchedMinutes) ? formatWatchDuration(learning.watchedMinutes) : "Not returned", meta: `${displayNumber(learning.activeLearnersInRange)} active learners` },
    { label: "Completion", value: hasNumber(learning.completionShare) ? `${displayNumber(learning.completionShare)}%` : "Not returned", meta: `${displayNumber(learning.completedProgress)} completed records` },
    { label: "Certificates issued", value: displayNumber(data?.certificationSummary?.total), meta: `${displayNumber(data?.certificationSummary?.pendingProgress)} pending checks` },
  ];

  return (
    <section className="analytics-grid" aria-label="Analytics summary">
      {metrics.map((item) => (
        <div className="metric-card" key={item.label}>
          <span>{item.value}</span>
          <strong>{item.label}</strong>
          <small>{item.meta}</small>
        </div>
      ))}
    </section>
  );
}

function DashboardMetricsLoading() {
  const labels = ["Total Users", "Active Users", "Subscribers", "Revenue", "Orders", "Courses", "Watch Time", "Completion"];
  return (
    <section className="analytics-grid" aria-label="Analytics loading">
      {labels.map((label) => (
        <div className="metric-card is-loading" key={label}>
          <span aria-hidden="true" />
          <strong>{label}</strong>
          <small>Loading data</small>
        </div>
      ))}
    </section>
  );
}

function TrendChart({ rows }) {
  const series = Array.isArray(rows) ? rows : [];
  if (!series.length) return <div className="empty-state compact-empty">No trend data for this range.</div>;
  const maxRevenue = Math.max(...series.map((item) => chartNumber(item.revenue)), 1);
  const maxUsers = Math.max(...series.map((item) => chartNumber(item.users)), 1);
  const maxWatch = Math.max(...series.map((item) => chartNumber(item.watchMinutes)), 1);

  return (
    <div className="trend-chart">
      {series.map((item) => {
        const revenueHeight = Math.max(4, Math.round((chartNumber(item.revenue) / maxRevenue) * 100));
        const userHeight = Math.max(4, Math.round((chartNumber(item.users) / maxUsers) * 100));
        const watchHeight = Math.max(4, Math.round((chartNumber(item.watchMinutes) / maxWatch) * 100));
        return (
          <div
            className="trend-day"
            key={item.date}
            title={`${formatDate(item.date)}: ${money(item.revenue)}, ${displayNumber(item.users)} users, ${displayNumber(item.watchMinutes)} minutes`}
          >
            <div className="trend-bars" aria-hidden="true">
              <span className="revenue" style={{ height: `${revenueHeight}%` }} />
              <span className="users" style={{ height: `${userHeight}%` }} />
              <span className="watch" style={{ height: `${watchHeight}%` }} />
            </div>
            <small>{String(item.date || "").slice(5)}</small>
          </div>
        );
      })}
    </div>
  );
}

function MiniBars({ rows, field }) {
  const series = Array.isArray(rows) ? rows.filter((item) => hasNumber(item?.[field])) : [];
  if (!series.length) return <div className="empty-state compact-empty">No live trend data returned.</div>;
  const values = series.map((item) => chartNumber(item[field]));
  const max = Math.max(...values, 1);
  return (
    <div className="mini-bars">
      {series.slice(-18).map((item, index) => {
        const value = chartNumber(item[field]);
        const height = Math.max(8, Math.round((value / max) * 100));
        return <span key={`${field}-${item.date || index}`} title={`${item.date || index}: ${displayNumber(value)}`} style={{ height: `${height}%` }} />;
      })}
    </div>
  );
}

export function AdminDashboardPage() {
  const { canWrite } = useAdminPermissions();
  const presetDates = useMemo(() => datesForPreset(30), []);
  const [rangePreset, setRangePreset] = useState("30");
  const [startDate, setStartDate] = useState(presetDates.startDate);
  const [endDate, setEndDate] = useState(presetDates.endDate);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState("Waiting for data");

  async function loadAnalytics() {
    if (!requireAdmin()) return;
    setLoading(true);
    setMessage("");
    setLastUpdated("Syncing...");
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const analytics = await adminJson(`/api/admin/analytics?${params.toString()}`, {}, "Unable to load analytics.");
      setData({
        ...analytics,
        certificationSummary: { total: 0, pendingProgress: 0 },
        healthReport: null,
      });
      setLastUpdated(`Updated ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`);
      Promise.all([
        adminJson("/api/admin/certifications?page=1", {}, "Unable to load certification summary.").catch(() => null),
        adminJson("/api/admin/system-health", {}, "Unable to load system health.").catch(() => null),
        adminJson("/api/admin/problem-reports?page=1&limit=1", {}, "Unable to load report counts.").catch(() => null),
      ]).then(([certificationSummary, healthReport, reportSummary]) => {
        setData((current) => current ? ({
          ...current,
          certificationSummary: {
            total: certificationSummary?.total || certificationSummary?.certificates?.length || 0,
            pendingProgress: certificationSummary?.progress?.filter?.((item) => !item.eligible)?.length || 0,
          },
          healthReport,
          reportSummary,
        }) : current);
      });
    } catch (error) {
      setData(null);
      setMessage(error.message || "Unable to load analytics.");
      setLastUpdated("Sync failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    document.title = "Admin Analytics | Skillomate";
    loadAnalytics();
  }, []);

  function handlePresetChange(value) {
    setRangePreset(value);
    if (value !== "custom") {
      const dates = datesForPreset(value);
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
    }
  }

  const totals = data?.totals || {};
  const learning = data?.learning || {};
  const breakdowns = data?.breakdowns || {};
  const watchRows = [
    { title: "Total watch time", meta: `${displayNumber(learning.activeLearnersInRange)} active learners`, value: hasNumber(learning.watchedMinutes) ? formatWatchDuration(learning.watchedMinutes) : "Not returned" },
    ...(learning.mostWatchedCourses?.[0] ? [{ title: textValue(learning.mostWatchedCourses[0].title), meta: `${displayNumber(learning.mostWatchedCourses[0].learnerCount)} learners - ${displayNumber(learning.mostWatchedCourses[0].videosWatched)} videos`, value: formatWatchDuration(learning.mostWatchedCourses[0].totalWatchMinutes) }] : []),
    ...(learning.topWatchedVideos?.[0] ? [{ title: textValue(learning.topWatchedVideos[0].videoTitle), meta: `${textValue(learning.topWatchedVideos[0].courseTitle)} - ${displayNumber(learning.topWatchedVideos[0].completedRecords)} completes`, value: formatWatchDuration(learning.topWatchedVideos[0].totalWatchMinutes) }] : []),
  ];
  const trialUsers = firstField(totals, ["trialUsers", "oneRupeeTrialUsers"]);
  const verifiedValues = [totals.mobileVerifiedUsers, totals.emailVerifiedUsers].filter(hasNumber).map(Number);
  const verifiedUsers = verifiedValues.length ? Math.max(...verifiedValues) : undefined;
  const userRows = [
    { title: "Total learners", meta: `${displayNumber(totals.newUsers)} new in selected range`, value: displayNumber(totals.users) },
    { title: "Active vs inactive", meta: `${displayNumber(totals.inactiveUsers)} inactive users`, value: displayNumber(totals.activeUsers) },
    { title: "Verified users", meta: `${displayNumber(totals.mobileVerifiedUsers)} mobile - ${displayNumber(totals.emailVerifiedUsers)} email`, value: displayNumber(verifiedUsers) },
    { title: "Paid / trial / none", meta: `${displayNumber(totals.noSubscriptionUsers)} no subscription`, value: `${displayNumber(totals.subscribedUsers)}/${displayNumber(trialUsers)}` },
    { title: "Gender split", meta: compactBreakdown(breakdowns.gender), value: `${displayNumber(sumCounts(breakdowns.gender))} users` },
    { title: "Age split", meta: compactBreakdown(breakdowns.age), value: `${displayNumber(sumCounts(breakdowns.age))} users` },
  ];
  const panelRows = [
    ["Recent Users", (data?.recentUsers || []).slice(0, 8).map((user) => ({ title: textValue(user.fullName, user.email, user.mobileNumber), meta: formatDate(user.createdAt), value: textValue(user.subscriptionStatus) })), "No recent users."],
    ["Recent Orders", (data?.recentOrders || []).slice(0, 8).map((order) => ({ title: textValue(order.user?.fullName, order.user?.email, orderTypeLabel(order.orderType)), meta: `${textValue(order.status)} · ${orderTypeLabel(order.orderType)}`, value: money(firstField(order, ["totalAmount", "amount", "amountInRupees"])) })), "No recent orders."],
    ["Top Courses", (data?.topCourses || data?.topSellingCourses || []).slice(0, 8).map((course) => ({ title: textValue(course.title, course.courseTitle), meta: `${displayNumber(firstField(course, ["learnerCount", "totalStarted", "startedCount"]))} learners`, value: `${displayNumber(firstField(course, ["completedCount", "totalCompleted"]))} done` })), "No course analytics yet."],
    ["Subscription Mix", Object.entries(breakdowns.userSubscriptionStatus || breakdowns.subscriptionStatus || {}).slice(0, 10).map(([label, count]) => ({ title: textValue(label), meta: "Subscription status", value: displayNumber(count) })), "No subscription data."],
    ["Course Mix", Object.entries(breakdowns.courseStatus || {}).slice(0, 10).map(([label, count]) => ({ title: textValue(label), meta: "Course status", value: displayNumber(count) })), "No course status data."],
    ["Recent Subscriptions", (data?.recentSubscriptions || []).slice(0, 8).map((subscription) => ({ title: textValue(subscription.user?.fullName, subscription.user?.email), meta: `${gatewayLabel(subscription.gateway)} · ${textValue(subscription.status, subscription.razorpayStatus, subscription.subscriptionType)} · ${subscriptionDateLine(subscription)}`, value: money(subscription.amount) })), "No recent subscriptions."],
  ];
  const actionInbox = [
    { title: `${displayNumber(totals.failedOrdersInRange)} failed payments`, meta: "Retry checkout follow-up or contact learners", tone: "bad", href: adminRoutes.payments },
    { title: `${displayNumber(totals.pendingOrdersInRange)} pending payments`, meta: "Reconcile pending payment state", tone: "warn", href: adminRoutes.orders },
    { title: `${displayNumber(totals.renewalPendingSubscriptions)} renewal pending`, meta: "Trial elapsed but monthly subscription is not reflected yet", tone: chartNumber(totals.renewalPendingSubscriptions) ? "warn" : "good", href: adminRoutes.subscriptions },
    { title: `${displayNumber(totals.cancelledMandates)} cancelled mandates`, meta: "Follow up before access or retention gets messy", tone: chartNumber(totals.cancelledMandates) ? "bad" : "good", href: adminRoutes.subscriptions },
    { title: `${displayNumber(totals.draftCourses)} draft courses`, meta: "Review content before publishing", tone: "warn", href: adminRoutes.courseReview },
    { title: `${displayNumber(data?.certificationSummary?.pendingProgress)} certificate blockers`, meta: "Completion criteria or learner eligibility pending", tone: "warn", href: adminRoutes.certifications },
    { title: data?.healthReport ? `${displayNumber(data.healthReport.summary?.attention)} system issues` : "Checking system issues", meta: data?.healthReport ? `${displayNumber(data.healthReport.summary?.unverified)} checks unverified` : "System health loads in the background", tone: data?.healthReport?.summary?.attention ? "bad" : "good", href: adminRoutes.health },
    { title: `${displayNumber(learning.activeLearnersInRange)} active learners`, meta: "Track low-progress cohorts", tone: "good", href: adminRoutes.progress },
  ];
  const ordersByStatus = [
    ["Paid", totals.paidOrdersInRange, "good"],
    ["Pending", totals.pendingOrdersInRange, "warn"],
    ["Failed", totals.failedOrdersInRange, "bad"],
  ];
  const commandCards = [
    { title: "Create course", meta: "Upload lessons, notes, pricing, and course details.", href: adminRoutes.upload, cta: "Start upload" },
    { title: "Review reports", meta: data?.reportSummary ? `${displayNumber((data.reportSummary.counts?.new ?? 0) + (data.reportSummary.counts?.in_progress ?? 0))} open learner issues` : "Report count unavailable", href: adminRoutes.reports, cta: "Open reports" },
    { title: "Payment audit", meta: "Check orders, subscriptions, failed retries, and webhook gaps.", href: adminRoutes.paymentAuditor, cta: "Audit payments" },
    { title: "Gateway settings", meta: "Switch test/live checkout and Meta Pixel tracking safely.", href: adminRoutes.settings, cta: "Manage settings" },
  ];

  return (
    <AdminShell
      activePage="dashboard"
      shellClass="dashboard-shell"
      title="Dashboard"
      subtitle="Your daily command center for revenue, learners, reports, payments, content, and system health."
      actions={<button className="toolbar-button" type="button" onClick={loadAnalytics} disabled={loading}>Refresh</button>}
    >
      <Message text={message} type="error" />

      <section className="admin-command-strip" aria-label="Admin quick actions">
        {commandCards.filter(item => canWrite || item.href !== adminRoutes.upload).map((item) => (
          <a className="admin-command-card" href={item.href} key={item.title}>
            <span>{item.title}</span>
            <strong>{item.meta}</strong>
            <small>{item.cta} →</small>
          </a>
        ))}
      </section>

      <form className="date-controls analytics-controls admin-range-card" onSubmit={(event) => { event.preventDefault(); loadAnalytics(); }}>
        <div className="range-summary">
          <strong>Applied range</strong>
          <span>{formatDate(startDate)} - {formatDate(endDate)}</span>
          <small>{lastUpdated}</small>
        </div>
        <div className="range-preset-buttons" role="group" aria-label="Quick date presets">
          {["7", "15", "30", "45", "90"].map((days) => <button className={rangePreset === days ? "is-active" : ""} type="button" key={days} onClick={() => handlePresetChange(days)}>{days}D</button>)}
          <button className={rangePreset === "custom" ? "is-active" : ""} type="button" onClick={() => setRangePreset("custom")}>Custom</button>
        </div>
        <div>
          <label htmlFor="startDate">Start</label>
          <input id="startDate" type="date" value={startDate} onChange={(event) => { setRangePreset("custom"); setStartDate(event.target.value); }} />
        </div>
        <div>
          <label htmlFor="endDate">End</label>
          <input id="endDate" type="date" value={endDate} onChange={(event) => { setRangePreset("custom"); setEndDate(event.target.value); }} />
        </div>
        <button className="toolbar-button" type="submit" disabled={loading}>{loading ? "Applying..." : "Apply"}</button>
      </form>

      <h2 className="admin-section-heading">Business at a glance</h2>
      {loading && !data ? <DashboardMetricsLoading /> : null}
      {data ? <DashboardMetrics data={data} /> : null}

      <section className="admin-command-grid">
        <article className="dashboard-panel trend-panel" aria-label="Revenue trend">
          <div className="panel-head"><div><h2 className="panel-title">Daily revenue trend</h2><p>Revenue, new learners, and watch minutes for the selected range.</p></div></div>
          {loading && !data ? <div className="loading-state">Loading chart...</div> : <TrendChart rows={data?.dailySeries} />}
        </article>
        <article className="dashboard-panel action-inbox" aria-label="Action inbox">
          <div className="panel-head"><div><h2 className="panel-title">Action Inbox</h2><p>Operational alerts that need daily review.</p></div><a href={adminRoutes.health}>View all</a></div>
          <div className="action-list">
            {actionInbox.map((item) => <a className={`action-item ${item.tone}`} href={item.href} key={item.title}><strong>{item.title}</strong><span>{item.meta}</span></a>)}
          </div>
        </article>
      </section>

      <section className="admin-chart-grid" aria-label="Operations charts">
        <article className="dashboard-panel"><h2 className="panel-title">New learners trend</h2><MiniBars rows={data?.dailySeries || []} field="users" /></article>
        <article className="dashboard-panel"><h2 className="panel-title">Watch time trend</h2><MiniBars rows={data?.dailySeries || []} field="watchMinutes" /></article>
        <article className="dashboard-panel"><h2 className="panel-title">Course completion trend</h2><MiniBars rows={data?.dailySeries || []} field="completedProgress" /></article>
        <article className="dashboard-panel"><h2 className="panel-title">Orders by status</h2><div className="status-breakdown">{ordersByStatus.map(([label, count, tone]) => <div key={label}><span>{label}</span><b>{displayNumber(count)}</b><Badge tone={tone}>{tone === "good" ? "OK" : tone === "bad" ? "Risk" : "Watch"}</Badge></div>)}</div></article>
      </section>

      <h2 className="admin-section-heading">Learners, content and subscriptions</h2>
      <section className="admin-panels">
        <article className="dashboard-panel"><h2 className="panel-title">Watch Time Brief</h2><div className="data-list"><DataList rows={data ? watchRows : []} emptyText="No watch-time data." /></div></article>
        <article className="dashboard-panel"><h2 className="panel-title">User Details Brief</h2><div className="data-list"><DataList rows={data ? userRows : []} emptyText="No user details available." /></div></article>
        {panelRows.map(([title, rows, empty]) => (
          <article className="dashboard-panel" key={title}>
            <h2 className="panel-title">{title}</h2>
            <div className="data-list"><DataList rows={data ? rows : []} emptyText={empty} /></div>
          </article>
        ))}
      </section>
    </AdminShell>
  );
}
