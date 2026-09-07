import { useEffect, useMemo, useState } from "react";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, formatDate, formatNumber, formatWatchDuration, requireAdmin } from "./adminApi.js";

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
  return hasNumber(value) ? `₹${formatNumber(value)}` : "Not returned";
}

function textValue(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "Not returned";
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
  return rows.map((row) => <DataRow key={`${row.title}-${row.meta}-${row.value}`} {...row} />);
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
    { label: "Total Users", value: displayNumber(totals.users), meta: `${displayNumber(totals.newUsers)} new in range` },
    { label: "Active Users", value: displayNumber(totals.activeUsers), meta: `${displayNumber(totals.mobileVerifiedUsers)} mobile verified` },
    { label: "Subscribers", value: displayNumber(activeSubscriptionCount), meta: `${displayNumber(trialUserCount)} trials` },
    { label: "Revenue", value: money(totals.revenueInRange), meta: `${money(totals.totalRevenue)} all time` },
    { label: "Orders", value: displayNumber(totals.paidOrdersInRange), meta: `${displayNumber(totals.failedOrdersInRange)} failed, ${displayNumber(totals.pendingOrdersInRange)} pending` },
    { label: "Courses", value: displayNumber(totals.courses), meta: `${displayNumber(totals.publishedCourses)} published` },
    { label: "Watch Time", value: hasNumber(learning.watchedMinutes) ? formatWatchDuration(learning.watchedMinutes) : "Not returned", meta: `${displayNumber(learning.activeLearnersInRange)} active learners` },
    { label: "Completion", value: hasNumber(learning.completionShare) ? `${displayNumber(learning.completionShare)}%` : "Not returned", meta: `${displayNumber(learning.completedProgress)} completed records` },
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

export function AdminDashboardPage() {
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
      setData(analytics);
      setLastUpdated(`Updated ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`);
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
    ["Recent Orders", (data?.recentOrders || []).slice(0, 8).map((order) => ({ title: textValue(order.user?.fullName, order.user?.email, order.orderType), meta: textValue(order.status), value: money(firstField(order, ["totalAmount", "amount", "amountInRupees"])) })), "No recent orders."],
    ["Top Courses", (data?.topCourses || data?.topSellingCourses || []).slice(0, 8).map((course) => ({ title: textValue(course.title, course.courseTitle), meta: `${displayNumber(firstField(course, ["learnerCount", "totalStarted", "startedCount"]))} learners`, value: `${displayNumber(firstField(course, ["completedCount", "totalCompleted"]))} done` })), "No course analytics yet."],
    ["Subscription Mix", Object.entries(breakdowns.userSubscriptionStatus || breakdowns.subscriptionStatus || {}).slice(0, 10).map(([label, count]) => ({ title: textValue(label), meta: "Subscription status", value: displayNumber(count) })), "No subscription data."],
    ["Course Mix", Object.entries(breakdowns.courseStatus || {}).slice(0, 10).map(([label, count]) => ({ title: textValue(label), meta: "Course status", value: displayNumber(count) })), "No course status data."],
    ["Recent Subscriptions", (data?.recentSubscriptions || []).slice(0, 8).map((subscription) => ({ title: textValue(subscription.user?.fullName, subscription.user?.email), meta: textValue(subscription.status, subscription.subscriptionType), value: money(subscription.amount) })), "No recent subscriptions."],
  ];

  return (
    <AdminShell
      activePage="dashboard"
      shellClass="dashboard-shell"
      title="Analytics"
      subtitle="Platform revenue, learners, subscriptions, and course engagement."
      actions={<button className="toolbar-button" type="button" onClick={loadAnalytics} disabled={loading}>Refresh</button>}
    >
      <Message text={message} type="error" />
      <form className="date-controls analytics-controls" onSubmit={(event) => { event.preventDefault(); loadAnalytics(); }}>
        <div>
          <label htmlFor="rangePreset">Range</label>
          <select id="rangePreset" value={rangePreset} onChange={(event) => handlePresetChange(event.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="15">Last 15 days</option>
            <option value="30">Last 30 days</option>
            <option value="45">Last 45 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom dates</option>
          </select>
        </div>
        <div>
          <label htmlFor="startDate">Start</label>
          <input id="startDate" type="date" value={startDate} onChange={(event) => { setRangePreset("custom"); setStartDate(event.target.value); }} />
        </div>
        <div>
          <label htmlFor="endDate">End</label>
          <input id="endDate" type="date" value={endDate} onChange={(event) => { setRangePreset("custom"); setEndDate(event.target.value); }} />
        </div>
        <button className="toolbar-button" type="submit" disabled={loading}>Apply</button>
        <span className="sync-status">{lastUpdated}</span>
      </form>

      {loading && !data ? <DashboardMetricsLoading /> : null}
      {data ? <DashboardMetrics data={data} /> : null}

      <section className="dashboard-panel trend-panel" aria-label="Daily trend">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Daily Trend</h2>
            <p>Revenue, new learners, and watched minutes for the selected range.</p>
          </div>
        </div>
        {loading && !data ? <div className="loading-state">Loading chart...</div> : <TrendChart rows={data?.dailySeries} />}
      </section>

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
