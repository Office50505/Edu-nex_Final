import { useEffect, useMemo, useState } from "react";
import { page as coursesPage } from "../generated-pages/courses.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";

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
    description: course.description || "Build practical AI skills with guided lessons and projects.",
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
    const driveUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`;
    return `/api/image-proxy?url=${encodeURIComponent(driveUrl)}`;
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

function courseVideoHref(course) {
  const id = String(course?.id || course?._id || "");
  return id ? `/videos.html?courseId=${encodeURIComponent(id)}&video=0` : "/courses.html";
}

function initialCourseFilters() {
  const params = new URLSearchParams(window.location.search);
  const search = params.get("search") || params.get("q") || "";
  const category = params.get("category") || "all";
  return {
    search,
    category: search ? "all" : category.toLowerCase(),
  };
}

function uniqueLabels(values) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function CoursesPage() {
  const initialFilters = initialCourseFilters();
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState(initialFilters.search);
  const [category, setCategory] = useState(initialFilters.category);
  const [hasAccess, setHasAccess] = useState(false);
  const [wishlist, setWishlist] = useState(() => localWishlist());
  const [state, setState] = useState("loading");
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
      return localAccess;
    }
    setHasAccess(localAccess);
    try {
      const data = await window.EduNex.authRequest("/api/payment/subscription-status");
      const active = window.EduNex?.hasCourseAccess?.(data) || localAccess;
      setHasAccess(active);
      return active;
    } catch (_) {
      setHasAccess(localAccess);
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

  const categories = useMemo(() => Array.from(new Set(courses.map((course) => course.categoryName))).filter(Boolean), [courses]);
  const searchSuggestions = useMemo(() => uniqueLabels([
    ...courses.map((course) => course.title),
    ...courses.map((course) => course.categoryName),
  ]), [courses]);
  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return courses.filter((course) => {
      const textMatch = !query || `${course.title} ${course.description} ${course.categoryName}`.toLowerCase().includes(query);
      const categoryMatch = category === "all" || course.categoryName.toLowerCase() === category;
      return textMatch && categoryMatch;
    });
  }, [category, courses, search]);

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

  const openCourse = (course) => {
    if (hasAccess) {
      window.location.href = courseVideoHref(course);
      return;
    }
    window.EduNex?.openCourseDetails?.(course);
  };

  const updateSearch = (value) => {
    setSearch(value);
    if (value.trim()) setCategory("all");
  };

  const selectCategory = (value) => {
    setCategory(value);
    setSearch("");
  };

  return (
    <div className="react-page-root" data-page="courses.html">
      <section className="search-section">
        <div className="container">
          <h1 className="sr-only">Explore Courses</h1>
          <div className="search-bar-wrap">
            <div className="search-input-wrap">
              <i className="fas fa-search" aria-hidden="true"></i>
              <input
                type="text"
                list="courses-search-suggestions"
                placeholder="Search for AI skills..."
                value={search}
                onChange={(event) => updateSearch(event.target.value)}
              />
              <datalist id="courses-search-suggestions">
                {searchSuggestions.map((suggestion) => <option value={suggestion} key={suggestion} />)}
              </datalist>
            </div>
            <div className="filter-pills">
              <button className={`pill${category === "all" ? " active" : ""}`} type="button" data-category="all" onClick={() => selectCategory("all")}>All Courses</button>
              {categories.length ? categories.map((name) => (
                <button className={`pill${category === name.toLowerCase() ? " active" : ""}`} type="button" data-category={name.toLowerCase()} key={name} onClick={() => selectCategory(name.toLowerCase())}>{name}</button>
              )) : ["AI Freelancing", "Prompt Engineering", "Automation Agency", "UGC Creation"].map((name) => (
                <button className="pill" type="button" key={name} onClick={() => selectCategory(name.toLowerCase())}>{name}</button>
              ))}
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
          {state === "ready" ? groupCourses(filteredCourses).map(([group, rows]) => (
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
                  return (
                    <div
                      className={`course-card${hasAccess ? " has-access" : ""}`}
                      data-course-card-id={course.id}
                      data-title={course.title.toLowerCase()}
                      data-category={course.categoryName.toLowerCase()}
                      role="link"
                      tabIndex={0}
                      key={course.id}
                      onClick={() => openCourse(course)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        openCourse(course);
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
                            <span className="price-original">₹4,999</span>
                            <span className="price-trial">₹1 Trial</span>
                          </div>
                          <span className="price-off">99% OFF</span>
                        </div>
                        <div className="course-card-actions">
                          <button className="btn-trial" type="button" data-course-id={course.id} onClick={(event) => { event.stopPropagation(); openCourse(course); }}>
                            {hasAccess ? "View Course" : "Start ₹1 Trial"}
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
              </div>
            </div>
          )) : null}
        </div>
      </section>

      <section className="path-section">
        <div className="container">
          <div className="path-header">
            <h2>Your Path to Mastery</h2>
            <p>We've simplified the journey from zero to AI-pro. Join thousands of Indians who have pivoted their careers in just 7 days.</p>
          </div>
          <div className="steps-grid">
            {[
              ["1", "Claim ₹1 Trial", "Get instant access to any foundation course for just ₹1. No hidden commitments."],
              ["2", "7-Day Sprint", "Complete the 'First Profit' framework and join our community of 12k+ achievers."],
              ["3", "Upgrade to Pro", "Unlock advanced scaling modules and 1-on-1 mentorship after your trial."],
              ["4", "Launch & Earn", "Apply the skills to land your first high-ticket international client or automate your biz."],
            ].map(([num, title, copy]) => (
              <div className="step-item" key={num}>
                <div className="step-num">{num}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
