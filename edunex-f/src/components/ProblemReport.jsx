import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EnxIcon } from "./EnxIcon.jsx";
import { useViewportLock } from "../hooks/useViewportLock.js";
import { apiFetch } from "../lib/apiUrl.js";

const CATEGORIES = [
  ["technical", "Technical problem"],
  ["video", "Video or lesson"],
  ["payment", "Payment or subscription"],
  ["ai", "AI tutor"],
  ["account", "Account or login"],
  ["other", "Something else"],
];

function accessToken() {
  return window.EduNex?.getAccessToken?.()
    || localStorage.getItem("edunexAccessToken")
    || sessionStorage.getItem("edunexAccessToken")
    || "";
}

function deviceType() {
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1100) return "tablet";
  return "desktop";
}

function safePageContext() {
  const params = new URLSearchParams(window.location.search);
  const route = window.location.pathname;
  const isCoursePage = /course|lesson|video/i.test(route);
  const isLessonPage = /lesson|video/i.test(route);
  const courseId = params.get("courseId") || params.get("course") || (isCoursePage ? params.get("id") : "") || "";
  const lessonId = params.get("lessonId") || params.get("lesson") || (isLessonPage ? params.get("videoId") : "") || "";
  const safeUrl = new URL(window.location.pathname, window.location.origin);
  if (courseId) safeUrl.searchParams.set("courseId", courseId);
  if (lessonId) safeUrl.searchParams.set("lessonId", lessonId);
  const theme = document.documentElement.dataset.theme || localStorage.getItem("enx-theme") || "unknown";

  return {
    pageUrl: safeUrl.href,
    pageTitle: document.title,
    route,
    courseId,
    lessonId,
    theme: ["light", "noir", "system"].includes(theme) ? theme : "unknown",
    viewport: { width: window.innerWidth, height: window.innerHeight },
    deviceType: deviceType(),
    userAgent: navigator.userAgent,
  };
}

async function submitReport(payload) {
  const token = accessToken();
  const response = await apiFetch("/api/problem-reports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to send your report. Please try again.");
  return data;
}

export function ProblemReport({ open, onClose }) {
  const [category, setCategory] = useState("technical");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const messageRef = useRef(null);
  const previouslyFocused = useRef(null);
  const busyRef = useRef(false);
  const closeRef = useRef(onClose);

  closeRef.current = onClose;
  busyRef.current = busy;
  useViewportLock(open);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = document.activeElement;
    const focusTimer = window.setTimeout(() => messageRef.current?.focus(), 30);
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) closeRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCategory("technical");
      setMessage("");
      setError("");
      setReference("");
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (cleanMessage.length < 10) {
      setError("Please describe the problem in at least 10 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await submitReport({ category, message: cleanMessage, ...safePageContext() });
      setReference(result.reportId || "Submitted");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  const reportDialog = (
    <div className="problem-report-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="problem-report-dialog" role="dialog" aria-modal="true" aria-labelledby="problem-report-title" aria-describedby="problem-report-description">
        <div className="problem-report-head">
          <div className="problem-report-mark" aria-hidden="true"><EnxIcon name="flag" /></div>
          <div>
            <p>SKILLOMATE SUPPORT</p>
            <h2 id="problem-report-title">Report a problem</h2>
          </div>
          <button className="problem-report-close" type="button" onClick={onClose} disabled={busy} aria-label="Close report form"><EnxIcon name="close" /></button>
        </div>

        {reference ? (
          <div className="problem-report-success" role="status">
            <div className="problem-report-success-icon" aria-hidden="true"><EnxIcon name="checkCircle" /></div>
            <h3>Thank you. We received it.</h3>
            <p>Your reference is <strong>{reference}</strong>. Our team can now see the report in the admin panel.</p>
            <button className="problem-report-submit" type="button" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p id="problem-report-description" className="problem-report-description">Tell us what went wrong. We automatically include this page and basic device details, never passwords or payment information.</p>
            <label className="problem-report-field" htmlFor="problem-report-category">
              <span>Where is the problem?</span>
              <select id="problem-report-category" value={category} onChange={(event) => setCategory(event.target.value)} disabled={busy}>
                {CATEGORIES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label className="problem-report-field" htmlFor="problem-report-message">
              <span>What happened?</span>
              <textarea
                id="problem-report-message"
                ref={messageRef}
                value={message}
                onChange={(event) => setMessage(event.target.value.slice(0, 3000))}
                placeholder="Describe what you were trying to do and what happened instead..."
                rows="6"
                minLength="10"
                maxLength="3000"
                disabled={busy}
                required
              />
              <small aria-hidden="true">{message.length}/3000</small>
            </label>
            {error ? <p className="problem-report-error" role="alert">{error}</p> : null}
            <div className="problem-report-actions">
              <button className="problem-report-cancel" type="button" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="problem-report-submit" type="submit" disabled={busy || message.trim().length < 10}>{busy ? "Sending…" : "Send report"}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );

  const fullscreenHost = document.fullscreenElement
    || document.webkitFullscreenElement
    || document.querySelector("#playerFrame.is-app-fullscreen");
  return fullscreenHost ? createPortal(reportDialog, fullscreenHost) : reportDialog;
}
