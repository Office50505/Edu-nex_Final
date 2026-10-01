import { plainCourseDescription } from "../lib/courseDescription.js";
import { useEffect, useMemo, useState } from "react";
import { page as coursesPage } from "../generated-pages/courses.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";
import { courseEntryHref } from "../lib/courseNavigation.js";
import { route } from "../lib/routes.js";

function normalizeAccessPhase(data, localAccess = false) {
  const status = String(data?.subscriptionDocStatus || data?.status || data?.subscriptionStatus || "").trim().toLowerCase();
  const grace = Boolean(data?.grace || String(data?.entitlementState || "").toUpperCase() === "GRACE_PERIOD");
  const paid = ["active", "subscribed"].includes(status) || grace;
  const trialExpiry = data?.trialExpiresAt ? new Date(data.trialExpiresAt).getTime() : 0;
  const activeTrial = ["trial", "1rs trial"].includes(status) && (!trialExpiry || trialExpiry > Date.now()) && !paid;
  if (paid || (localAccess && !activeTrial)) return "full";
  if (activeTrial) return "trial";
  return localAccess ? "full" : "none";
}

function coursesArray(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.courses)) return response.courses;
  return [];
}

function localWishlist() {
  try {
    return new Set(JSON.parse(localStorage.getItem("edunexWishlistLocal") || "[]").map(String));
  } catch (_) {
    return new Set();
  }
}

function saveLocalWishlist(ids) {
  localStorage.setItem("edunexWishlistLocal", JSON.stringify(Array.from(ids)));
}

function courseId(course) {
  return String(course?._id || course?.id || window.EduNex?.courseId?.(course) || "");
}

function WishlistHeartIcon({ filled }) {
  return (
    <svg className="wishlist-heart-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function hasLocalCourseAccess() {
  try {
    const marker = JSON.parse(localStorage.getItem("edunexHasCourseAccess") || "null");
    return Boolean(marker?.active && Date.now() - Number(marker.savedAt || 0) < 24 * 60 * 60 * 1000);
  } catch (_) {
    return false;
  }
}

function normalizeCourse(course) {
  const id = courseId(course);
  return {
    ...course,
    id,
    title: course.title || "Untitled course",
    description: plainCourseDescription(course.description) || "Build practical AI skills with guided lessons and projects.",
    categoryName: window.EduNex?.courseCategory?.(course) || (typeof course.category === "string" ? course.category : course.category?.name) || "Course",
    image: window.EduNex?.courseImage?.(course) || course.thumbnail || course.image || "",
    lessonCount: Array.isArray(course.videos) ? course.videos.length : 0,
    rating: course.rating || course.averageRating || "4.8",
  };
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

function groupCourses(courses) {
  const groups = new Map();
  courses.forEach((course) => {
    const key = course.categoryName || "AI Skills";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(course);
  });
  return Array.from(groups.entries());
}

const PLANNED_COURSES = [
  "AI Film Making",
  "AI Video Ads for Business",
  "AI Photography & Product Shoots",
  "AI Music & Songs",
  "AI Cartoon & Animation",
  "Create Your Own AI Bot",
  "Build Websites & Apps with AI",
  "AI Automation",
  "How to Earn Money with AI",
  "Faceless YouTube Channel with AI",
  "AI for Your Business",
  "ChatGPT Masterclass",
  "AI Voice & Dubbing",
  "Top AI Tools Every Month",
];

function PreviewCourseCard({ title, subtitle, badge, image, variant, onOpen }) {
  return (
    <button
      className={`course-card course-preview-card course-preview-card--${variant}`}
      type="button"
      onClick={onOpen}
      aria-label={title}
    >
      <div className="course-thumb-wrap">
        {image ? <img className="course-thumb" src={image} alt="" aria-hidden="true" /> : <div className="course-preview-fallback" aria-hidden="true" />}
        <span className="course-cat-badge badge-agency">{badge}</span>
        <span className="course-preview-lock">{variant === "locked" ? "Locked" : "Coming soon"}</span>
      </div>
      <div className="course-body">
        <h3 className="course-title-main">{title}</h3>
        <div className="course-author-line">{subtitle}</div>
        <div className="course-stats">
          <div className="stat-item"><i className="fas fa-clock" aria-hidden="true"></i> Self paced</div>
          <div className="stat-item"><i className="fas fa-star star-icon" aria-hidden="true"></i> Skillomate</div>
        </div>
        <div className="course-card-actions">
          <span className="btn-trial course-preview-cta">{variant === "locked" ? "Pay to unlock" : "Notify me"}</span>
        </div>
      </div>
    </button>
  );
}

function initialCourseFilters() {
  const params = new URLSearchParams(window.location.search);
  const search = params.get("search") || params.get("q") || "";
  return { search };
}

export function CoursesPage() {
  const initialFilters = initialCourseFilters();
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState(initialFilters.search);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [accessPhase, setAccessPhase] = useState("none");
  const [courseAccessIds, setCourseAccessIds] = useState(() => new Set());
  const [wishlist, setWishlist] = useState(() => localWishlist());
  const [state, setState] = useState("loading");
  const [previewModal, setPreviewModal] = useState(null);
  const runtimeReady = useEduNexRuntimeReady();

  usePageStyle("react-page-style-courses", coursesPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...coursesPage,
    scripts: coursesPage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    document.title = coursesPage.title;
    document.documentElement.lang = coursesPage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  const hydrateCourseAccess = async () => {
    const localAccess = hasLocalCourseAccess();
    if (!window.EduNex?.getAccessToken?.()) {
      setHasAccess(localAccess);
      setAccessPhase(localAccess ? "full" : "none");
      setCourseAccessIds(new Set());
      return localAccess;
    }
    setHasAccess(localAccess);
    try {
      const data = await window.EduNex.authRequest("/api/payment/subscription-status");
      const purchasedIds = new Set((data?.courseIds || data?.courseEntitlements?.map((item) => item.courseId) || []).map(String));
      const phase = normalizeAccessPhase(data, localAccess);
      const active = phase === "full" || localAccess;
      setHasAccess(active);
      setAccessPhase(phase);
      setCourseAccessIds(purchasedIds);
      return active;
    } catch (_) {
      setHasAccess(localAccess);
      setAccessPhase(localAccess ? "full" : "none");
      setCourseAccessIds(new Set());
      return localAccess;
    }
  };

  const hydrateWishlist = async () => {
    const next = localWishlist();
    if (window.EduNex?.getAccessToken?.()) {
      try {
        const data = await window.EduNex.authRequest("/api/wishlist");
        (data?.courses || data?.courseIds || []).forEach((id) => next.add(String(id?._id || id)));
        saveLocalWishlist(next);
      } catch (_) {}
    }
    setWishlist(new Set(next));
    return next;
  };

  const loadBackendCourses = async () => {
    setState("loading");
    try {
      await Promise.all([hydrateCourseAccess(), hydrateWishlist()]);
      const data = await window.EduNex.request("/api/courses");
      setCourses(coursesArray(data).map(normalizeCourse));
      setState("ready");
    } catch (error) {
      console.error("Courses API failed", error);
      setState("error");
    }
  };

  useEffect(() => {
    if (!runtimeReady) return undefined;
    loadBackendCourses();
    const handlePageShow = () => {
      if (!courses.length) return;
      hydrateCourseAccess();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeReady]);

  const searchSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return courses
      .filter((course) => {
        if (!query) return true;
        return `${course.title} ${course.description} ${course.categoryName}`.toLowerCase().includes(query);
      })
      .map((course) => ({
        id: course.id,
        title: course.title,
        categoryName: course.categoryName,
      }))
      .filter((course, index, rows) => rows.findIndex((row) => row.title.toLowerCase() === course.title.toLowerCase()) === index)
      .slice(0, 7);
  }, [courses, search]);
  const showSearchSuggestions = suggestionsOpen && searchSuggestions.length > 0;
  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return courses.filter((course) => !query || `${course.title} ${course.description} ${course.categoryName}`.toLowerCase().includes(query));
  }, [courses, search]);
  const firstVisibleCourseId = filteredCourses[0]?.id || "";

  const toggleWishlist = async (courseId) => {
    if (!courseId) return;
    const id = String(courseId);
    const next = new Set(wishlist);
    const currentlySaved = next.has(id);
    if (currentlySaved) next.delete(id);
    else next.add(id);
    setWishlist(next);
    saveLocalWishlist(next);
    if (!window.EduNex?.getAccessToken?.()) return;
    try {
      const data = await window.EduNex.authRequest("/api/wishlist", {
        method: currentlySaved ? "DELETE" : "POST",
        body: JSON.stringify({ courseId: id }),
      });
      if (Array.isArray(data?.courses)) {
        const synced = new Set(data.courses.map(String));
        setWishlist(synced);
        saveLocalWishlist(synced);
      }
    } catch (_) {}
  };

  const canOpenCourse = (course) => accessPhase === "full" || courseAccessIds.has(course.id) || (accessPhase === "trial" && course.id === firstVisibleCourseId);

  const openCourse = (course) => {
    window.location.href = courseEntryHref(course, { hasAccess: canOpenCourse(course) });
  };

  const groupedCourseRows = useMemo(() => groupCourses(filteredCourses), [filteredCourses]);
  const previewImage = filteredCourses[0]?.image || "";

  const updateSearch = (value) => {
    setSearch(value);
  };

  const selectSearchSuggestion = (title) => {
    setSearch(title);
    setSuggestionsOpen(false);
  };

  return (
    <div className="react-page-root" data-page="courses.html">
      <style>{`
        @media (min-width: 901px) {
          .react-page-root[data-page="courses.html"] .search-section .container,
          .react-page-root[data-page="courses.html"] .curriculum-section .container,
          .react-page-root[data-page="courses.html"] .path-section .container {
            max-width: 1120px !important;
            margin-inline: auto !important;
          }
          .react-page-root[data-page="courses.html"] .courses-grid {
            display: grid !important;
            grid-template-columns: repeat(3, 368px) !important;
            justify-content: start !important;
            align-items: stretch !important;
            gap: 24px !important;
          }
          .react-page-root[data-page="courses.html"] .course-card {
            width: 368px !important;
            max-width: 368px !important;
            min-height: 430px !important;
          }
          .react-page-root[data-page="courses.html"] .course-thumb-wrap {
            aspect-ratio: 16 / 9 !important;
          }
        }
        @media (min-width: 901px) and (max-width: 1280px) {
          .react-page-root[data-page="courses.html"] .courses-grid {
            grid-template-columns: repeat(2, minmax(320px, 368px)) !important;
          }
          .react-page-root[data-page="courses.html"] .course-card {
            width: 100% !important;
            max-width: 368px !important;
          }
        }
        .react-page-root[data-page="courses.html"] .course-preview-card {
          appearance: none;
          border: 1px solid rgba(255, 182, 38, 0.22);
          color: inherit;
          text-align: left;
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }
        .react-page-root[data-page="courses.html"] .course-preview-card .course-thumb,
        .react-page-root[data-page="courses.html"] .course-preview-fallback {
          filter: blur(7px) saturate(0.72) brightness(0.68);
          transform: scale(1.04);
        }
        .react-page-root[data-page="courses.html"] .course-preview-fallback {
          width: 100%;
          height: 100%;
          background: radial-gradient(circle at 30% 30%, rgba(218, 155, 39, 0.52), transparent 34%), linear-gradient(135deg, #1a1610, #050505);
        }
        .react-page-root[data-page="courses.html"] .course-preview-lock {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 132px;
          min-height: 44px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.72);
          border: 1px solid rgba(255, 182, 38, 0.58);
          color: #fff;
          font-weight: 900;
          letter-spacing: 0.02em;
          backdrop-filter: blur(10px);
        }
        .react-page-root[data-page="courses.html"] .course-preview-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          pointer-events: none;
        }
        .react-page-root[data-page="courses.html"] .course-preview-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(0, 0, 0, 0.72);
          backdrop-filter: blur(8px);
        }
        .react-page-root[data-page="courses.html"] .course-preview-modal {
          width: min(420px, 100%);
          border-radius: 22px;
          border: 1px solid rgba(255, 182, 38, 0.24);
          background: #111;
          padding: 24px;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5);
        }
        .react-page-root[data-page="courses.html"] .course-preview-modal h3 {
          margin: 0;
          color: #fff;
          font-size: 24px;
          line-height: 1.1;
        }
        .react-page-root[data-page="courses.html"] .course-preview-modal p {
          margin: 12px 0 20px;
          color: rgba(255, 255, 255, 0.72);
          line-height: 1.55;
        }
        .react-page-root[data-page="courses.html"] .course-preview-modal-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .react-page-root[data-page="courses.html"] .course-preview-modal-actions button,
        .react-page-root[data-page="courses.html"] .course-preview-modal-actions a {
          min-height: 46px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          text-decoration: none;
        }
        .react-page-root[data-page="courses.html"] .course-preview-modal-actions button {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }
        .react-page-root[data-page="courses.html"] .course-preview-modal-actions a {
          background: #d59623;
          color: #050505;
        }
      `}</style>
      <section className="search-section">
        <div className="container">
          <h1 className="sr-only">Explore Courses</h1>
          <div className="search-bar-wrap">
            <div className="search-input-wrap">
              <i className="fas fa-search" aria-hidden="true"></i>
              <input
                type="text"
                placeholder="Search for AI skills..."
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                aria-autocomplete="list"
                aria-controls="courses-search-suggestions"
                aria-expanded={showSearchSuggestions}
              />
              {showSearchSuggestions ? (
                <div className="course-search-suggestions" id="courses-search-suggestions" role="listbox" aria-label="Uploaded course suggestions">
                  {searchSuggestions.map((suggestion) => (
                    <button
                      className="course-search-suggestion"
                      type="button"
                      role="option"
                      key={suggestion.id || suggestion.title}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSearchSuggestion(suggestion.title)}
                    >
                      <span>{suggestion.title}</span>
                      <small>{suggestion.categoryName}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="curriculum-section">
        <div className="container">
          {state === "loading" ? (
            <div className="category-block">
              <div className="section-header">
                <div className="section-header-left">
                  <h2>Loading courses...</h2>
                  <p>Fetching the latest Skillomate catalogue.</p>
                </div>
              </div>
            </div>
          ) : null}
          {state === "error" ? (
            <div className="category-block">
              <div className="section-header">
                <div className="section-header-left">
                  <h2>We couldn't load courses right now.</h2>
                  <p>Please try again in a moment.</p>
                  <button className="btn-trial" type="button" id="coursesRetryBtn" onClick={loadBackendCourses}>Retry</button>
                </div>
              </div>
            </div>
          ) : null}
          {state === "ready" && !filteredCourses.length ? (
            <div className="category-block">
              <div className="section-header">
                <div className="section-header-left">
                  <h2>No courses found</h2>
                  <p>Try another search or check back after courses are published.</p>
                </div>
              </div>
            </div>
          ) : null}
          {state === "ready" ? groupedCourseRows.map(([group, rows], groupIndex) => (
            <div className="category-block" key={group}>
              <div className="section-header">
                <div className="section-header-left">
                  <h2>{group}</h2>
                  <p>Real courses published from the Skillomate backend</p>
                </div>
              </div>
              <div className="courses-grid">
                {rows.map((course) => {
                  const duration = course.duration || (course.lessonCount ? `${course.lessonCount} Lessons` : "Self paced");
                  const saved = wishlist.has(course.id);
                  const canOpen = canOpenCourse(course);
                  const lockedByTrial = accessPhase === "trial" && !canOpen;
                  const buttonLabel = lockedByTrial ? "Locked" : canOpen ? "View Course" : "Start ₹499";
                  return (
                    <div
                      className={`course-card${hasAccess ? " has-access" : ""}${lockedByTrial ? " is-trial-locked" : ""}`}
                      data-course-card-id={course.id}
                      data-title={course.title.toLowerCase()}
                      data-category={course.categoryName.toLowerCase()}
                      role="link"
                      tabIndex={0}
                      key={course.id}
                      aria-disabled={lockedByTrial}
                      onClick={() => { if (!lockedByTrial) openCourse(course); }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        if (!lockedByTrial) openCourse(course);
                      }}
                    >
                      <div className="course-thumb-wrap">
                        <img
                          className="course-thumb"
                          src={course.image}
                          alt={course.title}
                          onError={(event) => handleCourseImageError(event, course)}
                        />
                        <span className="course-cat-badge badge-agency">{course.categoryName}</span>
                        {lockedByTrial ? <span className="course-lock-badge">Locked until AutoPay starts</span> : null}
                      </div>
                      <div className="course-body">
                        <h3 className="course-title-main">{course.title}</h3>
                        <div className="course-author-line">by <span>Skillomate AI Mentors</span></div>
                        <div className="course-stats">
                          <div className="stat-item"><i className="fas fa-clock" aria-hidden="true"></i> {duration}</div>
                          <div className="stat-item"><i className="fas fa-star star-icon" aria-hidden="true"></i> {course.rating}</div>
                        </div>
                        <div className="course-price-row">
                          <div className="price-left">
                            <span className="price-trial">₹499</span>
                          </div>
                        </div>
                        <div className="course-card-actions">
                          <button className="btn-trial" type="button" data-course-id={course.id} disabled={lockedByTrial} onClick={(event) => { event.stopPropagation(); if (!lockedByTrial) openCourse(course); }}>
                            {buttonLabel}
                          </button>
                          <button
                            className={`wishlist-btn${saved ? " is-saved" : ""}`}
                            type="button"
                            data-wishlist-id={course.id}
                            aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
                            aria-pressed={saved}
                            onPointerDown={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleWishlist(course.id);
                            }}
                          >
                            <WishlistHeartIcon filled={saved} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {groupIndex === 0 ? (
                  <>
                    {PLANNED_COURSES.map((title, index) => (
                      <PreviewCourseCard
                        title={title}
                        subtitle="New lessons are being prepared."
                        badge={index < 5 ? "CREATIVE AI" : index < 8 ? "BUILD WITH AI" : index < 12 ? "AI CAREER" : "DAILY AI"}
                        image={previewImage}
                        variant="soon"
                        onOpen={() => setPreviewModal("soon")}
                        key={title}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            </div>
          )) : null}
        </div>
      </section>

      {state === "ready" ? <section className="path-section">
        <div className="container">
          <div className="path-header">
            <h2>Your Path to Mastery</h2>
            <p>We've simplified the journey from zero to AI-pro. Join thousands of Indians who have pivoted their careers in just 7 days.</p>
          </div>
          <div className="steps-grid">
            {[
              ["1", "Start for ₹499", "Get Skillomate access for ₹499."],
              ["2", "Learn at your pace", "Follow structured lessons, projects and AI-assisted learning support."],
              ["3", "Track progress", "Use course progress, wishlists and certificates to organize your learning."],
              ["4", "Apply your skills", "Practice the concepts in your own projects, work, content or business."],
            ].map(([num, title, copy]) => (
              <div className="step-item" key={num}>
                <div className="step-num">{num}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section> : null}
      {previewModal ? (
        <div className="course-preview-modal-backdrop" role="presentation" onMouseDown={() => setPreviewModal(null)}>
          <div className="course-preview-modal" role="dialog" aria-modal="true" aria-labelledby="coursePreviewTitle" onMouseDown={(event) => event.stopPropagation()}>
            <h3 id="coursePreviewTitle">{previewModal === "locked" ? "Unlock the next course" : "Coming soon"}</h3>
            <p>
              {previewModal === "locked"
                ? "This course opens after your AutoPay mandate starts, or you can pay upfront to unlock full access right away."
                : "This course is in the upcoming Skillomate roadmap. We will open it once the lessons are ready."}
            </p>
            <div className="course-preview-modal-actions">
              <button type="button" onClick={() => setPreviewModal(null)}>Close</button>
              {previewModal === "locked" ? <a href={route("payment.html?plan=monthly")}>Pay to unlock</a> : <button type="button" onClick={() => setPreviewModal(null)}>Okay</button>}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
