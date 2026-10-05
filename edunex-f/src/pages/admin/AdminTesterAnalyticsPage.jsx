import { useEffect, useMemo, useState } from "react";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, formatDate, formatDateTime, formatNumber, formatWatchDuration, requireAdmin } from "./adminApi.js";

function testerName(user) {
  return user?.fullName || user?.mobileNumber || user?.email || "Tester";
}

function formatMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 10 ? digits : "";
  return local ? `+91 ${local.slice(0, 5)}-${local.slice(5)}` : (value || "No mobile");
}

function StatCard({ label, value, hint }) {
  return <div className="summary-card"><strong>{label}</strong><span>{value}</span>{hint ? <small>{hint}</small> : null}</div>;
}

function SimpleTable({ columns, rows, empty, columnsTemplate = "repeat(4, minmax(0, 1fr))" }) {
  return <div className="tester-analytics-table-scroll">
    <table className="tester-analytics-table-v2" style={{ "--tester-table-columns": columnsTemplate }}>
      <thead>
        <tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length ? rows.map((row) => <tr key={row.id}>{row.cells.map((cell, index) => <td data-label={columns[index]} key={`${row.id}-${index}`}>{cell}</td>)}</tr>) : <tr><td className="tester-analytics-empty" colSpan={columns.length}>{empty}</td></tr>}
      </tbody>
    </table>
  </div>;
}

export function AdminTesterAnalyticsPage() {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [range, setRange] = useState("30");

  async function load() {
    if (!requireAdmin()) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const endDate = new Date();
      const startDate = new Date(Date.now() - (Number(range) - 1) * 86400000);
      const params = new URLSearchParams({
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
      });
      const data = await adminJson(`/api/admin/tester-analytics?${params}`, {}, "Unable to load tester analytics.");
      setState({ loading: false, error: "", data });
    } catch (error) {
      setState({ loading: false, error: error.message || "Unable to load tester analytics.", data: null });
    }
  }

  useEffect(() => {
    document.title = "Tester Analytics | Skillomate";
    load();
  }, [range]);

  const totals = state.data?.totals || {};
  const testerRows = useMemo(() => (state.data?.testers || []).map((user) => ({
    id: user._id,
    cells: [
      <><strong>{testerName(user)}</strong><span>{formatMobile(user.mobileNumber)}</span></>,
      user.isActive === false ? "Banned" : user.subscriptionStatus || "none",
      formatDate(user.testerSince),
      formatDate(user.lastActiveAt),
      formatWatchDuration(user.watchSummary?.watchedMinutes),
      formatNumber(user.aiSummary?.messages),
    ],
  })), [state.data]);
  const courseRows = useMemo(() => (state.data?.courses || []).map((course) => ({
    id: `${course.courseId || course.title}-${course.lastEventAt || ""}`,
    cells: [
      course.title || "Unknown course",
      formatNumber(course.testerCount),
      formatNumber(course.events),
      formatWatchDuration(course.watchMinutes),
      formatDate(course.lastEventAt),
    ],
  })), [state.data]);
  const eventRows = useMemo(() => (state.data?.recentEvents || []).map((event) => ({
    id: event._id,
    cells: [
      String(event.event || "event").replaceAll("_", " "),
      event.userName || event.userEmail || event.userId || "Tester",
      event.courseTitle || event.videoTitle || "No course",
      formatDateTime(event.createdAt || event.date),
    ],
  })), [state.data]);
  const actionRows = useMemo(() => (state.data?.recentActions || []).map((action) => ({
    id: action._id,
    cells: [
      String(action.action || "").replaceAll("_", " "),
      testerName(action.user),
      action.reason || "No reason",
      action.adminSubject || "admin",
      formatDateTime(action.createdAt),
    ],
  })), [state.data]);

  return <AdminShell
    activePage="testerAnalytics"
    title="Tester Analytics"
    subtitle="A separate analytics view for accounts marked as testers, isolated from the main learner analytics dashboard."
    actions={<div className="toolbar-actions"><select className="toolbar-button" value={range} onChange={(event) => setRange(event.target.value)} aria-label="Tester analytics range"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><button className="toolbar-button" type="button" onClick={load} disabled={state.loading}>Refresh</button></div>}
  >
    <Message text={state.error} type="error" />
    {state.loading ? <div className="loading-state">Loading tester analytics...</div> : null}
    {!state.loading && state.data ? <div className="tester-analytics-shell">
      <section className="summary-grid">
        <StatCard label="Testers" value={formatNumber(totals.testers)} hint="Marked tester accounts" />
        <StatCard label="Active today" value={formatNumber(totals.activeToday)} hint="By last activity" />
        <StatCard label="Active 7 days" value={formatNumber(totals.active7Days)} hint="Recent tester activity" />
        <StatCard label="Active 30 days" value={formatNumber(totals.active30Days)} hint="Recent tester activity" />
        <StatCard label="Watch time" value={formatWatchDuration(totals.watchMinutes)} hint="Selected range" />
        <StatCard label="AI messages" value={formatNumber(totals.aiMessages)} hint="Selected range" />
      </section>
      <section className="panel tester-analytics-panel">
        <div className="crm-results-bar"><div><strong>Tester roster</strong><span>{formatNumber(testerRows.length)} tester accounts</span></div></div>
        <SimpleTable columns={["Tester", "Status", "Tester since", "Last active", "Watch time", "AI messages"]} rows={testerRows} empty="No testers have been assigned yet." columnsTemplate="minmax(220px, 1.3fr) minmax(120px, .65fr) minmax(130px, .72fr) minmax(130px, .72fr) minmax(115px, .6fr) minmax(120px, .6fr)" />
      </section>
      <section className="panel tester-analytics-panel">
        <div className="crm-results-bar"><div><strong>Course activity by testers</strong><span>Selected range only</span></div></div>
        <SimpleTable columns={["Course", "Testers", "Events", "Watch time", "Last event"]} rows={courseRows} empty="No tester course activity found in this range." columnsTemplate="minmax(260px, 1.5fr) minmax(105px, .5fr) minmax(105px, .5fr) minmax(130px, .65fr) minmax(150px, .75fr)" />
      </section>
      <section className="panel tester-analytics-panel">
        <div className="crm-results-bar"><div><strong>Recent tester events</strong><span>Raw tester analytics feed</span></div></div>
        <SimpleTable columns={["Event", "Tester", "Context", "Recorded"]} rows={eventRows} empty="No tester events found in this range." columnsTemplate="minmax(150px, .75fr) minmax(240px, 1.2fr) minmax(260px, 1.35fr) minmax(170px, .8fr)" />
      </section>
      <section className="panel tester-analytics-panel">
        <div className="crm-results-bar"><div><strong>Tester assignment audit</strong><span>Latest enable/disable actions</span></div></div>
        <SimpleTable columns={["Action", "Tester", "Reason", "Admin", "When"]} rows={actionRows} empty="No tester assignment actions recorded." columnsTemplate="minmax(150px, .75fr) minmax(220px, 1.1fr) minmax(260px, 1.3fr) minmax(150px, .7fr) minmax(170px, .8fr)" />
      </section>
    </div> : null}
  </AdminShell>;
}
