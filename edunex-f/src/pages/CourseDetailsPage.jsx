import { useEffect, useMemo, useState } from "react";
import { page as coursePage } from "../generated-pages/course.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";
import { progressCacheKey } from "../hooks/useLearningProgress.js";

function courseId(course) {
  return window.EduNex?.courseId?.(course) || course?._id || course?.id || "";
}

function categoryName(course) {
  return typeof course?.category === "string" ? course.category : (course?.category?.name || course?.categoryName || "Course");
}

function driveThumbnailFallback(course) {
  const raw = String(course?.thumbnailUrl || course?.thumbnailVerticalUrl || course?.videos?.[0]?.thumbnailUrl || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw, window.location.origin);
    if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return "";
    const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    const id = fileMatch?.[1] || parsed.searchParams.get("id");
    if (!id) return "";
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`;
  } catch (_) {
    return "";
  }
}

function handleCourseImageError(event, course) {
  const image = event.currentTarget;
  const fallback = driveThumbnailFallback(course);
  if (fallback && image.dataset.driveFallback !== "true") {
    image.dataset.driveFallback = "true";
    image.src = fallback;
    return;
  }

  image.onerror = null;
  image.src = window.EduNex?.placeholderImage?.(image.alt || "Skillomate") || "";
}

function instructorName(course) {
  return course?.instructor?.name || course?.instructorName || course?.author || "Skillomate AI Mentors";
}

function lessonCount(course) {
  return Number(course?.videoCount || course?.lessonCount || (Array.isArray(course?.videos) ? course.videos.length : 0));
}

function readableDuration(course) {
  if (course?.duration) return course.duration;
  const count = lessonCount(course);
  return count ? `${count} lessons` : "";
}

function priceLabel(course) {
  const value = Number(course?.price || 0);
  return value > 1 ? `₹${value.toLocaleString("en-IN")}` : "₹1 for 24 hours";
}

function originalPrice(course) {
  const value = Number(course?.originalPrice || course?.compareAtPrice || 0);
  return value > 1 ? `₹${value.toLocaleString("en-IN")}` : "";
}

function progressFor(id) {
  try {
    if (!window.EduNex?.getAccessToken?.()) return { percent: 0, hasProgress: false };
    const saved = JSON.parse(localStorage.getItem(progressCacheKey(id)) || "{}");
    const percent = Math.max(0, Math.min(100, Number(saved.percent || 0)));
    return {
      percent,
      hasProgress: Boolean(saved.viewed || saved.lastViewedAt),
    };
  } catch (_) {
    return { percent: 0, hasProgress: false };
  }
}

function markCourseViewed(id) {
  if (!id || !window.EduNex?.getAccessToken?.()) return;
  try {
    const key = progressCacheKey(id);
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({
      ...saved,
      viewed: true,
      lastViewedAt: new Date().toISOString(),
    }));
  } catch (_) {}
}

function ctaHref(course) {
  const id = courseId(course);
  const next = `/videos.html?courseId=${encodeURIComponent(id)}&video=0`;
  return `payment.html?courseId=${encodeURIComponent(id)}&next=${encodeURIComponent(next)}`;
}

async function hasAccess() {
  let localMarker = false;
  try {
    const marker = JSON.parse(localStorage.getItem("edunexHasCourseAccess") || "null");
    localMarker = Boolean(marker?.active && Date.now() - Number(marker.savedAt || 0) < 86400000);
  } catch (_) {}
  if (!window.EduNex?.getAccessToken?.()) return localMarker;
  try {
    return Boolean(window.EduNex?.hasCourseAccess?.(await window.EduNex?.checkSubscription?.()) || localMarker);
  } catch (error) {
    console.warn("Course detail access check failed", error);
    return localMarker;
  }
}

function Skeleton() {
  return (
    <main id="courseDetailRoot" className="course-state-wrap">
      <section className="course-state-card" aria-live="polite">
        <div className="course-skeleton" style={{ height: 190, borderRadius: 16, marginBottom: 24 }}></div>
        <div className="course-skeleton" style={{ height: 18, width: "34%", margin: "0 auto 16px" }}></div>
        <div className="course-skeleton" style={{ height: 42, width: "80%", margin: "0 auto 14px" }}></div>
        <div className="course-skeleton" style={{ height: 14, width: "66%", margin: "0 auto" }}></div>
      </section>
    </main>
  );
}

export function CourseDetailsPage() {
  const [state, setState] = useState({ loading: true, error: false, notFound: false, course: null, accessActive: false });
  const runtimeReady = useEduNexRuntimeReady();

  usePageStyle("react-page-style-course-details", coursePage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...coursePage,
    scripts: coursePage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    document.title = coursePage.title;
    document.documentElement.lang = coursePage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  const loadCourse = async () => {
    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("id") || params.get("courseId") || params.get("course");
    const requestedSlug = params.get("slug");
    setState((current) => ({ ...current, loading: true, error: false, notFound: false }));
    try {
      const [listResult, summaryResult] = await Promise.allSettled([
        window.EduNex.request("/api/courses"),
        requestedId ? window.EduNex.request(`/api/courses/checkout-summary?courseId=${encodeURIComponent(requestedId)}`) : Promise.reject(new Error("No id supplied")),
      ]);
      if (summaryResult.status === "rejected" && /not found|invalid course id/i.test(String(summaryResult.reason?.message || summaryResult.reason || ""))) {
        setState({ loading: false, error: false, notFound: true, course: null, accessActive: false });
        return;
      }
      const courses = listResult.status === "fulfilled" && Array.isArray(listResult.value) ? listResult.value : [];
      const fromList = courses.find((course) => {
        const id = String(courseId(course));
        const slug = String(course?.slug || "");
        return (requestedId && id === String(requestedId)) || (requestedSlug && slug === String(requestedSlug));
      });
      const fromSummary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
      const course = { ...(fromList || {}), ...(fromSummary || {}) };
      if (!courseId(course)) {
        setState({ loading: false, error: false, notFound: true, course: null, accessActive: false });
        return;
      }
      markCourseViewed(courseId(course));
      setState({ loading: false, error: false, notFound: false, course, accessActive: await hasAccess() });
    } catch (error) {
      console.error("Course detail failed", error);
      setState({ loading: false, error: true, notFound: false, course: null, accessActive: false });
    }
  };

  useEffect(() => {
    if (runtimeReady) loadCourse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeReady]);

  if (state.loading) {
    return <div className="react-page-root" data-page="course.html"><Skeleton /></div>;
  }

  if (state.notFound) {
    return (
      <div className="react-page-root" data-page="course.html">
        <main id="courseDetailRoot" className="course-state-wrap">
          <section className="course-state-card">
            <h1>Course not found</h1>
            <p>This course may no longer be available or the link may be incorrect.</p>
            <div className="course-state-actions">
              <button type="button" onClick={() => history.back()}>Back to Courses</button>
              <a className="primary" href="courses.html">Explore Courses</a>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (state.error || !state.course) {
    return (
      <div className="react-page-root" data-page="course.html">
        <main id="courseDetailRoot" className="course-state-wrap">
          <section className="course-state-card">
            <h1>We couldn't load this course right now.</h1>
            <p>Please try again in a moment.</p>
            <div className="course-state-actions">
              <button className="primary" type="button" id="courseRetryBtn" onClick={loadCourse}>Retry</button>
              <a href="courses.html">Back to Courses</a>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const course = state.course;
  const id = courseId(course);
  const title = course.title || "Untitled course";
  const videos = Array.isArray(course.videos) ? course.videos : [];
  const progress = progressFor(id);
  const primaryLabel = state.accessActive ? (progress.hasProgress ? "Continue Learning" : "Start Course") : "Try 24 Hours for ₹1";
  const maybeOriginal = originalPrice(course);

  return (
    <div className="react-page-root" data-page="course.html">
      <main id="courseDetailRoot" className="course-detail-page">
        <div className="course-detail-shell">
          <nav className="course-breadcrumb" aria-label="Breadcrumb">
            <a href="courses.html">Courses</a><span>/</span><span>{title}</span>
          </nav>
          <div className="course-detail-grid">
            <article className="course-hero-card">
              <img
                className="course-cover"
                src={window.EduNex?.courseImage?.(course)}
                alt={title}
                onError={(event) => handleCourseImageError(event, course)}
              />
              <div className="course-hero-body">
                <div className="course-kicker"><i className="fas fa-book-open" aria-hidden="true"></i>{categoryName(course)}</div>
                <h1 className="course-title">{title}</h1>
                {course.description ? <p className="course-desc">{course.description}</p> : null}
                <div className="course-meta-grid">
                  <span className="course-meta-chip"><i className="fas fa-user" aria-hidden="true"></i>{instructorName(course)}</span>
                  {course.averageRating || course.rating ? <span className="course-meta-chip"><i className="fas fa-star" aria-hidden="true"></i>{course.averageRating || course.rating} rating</span> : null}
                  {lessonCount(course) ? <span className="course-meta-chip"><i className="fas fa-play-circle" aria-hidden="true"></i>{lessonCount(course)} lessons</span> : null}
                  {readableDuration(course) ? <span className="course-meta-chip"><i className="fas fa-clock" aria-hidden="true"></i>{readableDuration(course)}</span> : null}
                  {course.language ? <span className="course-meta-chip"><i className="fas fa-globe" aria-hidden="true"></i>{course.language}</span> : null}
                  {course.level ? <span className="course-meta-chip"><i className="fas fa-signal" aria-hidden="true"></i>{course.level}</span> : null}
                  {course.certificate || course.certificateIncluded ? <span className="course-meta-chip"><i className="fas fa-certificate" aria-hidden="true"></i>Certificate</span> : null}
                </div>
              </div>
            </article>
            <aside className="course-side-card">
              <div className="course-price"><strong>{priceLabel(course)}</strong>{maybeOriginal ? <span>{maybeOriginal}</span> : null}</div>
              {state.accessActive ? (
                <button className="course-primary-btn" type="button" data-open-course={id} onClick={() => window.EduNex?.openCourse?.(course)}>
                  {primaryLabel} <i className="fas fa-arrow-right" aria-hidden="true"></i>
                </button>
              ) : (
                <a className="course-primary-btn" href={ctaHref(course)}>{primaryLabel} <i className="fas fa-arrow-right" aria-hidden="true"></i></a>
              )}
              <a className="course-secondary-btn" href="courses.html">Back to Courses</a>
              <ul className="course-side-list">
                <li><span>Category</span><strong>{categoryName(course)}</strong></li>
                {lessonCount(course) ? <li><span>Lessons</span><strong>{lessonCount(course)}</strong></li> : null}
                {course.totalStarted || course.learnerCount ? <li><span>Learners</span><strong>{Number(course.totalStarted || course.learnerCount).toLocaleString("en-IN")}</strong></li> : null}
                {course.totalWishlisted ? <li><span>Wishlisted</span><strong>{Number(course.totalWishlisted).toLocaleString("en-IN")}</strong></li> : null}
                <li><span>Access</span><strong>{state.accessActive ? "Active" : "Trial available"}</strong></li>
              </ul>
            </aside>
          </div>
          <div className="course-sections">
            {videos.length ? (
              <section className="course-section-card">
                <h2>Curriculum</h2>
                <div className="curriculum-list">
                  {videos.map((video, index) => (
                    <div className="curriculum-item" key={video._id || video.id || `${video.title}-${index}`}>
                      <span>{video.title || `Lesson ${index + 1}`}</span>
                      <small>{video.duration ? `${Math.max(1, Math.round(Number(video.duration) / 60))} min` : `Lesson ${index + 1}`}</small>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {course.notesUrl ? (
              <section className="course-section-card">
                <h2>Course Resources</h2>
                <p>Downloadable notes are available for this course after access is active.</p>
              </section>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
