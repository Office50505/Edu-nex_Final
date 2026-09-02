import { useEffect, useMemo, useState } from "react";
import { page as dashboardPage } from "../generated-pages/dashboard.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";

function coursesArray(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.courses)) return response.courses;
  return [];
}

function dashCourseProgress(course) {
  try {
    const saved = JSON.parse(localStorage.getItem(`edunexCourseProgress:${course._id}`) || "{}");
    const total = Math.max(Array.isArray(course.videos) ? course.videos.length : 0, 1);
    const completed = Number(saved.completed || 0);
    const percent = Math.max(0, Math.min(100, Number(saved.percent ?? Math.round((completed / total) * 100))));
    const lessonIndex = Math.max(0, Math.min(Number(saved.lessonIndex || 0), total - 1));
    return { total, completed, percent, lessonIndex };
  } catch (_) {
    return { total: Math.max(Array.isArray(course.videos) ? course.videos.length : 0, 1), completed: 0, percent: 0, lessonIndex: 0 };
  }
}

function dashStatus(percent) {
  if (percent >= 100) return { key: "completed", label: "Completed", cls: "status-completed" };
  if (percent > 0) return { key: "in-progress", label: "In Progress", cls: "status-progress" };
  return { key: "new", label: "Not Started", cls: "status-new" };
}

function categoryName(course) {
  return typeof course.category === "string" ? course.category : (course.category?.name || "Course");
}

export function DashboardPage() {
  const [allowed, setAllowed] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const runtimeReady = useEduNexRuntimeReady();
  const user = window.EduNex?.getUser?.();
  const firstName = (user?.fullName || user?.email || user?.mobileNumber || "Learner").split(/\s+/)[0];

  usePageStyle("react-page-style-dashboard", dashboardPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...dashboardPage,
    scripts: dashboardPage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    document.title = dashboardPage.title;
    document.documentElement.lang = dashboardPage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  const canOpenDashboard = async () => {
    const token = window.EduNex?.getAccessToken?.();
    if (!token) return false;
    try {
      const subscription = await window.EduNex.checkSubscription();
      return window.EduNex.hasCourseAccess(subscription);
    } catch (_) {
      return false;
    }
  };

  const loadDashboardCourses = async () => {
    try {
      const data = await window.EduNex.request("/api/courses");
      const realCourses = coursesArray(data).filter((course) => course && course._id);
      setCourses(realCourses);
      setLoadError("");
    } catch (error) {
      setCourses([]);
      setLoadError(error.message || "Could not load backend courses.");
    }
  };

  useEffect(() => {
    if (!runtimeReady) return undefined;
    let cancelled = false;
    (async () => {
      const open = await canOpenDashboard();
      if (cancelled) return;
      setAllowed(open);
      if (open) await loadDashboardCourses();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeReady]);

  const realCourses = courses;
  const withVideos = realCourses.filter((course) => Array.isArray(course.videos) && course.videos.length);
  const shown = (withVideos.length ? withVideos : realCourses).slice(0, 8);
  const completed = realCourses.filter((course) => dashCourseProgress(course).percent >= 100).length;
  const visibleHistory = shown.filter((course) => {
    if (historyFilter === "all") return true;
    return dashStatus(dashCourseProgress(course).percent).key === historyFilter;
  });

  return (
    <div className="react-page-root" data-page="dashboard.html">
      <div className={`trial-gate${allowed === false ? " is-open" : ""}`} id="trialGate" role="dialog" aria-modal="true" aria-labelledby="trialGateTitle">
        <div className="trial-gate-card">
          <div className="trial-gate-icon"><i className="fas fa-bolt" aria-hidden="true"></i></div>
          <div className="trial-gate-title" id="trialGateTitle">Start your 1 rs trial right now</div>
          <p>Your dashboard unlocks after you start the trial or subscribe. Get instant access to your courses, videos, progress, and AI tutor.</p>
          <div className="trial-gate-actions">
            <a className="trial-gate-btn" href="payment.html"><i className="fas fa-arrow-right" aria-hidden="true"></i> Start 1 rs Trial</a>
            <a className="trial-gate-btn secondary" href="courses.html">Browse Courses</a>
          </div>
        </div>
      </div>

      <div className="dash-page" style={allowed === false ? { filter: "blur(6px)", pointerEvents: "none" } : undefined}>
        <div className="welcome-row">
          <div className="welcome-left">
            <h1>Welcome back, {firstName}</h1>
            <p>{realCourses.length ? `You have ${realCourses.length} real EduNex courses available. Continue from your latest saved lesson.` : "No published courses were found in the backend yet."}</p>
          </div>
          <div className="stats-row">
            <div className="stat-pill">
              <div className="stat-pill-label"><i className="fas fa-fire" aria-hidden="true"></i> Day Streak</div>
              <div className="stat-pill-value">{user ? "Active" : "Guest"}</div>
            </div>
            <div className="stat-pill">
              <div className="stat-pill-label"><i className="fas fa-bullseye" aria-hidden="true"></i> Points</div>
              <div className="stat-pill-value">{completed} Done</div>
            </div>
            <div className="stat-pill">
              <div className="stat-pill-label"><i className="fas fa-graduation-cap" aria-hidden="true"></i> Courses</div>
              <div className="stat-pill-value">{realCourses.length || 8}</div>
            </div>
          </div>
        </div>

        <div className="sec-header">
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <h2 className="sec-title">Learning History</h2>
            <div className="filter-tabs" role="tablist" aria-label="Learning history filters">
              {[
                ["all", "All"],
                ["in-progress", "In Progress"],
                ["completed", "Completed"],
                ["new", "Not Started"],
              ].map(([value, label]) => (
                <button className={`filter-tab${historyFilter === value ? " active" : ""}`} type="button" key={value} onClick={() => setHistoryFilter(value)}>{label}</button>
              ))}
            </div>
          </div>
          <a href="courses.html" className="sec-link">Browse Courses →</a>
        </div>

        <div className="hist-grid" id="histGrid">
          {allowed === null ? <div className="hist-card" style={{ padding: 22, minHeight: 180 }}>Loading your real courses...</div> : null}
          {loadError ? <div className="hist-card" style={{ padding: 22, minHeight: 180 }}>Could not load backend courses: {loadError}</div> : null}
          {!loadError && allowed && !visibleHistory.length ? <div className="hist-card" style={{ padding: 22, minHeight: 180 }}>No published courses with videos are available yet.</div> : null}
          {!loadError && allowed ? visibleHistory.map((course) => {
            const progress = dashCourseProgress(course);
            const status = dashStatus(progress.percent);
            const video = course.videos?.[progress.lessonIndex] || course.videos?.[0] || {};
            const title = video.title || course.title || "Untitled lesson";
            const duration = video.duration ? `${Math.max(1, Math.round(Number(video.duration) / 60))} min` : `${progress.total} videos`;
            const href = `videos.html?courseId=${encodeURIComponent(course._id)}&video=${progress.lessonIndex}`;
            return (
              <div className="hist-card" data-status={status.key} key={course._id} onClick={() => { window.location.href = href; }} role="link" tabIndex={0} onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                window.location.href = href;
              }}>
                <div className="hist-thumb-wrap">
                  <img className="hist-thumb" src={window.EduNex?.courseImage?.(course)} alt={course.title || title} onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = window.EduNex?.placeholderImage?.(event.currentTarget.alt || "EduNex") || "";
                  }} />
                  <span className={`hist-status ${status.cls}`}>{status.label}</span>
                  <span className="hist-duration">{duration}</span>
                  <div className="hist-progress-track"><div className="hist-progress-fill" style={{ width: `${progress.percent}%` }}></div></div>
                  <div className="hist-play-overlay"><button className="hist-play-btn" type="button" aria-label="Play lesson"><i className="fas fa-play" style={{ marginLeft: 2 }} aria-hidden="true"></i></button></div>
                </div>
                <div className="hist-info">
                  <div className="hist-title">{title}</div>
                  <div className="hist-meta"><span>{course.title || "EduNex course"}</span><span className="dot">·</span><span>Video {progress.lessonIndex + 1} of {progress.total}</span></div>
                  <div className="hist-footer-row"><span className="hist-pct">{progress.percent ? `${progress.percent}% complete` : "Ready to start"}</span><span className="hist-time">Synced now</span></div>
                </div>
              </div>
            );
          }) : null}
        </div>

        <div className="dash-bottom">
          <section>
            <div className="sec-header">
              <h2 className="sec-title">Recommended for You</h2>
              <a href="courses.html" className="sec-link">View All →</a>
            </div>
            <div className="rec-grid" id="recGrid">
              {allowed === null ? <div className="rec-card" style={{ padding: 18 }}>Loading recommendations...</div> : null}
              {loadError ? <div className="rec-card" style={{ padding: 18 }}>Recommendations unavailable.</div> : null}
              {!loadError && allowed && !realCourses.slice(0, 4).length ? <div className="rec-card" style={{ padding: 18 }}>No published recommendations yet.</div> : null}
              {!loadError && allowed ? realCourses.slice(0, 4).map((course) => {
                const videos = Array.isArray(course.videos) ? course.videos.length : 0;
                return (
                  <div className="rec-card" key={course._id} onClick={() => window.EduNex?.openCourseDetails?.({ _id: course._id })} role="link" tabIndex={0}>
                    <div className="rec-thumb-wrap">
                      <img className="rec-thumb" src={window.EduNex?.courseImage?.(course)} alt={course.title} onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = window.EduNex?.placeholderImage?.(event.currentTarget.alt || "EduNex") || "";
                      }} />
                      <span className="rec-badge badge-mono">{categoryName(course)}</span>
                    </div>
                    <div className="rec-body">
                      <div className="rec-title">{course.title || "Untitled course"}</div>
                      <div className="rec-meta-row">
                        <span><i className="fas fa-play-circle" aria-hidden="true"></i> {videos} videos</span>
                        <span><i className="fas fa-star" aria-hidden="true"></i> {course.averageRating || "New"}</span>
                      </div>
                      <div className="rec-price-row"><span className="rec-price">REAL COURSE</span><button className="cart-btn" type="button" aria-label="Open course"><i className="fas fa-arrow-right" aria-hidden="true"></i></button></div>
                    </div>
                  </div>
                );
              }) : null}
            </div>
          </section>

          <div className="activity-panel">
            <div className="activity-card">
              <div className="activity-head"><span>Daily Activity</span><button className="activity-more" type="button">···</button></div>
              <div className="chart-area">
                <div className="bars-wrap">
                  {[22, 38, 64, 44, 28, 52, 18].map((height, index) => (
                    <div className="bar-col" style={index === 2 ? { position: "relative" } : undefined} key={`${height}-${index}`}>
                      {index === 2 ? <div className="bar-tooltip">Wed</div> : null}
                      <div className={`bar${index === 2 ? " bar-active" : ""}`} style={{ height }}></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="chart-days">
                {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <div className="chart-day" style={index === 2 ? { color: "var(--cyan)" } : undefined} key={`${day}-${index}`}>{day}</div>)}
              </div>
              <div className="activity-stats">
                <div className="astat"><div className="astat-label">Hours Spent</div><div className="astat-value">Synced</div></div>
                <div className="astat"><div className="astat-label">Completed</div><div className="astat-value">Real courses</div></div>
              </div>
            </div>

            <div className="streak-card">
              <div className="streak-head"><span>Learning Status</span></div>
              <div className="streak-num">Live</div>
              <div className="streak-sub">Based on backend course availability</div>
              <div className="streak-dots">
                {Array.from({ length: 7 }).map((_, index) => <div className={`streak-dot${index < 6 ? " done" : " today"}`} key={index}></div>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
