import { useEffect, useState } from "react";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, formatDateTime, requireAdmin } from "./adminApi.js";

const STATUS_OPTIONS = [
  ["new", "New"],
  ["in_progress", "In progress"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
];

const CATEGORY_OPTIONS = [
  ["technical", "Technical"],
  ["video", "Video or lesson"],
  ["payment", "Payment or subscription"],
  ["ai", "AI tutor"],
  ["account", "Account or login"],
  ["other", "Other"],
];

function labelFor(options, value) {
  return options.find(([key]) => key === value)?.[1] || value || "Unknown";
}

function safePageLink(value) {
  try {
    const url = new URL(String(value || ""));
    return url.origin === window.location.origin ? url.href : "";
  } catch (_) {
    return "";
  }
}

export function AdminReportsPage() {
  const [reports, setReports] = useState([]);
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!requireAdmin()) return undefined;
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    setBusy(true);
    setMessage("");
    adminJson(`/api/admin/problem-reports?${params.toString()}`, { signal: controller.signal }, "Unable to load reports.")
      .then((data) => {
        setReports(Array.isArray(data.reports) ? data.reports : []);
        setCounts(data.counts || {});
        setPages(Number(data.pages) || 1);
        setTotal(Number(data.total) || 0);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setMessage(error.message);
          setMessageType("error");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [category, page, refreshKey, status]);

  function changeReport(reportId, field, value) {
    setReports((current) => current.map((report) => report._id === reportId ? { ...report, [field]: value } : report));
  }

  async function saveReport(report) {
    setSavingId(report._id);
    setMessage("");
    try {
      const data = await adminJson(`/api/admin/problem-reports/${encodeURIComponent(report._id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: report.status, adminNote: report.adminNote || "" }),
      }, "Unable to update report.");
      setReports((current) => current.map((item) => item._id === report._id ? data.report : item));
      setMessage(`${data.report.reference} updated.`);
      setMessageType("success");
    } catch (error) {
      setMessage(error.message);
      setMessageType("error");
    } finally {
      setSavingId("");
    }
  }

  function applyStatus(nextStatus) {
    setStatus(nextStatus);
    setPage(1);
  }

  return (
    <AdminShell
      activePage="reports"
      title="User reports"
      subtitle="Review problems reported from any Skillomate learner page and track them through resolution."
      actions={<button className="toolbar-button" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={busy}>{busy ? "Loading…" : "Refresh"}</button>}
    >
      <section className="report-summary" aria-label="Report status summary">
        {STATUS_OPTIONS.map(([value, label]) => (
          <button type="button" key={value} className={status === value ? "is-active" : ""} onClick={() => applyStatus(status === value ? "" : value)}>
            <strong>{Number(counts[value] || 0).toLocaleString("en-IN")}</strong>
            <span>{label}</span>
          </button>
        ))}
      </section>

      <section className="report-filter-panel">
        <div>
          <label htmlFor="report-status-filter">Status</label>
          <select id="report-status-filter" value={status} onChange={(event) => applyStatus(event.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="report-category-filter">Category</label>
          <select id="report-category-filter" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </div>
        <p>{total.toLocaleString("en-IN")} matching {total === 1 ? "report" : "reports"}</p>
      </section>

      <Message text={message} type={messageType} />

      <section className="report-list" aria-live="polite" aria-busy={busy}>
        {!busy && !reports.length ? <div className="report-empty"><h2>No reports found</h2><p>New learner reports will appear here.</p></div> : null}
        {reports.map((report) => {
          const pageLink = safePageLink(report.pageUrl);
          return (
            <article className="report-card" key={report._id}>
              <header>
                <div>
                  <div className="report-card-badges">
                    <span className={`report-status report-status-${report.status}`}>{labelFor(STATUS_OPTIONS, report.status)}</span>
                    <span>{labelFor(CATEGORY_OPTIONS, report.category)}</span>
                  </div>
                  <h2>{report.reference}</h2>
                  <p>{formatDateTime(report.createdAt)}</p>
                </div>
                <div className="report-reporter">
                  <strong>{report.reporterName || "Anonymous learner"}</strong>
                  <span>{report.reporterEmail || "No account email"}</span>
                </div>
              </header>

              <p className="report-message">{report.message}</p>

              <dl className="report-context">
                <div><dt>Page</dt><dd>{pageLink ? <a href={pageLink} target="_blank" rel="noreferrer">{report.route || pageLink} ↗</a> : report.route || "Unknown"}</dd></div>
                <div><dt>Device</dt><dd>{labelFor([["mobile", "Mobile"], ["tablet", "Tablet"], ["desktop", "Desktop"]], report.deviceType)} · {report.viewport?.width || 0} × {report.viewport?.height || 0}</dd></div>
                <div><dt>Course / lesson</dt><dd>{report.courseId || "—"} / {report.lessonId || "—"}</dd></div>
                <div><dt>Theme</dt><dd>{report.theme || "Unknown"}</dd></div>
              </dl>

              <div className="report-resolution">
                <label>
                  <span>Status</span>
                  <select value={report.status} onChange={(event) => changeReport(report._id, "status", event.target.value)} disabled={savingId === report._id}>
                    {STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Private admin note</span>
                  <textarea value={report.adminNote || ""} onChange={(event) => changeReport(report._id, "adminNote", event.target.value.slice(0, 2000))} maxLength="2000" rows="3" placeholder="Add investigation notes or resolution details…" disabled={savingId === report._id} />
                </label>
                <button className="toolbar-button" type="button" onClick={() => saveReport(report)} disabled={savingId === report._id}>{savingId === report._id ? "Saving…" : "Save update"}</button>
              </div>
            </article>
          );
        })}
      </section>

      {pages > 1 ? <nav className="report-pagination" aria-label="Report pages">
        <button className="toolbar-button" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || busy}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button className="toolbar-button" type="button" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page >= pages || busy}>Next</button>
      </nav> : null}
    </AdminShell>
  );
}
