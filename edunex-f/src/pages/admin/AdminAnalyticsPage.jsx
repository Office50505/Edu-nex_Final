import { useEffect, useMemo, useState } from "react";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, formatDate, formatNumber, formatWatchDuration, requireAdmin } from "./adminApi.js";
import { AdminDateRangeFilter } from "./AdminDateRangeFilter.jsx";

function hasNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function displayNumber(value) {
  return hasNumber(value) ? formatNumber(value) : "Not returned";
}

function textValue(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "Not returned";
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

function money(value) {
  return hasNumber(value)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0) / 100)
    : "Not returned";
}

function StatCard({ label, value, meta }) {
  return (
    <div className="metric-card">
      <span>{value}</span>
      <strong>{label}</strong>
      <small>{meta}</small>
    </div>
  );
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

function clarityRows(items, suffix = "sessions") {
  return (Array.isArray(items) ? items : []).slice(0, 10).map((item) => ({
    title: textValue(item.label),
    meta: `${displayNumber(item.users)} users`,
    value: `${displayNumber(item.value || item.sessions)} ${suffix}`,
  }));
}

function AnalyticsPanel({ title, rows, emptyText }) {
  return (
    <article className="dashboard-panel">
      <h2 className="panel-title">{title}</h2>
      <div className="data-list">
        <DataList rows={rows} emptyText={emptyText} />
      </div>
    </article>
  );
}

export function AdminAnalyticsPage() {
  const presetDates = useMemo(() => datesForPreset(30), []);
  const [rangePreset, setRangePreset] = useState("30");
  const [startDate, setStartDate] = useState(presetDates.startDate);
  const [endDate, setEndDate] = useState(presetDates.endDate);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState("Waiting for data");

  async function loadAnalytics(rangeOverride = null) {
    if (!requireAdmin()) return;
    setLoading(true);
    setMessage("");
    setLastUpdated("Syncing...");
    try {
      const params = new URLSearchParams();
      const activeStart = rangeOverride?.startDate || startDate;
      const activeEnd = rangeOverride?.endDate || endDate;
      if (activeStart) params.set("startDate", activeStart);
      if (activeEnd) params.set("endDate", activeEnd);
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
    document.title = "Analytics | Skillomate Admin";
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

  function handleDateRangeChange(next) {
    setRangePreset(next.preset || "custom");
    setStartDate(next.startDate || "");
    setEndDate(next.endDate || "");
  }

  const clarity = data?.clarity || {};
  const clarityTotals = clarity.totals || {};
  const learning = data?.learning || {};
  const totals = data?.totals || {};
  const clarityConfigured = Boolean(clarity.configured);
  const clarityUnavailable = clarity.reason || clarity.error || "Add CLARITY_API_TOKEN in the backend environment.";
  const noProblemClicks = "No rage, dead, or error-click pages returned for this Clarity range.";
  const problemClickRows = [
    ...clarityRows(clarity.rageClickPages, "rage clicks"),
    ...clarityRows(clarity.deadClickPages, "dead clicks"),
  ];
  const googleAnalyticsReady = false;

  return (
    <AdminShell
      activePage="analytics"
      shellClass="dashboard-shell"
      title="Analytics"
      subtitle="Traffic, behavior, and product analytics from Skillomate events, Clarity, and Google Analytics."
      actions={<button className="toolbar-button" type="button" onClick={loadAnalytics} disabled={loading}>Refresh</button>}
    >
      <Message text={message} type="error" />

      <form className="date-controls analytics-controls admin-range-card" onSubmit={(event) => { event.preventDefault(); loadAnalytics(); }}>
        <div className="range-summary">
          <strong>Applied range</strong>
          <span>{formatDate(startDate)} - {formatDate(endDate)}</span>
          <small>{lastUpdated}</small>
        </div>
        <AdminDateRangeFilter
          value={{ preset: rangePreset, startDate, endDate }}
          onChange={handleDateRangeChange}
          onApply={(next) => { handleDateRangeChange(next); loadAnalytics(next); }}
          loading={loading}
          label="Analytics range"
        />
        <button className="toolbar-button" type="submit" disabled={loading}>{loading ? "Applying..." : "Apply"}</button>
      </form>

      <h2 className="admin-section-heading">Skillomate Analytics</h2>
      <section className="analytics-grid" aria-label="Skillomate analytics summary">
        <StatCard label="Learners" value={displayNumber(totals.users)} meta={`${displayNumber(totals.newUsers)} new in range`} />
        <StatCard label="Active learners" value={displayNumber(totals.activeUsers)} meta={`${displayNumber(totals.mobileVerifiedUsers)} mobile verified`} />
        <StatCard label="Revenue" value={money(totals.revenueInRange)} meta={`${money(totals.totalRevenue)} lifetime`} />
        <StatCard label="Orders" value={displayNumber(totals.paidOrdersInRange)} meta={`${displayNumber(totals.failedOrdersInRange)} failed`} />
        <StatCard label="Watch time" value={hasNumber(learning.watchedMinutes) ? formatWatchDuration(learning.watchedMinutes) : "Not returned"} meta={`${displayNumber(learning.activeLearnersInRange)} active learners`} />
        <StatCard label="Completion" value={hasNumber(learning.completionShare) ? `${displayNumber(learning.completionShare)}%` : "Not returned"} meta={`${displayNumber(learning.completedProgress)} completed records`} />
      </section>

      <h2 className="admin-section-heading">Microsoft Clarity</h2>
      <section className="analytics-grid" aria-label="Clarity summary">
        <StatCard label="Sessions" value={displayNumber(clarityTotals.sessions)} meta={clarityConfigured ? `Last ${displayNumber(clarity.numOfDays)} days` : clarityUnavailable} />
        <StatCard label="Users" value={displayNumber(clarityTotals.users)} meta={clarityConfigured ? "Distinct Clarity users" : clarityUnavailable} />
        <StatCard label="Rage clicks" value={displayNumber(clarityTotals.rageClicks)} meta={`${displayNumber(clarityTotals.deadClicks)} dead clicks`} />
        <StatCard label="Error clicks" value={displayNumber(clarityTotals.errorClicks)} meta={`${displayNumber(clarityTotals.scriptErrors)} script errors`} />
      </section>
      <section className="admin-panels">
        <AnalyticsPanel title="Clarity Top Pages" rows={clarityConfigured ? clarityRows(clarity.topPages) : []} emptyText={clarityConfigured ? "No page traffic returned for this Clarity range." : clarityUnavailable} />
        <AnalyticsPanel title="Clarity Problem Clicks" rows={clarityConfigured ? problemClickRows : []} emptyText={clarityConfigured ? noProblemClicks : clarityUnavailable} />
        <AnalyticsPanel title="Clarity Devices" rows={clarityConfigured ? clarityRows(clarity.devices) : []} emptyText={clarityConfigured ? "No device data returned for this Clarity range." : clarityUnavailable} />
        <AnalyticsPanel title="Clarity Countries" rows={clarityConfigured ? clarityRows(clarity.countries) : []} emptyText={clarityConfigured ? "No country data returned for this Clarity range." : clarityUnavailable} />
        <AnalyticsPanel title="Clarity Sources" rows={clarityConfigured ? clarityRows(clarity.sources) : []} emptyText={clarityConfigured ? "No source data returned for this Clarity range." : clarityUnavailable} />
      </section>

      <h2 className="admin-section-heading">Google Analytics</h2>
      <section className="admin-panels">
        <article className="dashboard-panel">
          <h2 className="panel-title">GA4 Connection</h2>
          <div className="empty-state compact-empty">
            {googleAnalyticsReady ? "Google Analytics data is ready." : "Google Analytics is not connected yet. Add GA4 property credentials on the backend to enable this section."}
          </div>
        </article>
      </section>
    </AdminShell>
  );
}
