import { useEffect, useMemo, useState } from "react";
import { page as dashboardPage } from "../generated-pages/dashboard.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";
import { progressCacheKey } from "../hooks/useLearningProgress.js";
import { courseVideoHref } from "../lib/courseNavigation.js";

function coursesArray(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.courses)) return response.courses;
  return [];
}

function recommendationsArray(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.recommendations)) return response.recommendations;
  return coursesArray(response);
}

function progressSummaryMap(response) {
  const summary = response?.courseProgress;
  return summary && typeof summary === "object" && !Array.isArray(summary) ? summary : {};
}

function cachedCourseProgress(courseId) {
  try {
    const scoped = localStorage.getItem(progressCacheKey(courseId));
    const legacy = localStorage.getItem(`edunexCourseProgress:${courseId}`);
    return JSON.parse(scoped || legacy || "{}");
  } catch (_) {
    return {};
  }
}

function videoAliases(video, index) {
  return [video?._id, video?.id, video?.bunnyVideoId, video?.bunnyGuid, video?.youtubeId, video?.videoId, index]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map(String);
}

function progressFromSummary(course, summary) {
  const videos = Array.isArray(course.videos) ? course.videos : [];
  const total = Math.max(videos.length, Number(summary?.totalVideos || 0), 1);
  const completed = Math.max(0, Math.min(total, Number(summary?.completedCount || 0)));
  const percentValue = Number(summary?.progressPercent);
  const percent = Math.max(0, Math.min(100, Number.isFinite(percentValue) ? percentValue : Math.round((completed / total) * 100)));
  const completedIds = new Set((summary?.completedVideoIds || []).map(String));
  const videoProgress = Object.values(summary?.videoProgress || {});
  const lastWatchedVideoId = String(summary?.lastWatchedVideoId || videoProgress.find((row) => Number(row?.resumePosition || 0) > 0)?.videoId || "");
  let lessonIndex = videos.findIndex((video, index) => videoAliases(video, index).includes(lastWatchedVideoId));
  const firstIncomplete = videos.findIndex((video, index) => !videoAliases(video, index).some((id) => completedIds.has(id)));
  if (firstIncomplete >= 0 && (lessonIndex < 0 || completedIds.has(lastWatchedVideoId))) lessonIndex = firstIncomplete;
  if (lessonIndex < 0) lessonIndex = Math.min(completed, total - 1);
  return {
    total,
    completed,
    percent,
    lessonIndex: Math.max(0, Math.min(lessonIndex, total - 1)),
    lastViewedAt: summary?.updatedAt || "",
    watchedSeconds: videoProgress.reduce((sum, row) => sum + Math.max(0, Number(row?.watchedSeconds || 0)), 0),
    durationSeconds: videoProgress.reduce((sum, row) => sum + Math.max(0, Number(row?.durationSeconds || 0)), 0),
    activityByDay: {},
    viewed: Boolean(summary?.updatedAt || percent > 0 || completed > 0),
  };
}

export function dashCourseProgress(course, progressByCourse = null) {
  const total = Math.max(Array.isArray(course.videos) ? course.videos.length : 0, 1);
  const saved = cachedCourseProgress(course._id);
  const completed = Math.max(0, Number(saved.completed || 0));
  const local = {
    total,
    completed,
    percent: Math.max(0, Math.min(100, Number(saved.percent ?? Math.round((completed / total) * 100)))),
    lessonIndex: Math.max(0, Math.min(Number(saved.lessonIndex || 0), total - 1)),
    lastViewedAt: saved.lastViewedAt || "",
    watchedSeconds: Math.max(0, Number(saved.watchedSeconds || 0)),
    durationSeconds: Math.max(0, Number(saved.durationSeconds || 0)),
    activityByDay: saved.activityByDay && typeof saved.activityByDay === "object" ? saved.activityByDay : {},
    viewed: Boolean(saved.viewed || saved.lastViewedAt),
  };
  const summary = progressByCourse?.[String(course._id)];
  if (!summary) return local;
  const remote = progressFromSummary(course, summary);
  const localTime = new Date(local.lastViewedAt).getTime() || 0;
  const remoteTime = new Date(remote.lastViewedAt).getTime() || 0;
  const current = localTime > remoteTime ? local : remote;
  return { ...current, activityByDay: local.activityByDay };
}

function cacheServerProgress(courses, progressByCourse) {
  courses.forEach((course) => {
    const summary = progressByCourse?.[String(course._id)];
    if (!summary) return;
    const local = cachedCourseProgress(course._id);
    const remote = progressFromSummary(course, summary);
    const localTime = new Date(local.lastViewedAt).getTime() || 0;
    const remoteTime = new Date(remote.lastViewedAt).getTime() || 0;
    const current = localTime > remoteTime ? local : remote;
    try {
      localStorage.setItem(progressCacheKey(course._id), JSON.stringify({
        ...local,
        ...current,
        activityByDay: local.activityByDay && typeof local.activityByDay === "object" ? local.activityByDay : {},
      }));
    } catch (_) {}
  });
}

function durationSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const raw = String(value || "").trim();
  if (!raw) return 0;
  if (/^\d+(?::\d{1,2}){1,2}$/.test(raw)) {
    return raw.split(":").map(Number).reduce((total, part) => total * 60 + part, 0);
  }
  const hours = Number(raw.match(/([\d.]+)\s*h/i)?.[1] || 0);
  const minutes = Number(raw.match(/([\d.]+)\s*m/i)?.[1] || 0);
  return Math.round((hours * 60 + minutes) * 60);
}

function courseDurationMinutes(course) {
  const lessonSeconds = Array.isArray(course.videos)
    ? course.videos.reduce((total, video) => total + durationSeconds(video?.duration || video?.durationSeconds), 0)
    : 0;
  return (lessonSeconds || durationSeconds(course.duration)) / 60;
}

function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function learningTimeLabel(totalMinutes) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function buildDashboardActivity(courses, now = new Date(), progressByCourse = null) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return {
      key: localDayKey(date),
      label: date.toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 1),
      fullLabel: date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
      value: 0,
    };
  });
  const dayMap = new Map(days.map((day) => [day.key, day]));
  let completedLessons = 0;
  let completedCourses = 0;
  let startedCourses = 0;
  let totalMinutes = 0;
  let latestActivity = null;

  courses.forEach((course) => {
    const progress = dashCourseProgress(course, progressByCourse);
    const completedForCourse = progress.percent >= 100 ? progress.total : progress.completed;
    completedLessons += completedForCourse;
    if (progress.percent >= 100) completedCourses += 1;
    if (progress.percent > 0 || progress.lastViewedAt) startedCourses += 1;
    const estimatedMinutes = courseDurationMinutes(course) * (progress.percent / 100);
    totalMinutes += progress.watchedSeconds > 0 ? progress.watchedSeconds / 60 : estimatedMinutes;

    let hasDailyActivity = false;
    Object.entries(progress.activityByDay).forEach(([key, seconds]) => {
      const day = dayMap.get(key);
      const activityMinutes = Math.max(0, Number(seconds || 0)) / 60;
      if (!day || activityMinutes <= 0) return;
      day.value += activityMinutes;
      hasDailyActivity = true;
    });

    const viewedDate = progress.lastViewedAt ? new Date(progress.lastViewedAt) : null;
    if (viewedDate && !Number.isNaN(viewedDate.getTime())) {
      const day = dayMap.get(localDayKey(viewedDate));
      if (day && !hasDailyActivity && estimatedMinutes > 0) day.value += estimatedMinutes;
      if (!latestActivity || viewedDate > latestActivity) latestActivity = viewedDate;
    }
  });

  let streak = 0;
  for (let index = days.length - 1; index >= 0 && days[index].value > 0; index -= 1) streak += 1;
  const latestText = latestActivity
    ? (localDayKey(latestActivity) === localDayKey(today)
      ? "Active today"
      : `Last active ${latestActivity.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`)
    : "Start a lesson to begin tracking";
  const statusLabel = courses.length > 0 && completedCourses === courses.length
    ? "Complete"
    : (startedCourses > 0 ? "In progress" : "Not started");

  return {
    days,
    maxValue: Math.max(1, ...days.map((day) => day.value)),
    activeIndex: Math.max(0, days.map((day) => day.value).lastIndexOf(Math.max(...days.map((day) => day.value)))),
    timeLabel: learningTimeLabel(totalMinutes),
    completedLessons,
    completedLabel: `${completedLessons} lesson${completedLessons === 1 ? "" : "s"}`,
    statusLabel,
    statusSub: streak > 0 ? `${latestText} · ${streak}-day streak` : latestText,
  };
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
  const [recommendations, setRecommendations] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [recommendationError, setRecommendationError] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [progressByCourse, setProgressByCourse] = useState(null);
  const [progressVersion, setProgressVersion] = useState(0);
  const runtimeReady = useEduNexRuntimeReady();
  const user = window.EduNex?.getUser?.();
  const userId = user?._id || user?.id || "";
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
    const token = window.EduNex?.getAccessToken?.();
    const recommendationOptions = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    const progressRequest = userId && window.EduNex?.authRequest
      ? window.EduNex.authRequest(`/api/user/${encodeURIComponent(userId)}/progress`)
      : Promise.resolve({ courseProgress: {} });
    const [courseResult, recommendationResult, progressResult] = await Promise.allSettled([
      window.EduNex.request("/api/courses"),
      window.EduNex.request("/api/recommendations/courses?limit=4", recommendationOptions),
      progressRequest,
    ]);

    let loadedCourses = [];
    if (courseResult.status === "fulfilled") {
      loadedCourses = coursesArray(courseResult.value).filter((course) => course && course._id);
      setCourses(loadedCourses);
      setLoadError("");
    } else {
      setCourses([]);
      setLoadError(courseResult.reason?.message || "Could not load backend courses.");
    }

    if (recommendationResult.status === "fulfilled") {
      setRecommendations(recommendationsArray(recommendationResult.value).filter((course) => course && course._id));
      setRecommendationError("");
    } else {
      setRecommendations([]);
      setRecommendationError(recommendationResult.reason?.message || "Could not load recommendations.");
    }

    if (progressResult.status === "fulfilled") {
      const summaries = progressSummaryMap(progressResult.value);
      cacheServerProgress(loadedCourses, summaries);
      setProgressByCourse(summaries);
      setProgressVersion((version) => version + 1);
    } else {
      setProgressByCourse(null);
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

  useEffect(() => {
    const refreshProgress = () => setProgressVersion((version) => version + 1);
    window.addEventListener("learning-progress", refreshProgress);
    window.addEventListener("storage", refreshProgress);
    return () => {
      window.removeEventListener("learning-progress", refreshProgress);
      window.removeEventListener("storage", refreshProgress);
    };
  }, []);

  const realCourses = courses;
  const withVideos = realCourses.filter((course) => Array.isArray(course.videos) && course.videos.length);
  const shown = (withVideos.length ? withVideos : realCourses).slice(0, 8);
  const visibleHistory = shown.filter((course) => {
    if (historyFilter === "all") return true;
    return dashStatus(dashCourseProgress(course, progressByCourse).percent).key === historyFilter;
  });
  const recommendedCourses = recommendations.length ? recommendations : realCourses.slice(0, 4);
  const activity = useMemo(() => buildDashboardActivity(realCourses, new Date(), progressByCourse), [progressByCourse, progressVersion, realCourses]);

  return (
    <div className="react-page-root" data-page="dashboard.html">
      <div className={`trial-gate${allowed === false ? " is-open" : ""}`} id="trialGate" role="dialog" aria-modal="true" aria-labelledby="trialGateTitle">
        <div className="trial-gate-card">
          <div className="trial-gate-icon"><i className="fas fa-bolt" aria-hidden="true"></i></div>
          <div className="trial-gate-title" id="trialGateTitle">Start your 24-hour trial for ₹1</div>
          <p>Your dashboard unlocks after you subscribe. After the 24-hour trial, access renews at ₹499/month until cancelled.</p>
          <div className="trial-gate-actions">
            <a className="trial-gate-btn" href="payment.html"><i className="fas fa-arrow-right" aria-hidden="true"></i> Try 24 Hours for ₹1</a>
            <a className="trial-gate-btn secondary" href="courses.html">Browse Courses</a>
          </div>
        </div>
      </div>

      <div className="dash-page" style={allowed === false ? { filter: "blur(6px)", pointerEvents: "none" } : undefined}>
        <div className="welcome-row">
          <div className="welcome-left">
            <h1>Welcome back, {firstName}</h1>
            <p>{realCourses.length ? `You have ${realCourses.length} real Skillomate courses available. Continue from your latest saved lesson.` : "No published courses were found in the backend yet."}</p>
          </div>
          <div className="stats-row">
            <div className="stat-pill">
              <div className="stat-pill-label"><i className="fas fa-fire" aria-hidden="true"></i> Day Streak</div>
              <div className="stat-pill-value">{user ? "Active" : "Guest"}</div>
            </div>
            <div className="stat-pill">
              <div className="stat-pill-label"><i className="fas fa-bullseye" aria-hidden="true"></i> Lessons</div>
              <div className="stat-pill-value">{activity.completedLessons} Done</div>
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
            const progress = dashCourseProgress(course, progressByCourse);
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
                    event.currentTarget.src = window.EduNex?.placeholderImage?.(event.currentTarget.alt || "Skillomate") || "";
                  }} />
                  <span className={`hist-status ${status.cls}`}>{status.label}</span>
                  <span className="hist-duration">{duration}</span>
                  <div className="hist-progress-track"><div className="hist-progress-fill" style={{ width: `${progress.percent}%` }}></div></div>
                  <div className="hist-play-overlay"><button className="hist-play-btn" type="button" aria-label="Play lesson"><i className="fas fa-play" style={{ marginLeft: 2 }} aria-hidden="true"></i></button></div>
                </div>
                <div className="hist-info">
                  <div className="hist-title">{title}</div>
                  <div className="hist-meta"><span>{course.title || "Skillomate course"}</span><span className="dot">·</span><span>Video {progress.lessonIndex + 1} of {progress.total}</span></div>
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
              {allowed && recommendationError && !recommendedCourses.length ? <div className="rec-card" style={{ padding: 18 }}>Recommendations unavailable.</div> : null}
              {!recommendationError && allowed && !recommendedCourses.length ? <div className="rec-card" style={{ padding: 18 }}>No published recommendations yet.</div> : null}
              {allowed ? recommendedCourses.map((course) => {
                const videos = Number(course.videoCount || 0) || (Array.isArray(course.videos) ? course.videos.length : 0);
                const reason = course.recommendation?.reason || "Recommended from the current Skillomate catalog";
                return (
                  <div className="rec-card" key={course._id} onClick={() => { window.location.href = courseVideoHref(course); }} role="link" tabIndex={0} onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    window.location.href = courseVideoHref(course);
                  }}>
                    <div className="rec-thumb-wrap">
                      <img className="rec-thumb" src={window.EduNex?.courseImage?.(course)} alt={course.title} onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = window.EduNex?.placeholderImage?.(event.currentTarget.alt || "Skillomate") || "";
                      }} />
                      <span className="rec-badge badge-mono">{categoryName(course)}</span>
                    </div>
                    <div className="rec-body">
                      <div className="rec-title">{course.title || "Untitled course"}</div>
                      <div className="rec-meta-row">
                        <span><i className="fas fa-play-circle" aria-hidden="true"></i> {videos} videos</span>
                        <span><i className="fas fa-star" aria-hidden="true"></i> {course.averageRating || "New"}</span>
                      </div>
                      <div className="rec-reason">{reason}</div>
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
                  {activity.days.map((day, index) => {
                    const height = day.value ? Math.max(12, Math.round((day.value / activity.maxValue) * 64)) : 6;
                    const active = index === activity.activeIndex && day.value > 0;
                    const minutes = Math.round(day.value);
                    return <div className="bar-col" style={active ? { position: "relative" } : undefined} key={day.key} title={`${day.fullLabel}: ${minutes} min`}>
                      {active ? <div className="bar-tooltip">{minutes} min</div> : null}
                      <div className={`bar${active ? " bar-active" : ""}`} style={{ height }}></div>
                    </div>
                  })}
                </div>
              </div>
              <div className="chart-days">
                {activity.days.map((day, index) => <div className="chart-day" style={index === 6 ? { color: "var(--cyan)" } : undefined} key={day.key}>{day.label}</div>)}
              </div>
              <div className="activity-stats">
                <div className="astat"><div className="astat-label">Learning Time</div><div className="astat-value">{activity.timeLabel}</div></div>
                <div className="astat"><div className="astat-label">Completed</div><div className="astat-value">{activity.completedLabel}</div></div>
              </div>
            </div>

            <div className="streak-card">
              <div className="streak-head"><span>Learning Status</span></div>
              <div className="streak-num">{activity.statusLabel}</div>
              <div className="streak-sub">{activity.statusSub}</div>
              <div className="streak-dots">
                {activity.days.map((day, index) => <div className={`streak-dot${day.value > 0 ? " done" : ""}${index === 6 ? " today" : ""}`} title={`${day.fullLabel}: ${Math.round(day.value)} min`} key={day.key}></div>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
