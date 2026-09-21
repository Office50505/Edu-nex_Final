import { useEffect, useMemo, useState } from "react";
import { page as certificatesPage } from "../generated-pages/certificates.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";
import { apiUrl } from "../lib/apiUrl.js";

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function certificateVerifyUrl(certificate) {
  return apiUrl(`/api/certificates/verify/${encodeURIComponent(certificate.certificateId)}`);
}

function downloadCertificate(certificate) {
  window.open(`${certificateVerifyUrl(certificate)}?print=1`, '_blank', 'noopener');
}

export function CertificatesPage() {
  const [certificates, setCertificates] = useState([]);
  const [inProgress, setInProgress] = useState([]);
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("Loading certificates...");
  const [showRetry, setShowRetry] = useState(false);
  const runtimeReady = useEduNexRuntimeReady();

  usePageStyle("react-page-style-certificates", certificatesPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...certificatesPage,
    scripts: certificatesPage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    document.title = certificatesPage.title;
    document.documentElement.lang = certificatesPage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  const loadCertificates = async () => {
    if (!window.EduNex?.getAccessToken?.()) {
      setCertificates([]);
      setInProgress([]);
      setMessage("Log in to view your earned certificates.");
      setShowRetry(false);
      return;
    }
    setMessage("Loading certificates...");
    setShowRetry(false);
    try {
      const data = await window.EduNex.authRequest("/api/certificates");
      setCertificates(Array.isArray(data?.certificates) ? data.certificates : []);
      setInProgress(data.inProgress || []);
      setMessage("");
    } catch (error) {
      console.error("[certificates] Failed to load certificates", error);
      setCertificates([]);
      setInProgress([]);
      setMessage("We couldn't load your certificates right now. Please try again in a moment.");
      setShowRetry(true);
    }
  };

  useEffect(() => {
    if (runtimeReady) loadCertificates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeReady]);

  const visibleRows = filter === "in-progress"
    ? []
    : certificates.filter((certificate) => filter === "all" || certificate.status === "active");
  const emptyMessage = filter === "in-progress"
    ? "Certificates appear here after verified course completion."
    : "No certificates found in this category.";

  const shareCertificate = async (certificate) => {
    const url = certificateVerifyUrl(certificate);
    if (navigator.share) {
      await navigator.share({
        title: "Skillomate AI Certificate",
        text: `${certificate.learnerName || "Skillomate Learner"} completed ${certificate.courseTitle || "a course"} on Skillomate AI.`,
        url,
      });
      return;
    }
    await navigator.clipboard.writeText(url);
    alert("Certificate verification link copied.");
  };

  return (
    <div className="react-page-root" data-page="certificates.html">
      <div className="page">
        <div className="back-row">
          <button className="back-btn" type="button" onClick={() => history.back()} aria-label="Go back">
            <i className="fas fa-arrow-left" aria-hidden="true"></i>
          </button>
          <h1 className="back-title">My Certificates</h1>
        </div>

        <div className="cert-stats">
          <div className="cert-stat">
            <div className="cert-stat-label"><i className="fas fa-certificate" aria-hidden="true"></i> Earned</div>
            <div className="cert-stat-value" id="earnedCount">{certificates.length}</div>
          </div>
          <div className="cert-stat">
            <div className="cert-stat-label"><i className="fas fa-spinner" aria-hidden="true"></i> In Progress</div>
            <div className="cert-stat-value" id="inProgressCount">{inProgress.length}</div>
          </div>
          <div className="cert-stat">
            <div className="cert-stat-label"><i className="fas fa-star" aria-hidden="true"></i> Avg Score</div>
            <div className="cert-stat-value" id="avgScore">--</div>
          </div>
        </div>

        <div className="cert-tabs" role="tablist" aria-label="Certificate filters">
          {[
            ["all", "All"],
            ["earned", "Earned"],
            ["in-progress", "In Progress"],
          ].map(([value, label]) => (
            <button className={`cert-tab${filter === value ? " active" : ""}`} type="button" key={value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>

        <div className="cert-grid" id="certGrid">
          {message ? (
            <div className="cert-empty" style={{ display: "block", gridColumn: "1/-1", padding: "36px 20px" }}>
              <i className="fas fa-certificate" aria-hidden="true"></i>
              <p>{message}</p>
              {showRetry ? <button className="cert-action-btn primary" type="button" onClick={loadCertificates} style={{ maxWidth: 140, margin: "16px auto 0" }}>Retry</button> : null}
            </div>
          ) : null}
          {!message && filter === 'in-progress' ? inProgress.map(item => <article className="cert-card" key={item.courseId} style={{padding:20}}><h3>{item.courseTitle}</h3><p>{item.completedLessons}/{item.totalLessons} lessons completed</p><ul>{item.requirements.map(text=><li key={text}>{text}</li>)}</ul><a href={`/videos?courseId=${encodeURIComponent(item.courseId)}`}>Continue course / assessment</a></article>) : null}
          {!message ? visibleRows.map((certificate) => {
            const title = certificate.courseTitle || "Completed Course";
            const learner = certificate.learnerName || "Skillomate Learner";
            const lessons = Number(certificate.totalLessons || certificate.completedLessons || 0);
            return (
              <article className="cert-card" data-status="earned" data-certificate-id={certificate.certificateId} key={certificate.certificateId}>
                <div className="cert-visual">
                  <div className="cert-visual-ribbon">{certificate.status === "revoked" ? "Revoked" : "Completion"}</div>
                  <div className="cert-visual-seal"><i className="fas fa-certificate" aria-hidden="true"></i></div>
                  <div className="cert-visual-org">Skillomate AI</div>
                  <div className="cert-visual-title">{title}</div>
                  <div className="cert-visual-name">{learner}</div>
                </div>
                <div className="cert-body">
                  <h3 className="cert-course-name">{title}</h3>
                  <div className="cert-meta">
                    <span>Issued {formatDate(certificate.issuedAt)}</span>
                    <span className="dot">●</span>
                    <span>{lessons ? `${lessons} lessons` : "Verified completion"}</span>
                  </div>
                  <div className="cert-meta">ID: {certificate.certificateId}</div>
                  <div className="cert-actions">
                    <button className="cert-action-btn primary" type="button" data-cert-action="download" data-certificate-id={certificate.certificateId} onClick={() => downloadCertificate(certificate)}>
                      <i className="fas fa-download" aria-hidden="true"></i> Print / PDF
                    </button>
                    <button className="cert-action-btn" type="button" data-cert-action="share" data-certificate-id={certificate.certificateId} onClick={() => shareCertificate(certificate).catch(() => {})}>
                      <i className="fas fa-share" aria-hidden="true"></i> Share
                    </button>
                    <button className="cert-action-btn" type="button" data-cert-action="verify" data-certificate-id={certificate.certificateId} onClick={() => window.open(certificateVerifyUrl(certificate), "_blank", "noopener")}>
                      <i className="fas fa-shield-halved" aria-hidden="true"></i> Verify
                    </button>
                  </div>
                </div>
              </article>
            );
          }) : null}
        </div>

        <div className="cert-empty" id="certEmpty" style={{ display: !message && !visibleRows.length && !(filter === "in-progress" && inProgress.length) ? "block" : "none" }}>
          <i className="fas fa-certificate" aria-hidden="true"></i>
          <p>{emptyMessage}</p>
        </div>
      </div>
    </div>
  );
}
