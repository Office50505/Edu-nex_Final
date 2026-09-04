import { useEffect, useMemo, useRef, useState } from "react";
import { page as indexPage } from "../generated-pages/index.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";

const FALLBACK_COURSES = [
  ["fallback-video-editing", "Video Editing Mastery", "Video Editing", 22, "4.8", 12500, 499],
  ["fallback-ai-tools", "AI Tools for Creators", "AI Tools", 18, "4.7", 9800, 399],
  ["fallback-freelancing", "Freelancing Blueprint", "Freelancing", 20, "4.7", 8700, 399],
  ["fallback-digital-marketing", "Digital Marketing Essentials", "Digital Marketing", 24, "4.6", 9300, 499],
  ["fallback-web-development", "Web Development Bootcamp", "Web Development", 32, "4.8", 15200, 699],
  ["fallback-business", "Business Growth Strategy", "Business", 20, "4.7", 6400, 499],
].map(([id, title, category, lessons, rating, learners, price]) => ({
  _id: id,
  isFallback: true,
  title,
  category,
  instructorName: "EduNex Mentors",
  language: "Hindi + English",
  duration: `${lessons} lessons`,
  averageRating: rating,
  learnerCount: learners,
  price,
  videos: Array.from({ length: lessons }, (_, index) => ({ title: `Lesson ${index + 1}` })),
}));

const TOPICS = ["Video Editing", "AI Tools", "Freelancing", "Digital Marketing", "Web Development", "Business"];

function courseId(course) {
  return String(course?._id || course?.id || "");
}

function courseVideoHref(course, videoIndex = 0) {
  const id = courseId(course);
  return id ? `videos.html?courseId=${encodeURIComponent(id)}&video=${Math.max(0, Number(videoIndex) || 0)}` : "courses.html";
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

function hasLocalCourseAccess() {
  try {
    const marker = JSON.parse(localStorage.getItem("edunexHasCourseAccess") || "null");
    return Boolean(marker?.active && Date.now() - Number(marker.savedAt || 0) < 24 * 60 * 60 * 1000);
  } catch (_) {
    return false;
  }
}

function categoryName(course) {
  return typeof course?.category === "string"
    ? course.category
    : (course?.category?.name || course?.category?.title || "Course");
}

function categoryHref(category) {
  return `courses.html?category=${encodeURIComponent(category)}`;
}

function lessonCount(course) {
  return Array.isArray(course?.videos) ? course.videos.length : 0;
}

function progressFor(course) {
  const id = courseId(course);
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(`edunexCourseProgress:${id}`) || "{}");
  } catch (_) {
    saved = {};
  }
  const total = Math.max(lessonCount(course), 1);
  const completed = Number(saved.completed || 0);
  const percent = Math.max(0, Math.min(100, Number(saved.percent ?? Math.round((completed / total) * 100))));
  const lessonIndex = Math.max(0, Math.min(Number(saved.lessonIndex || 0), total - 1));
  return { total, completed, percent, lessonIndex, hasProgress: Boolean(saved.percent || saved.completed || saved.lessonIndex) };
}

function instructorName(course) {
  return course?.instructor?.name || course?.instructorName || course?.author || "EduNex AI Mentors";
}

function languageLabel(course) {
  return course?.language || course?.courseLanguage || "Hindi + English";
}

function durationLabel(course) {
  return course?.duration || (lessonCount(course) ? `${lessonCount(course)} lessons` : "Self paced");
}

function ratingLabel(course) {
  return course?.averageRating || course?.rating || "4.8";
}

function learnerLabel(course) {
  const count = course?.learnerCount || course?.enrolledCount || course?.students || course?.studentsCount;
  return count ? `${Number(count).toLocaleString("en-IN")} learners` : "100K+ learners";
}

function priceLabel(course) {
  return course?.price && Number(course.price) > 1 ? `₹${Number(course.price).toLocaleString("en-IN")}` : "₹1 Trial";
}

function groupedCategories(courses) {
  const grouped = new Map();
  courses.forEach((course) => {
    const name = categoryName(course);
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(course);
  });
  return Array.from(grouped.entries());
}

function enrolledItems(courses) {
  return courses
    .map((course) => ({ course, progress: progressFor(course) }))
    .filter((item) => item.progress.hasProgress && item.progress.percent > 0)
    .sort((a, b) => b.progress.percent - a.progress.percent);
}

function pathItem(courses) {
  const best = groupedCategories(courses).sort((a, b) => b[1].length - a[1].length)[0];
  if (!best) return null;
  return { type: "path", category: best[0], courses: best[1], course: best[1][0] };
}

function itemsForTab(tab, courses) {
  const enrolled = enrolledItems(courses);
  if (tab === "my-courses") {
    return enrolled.map((item) => ({ type: "enrolled", course: item.course, progress: item.progress }));
  }
  if (tab === "for-you") {
    const seen = new Set();
    const items = [];
    enrolled.slice(0, 2).forEach((item) => {
      seen.add(courseId(item.course));
      items.push({ type: "enrolled", course: item.course, progress: item.progress });
    });
    courses.forEach((course, index) => {
      if (items.length >= 4) return;
      const id = courseId(course);
      if (seen.has(id)) return;
      seen.add(id);
      items.push({ type: index < 2 ? "recommended" : "popular", course });
    });
    const path = pathItem(courses);
    if (path && !seen.has(courseId(path.course))) items.push(path);
    return items;
  }
  return courses.slice(0, 8).map((course) => ({ type: "trending", course }));
}

function repeatedItems(items, minimum = 7) {
  if (!items.length) return { baseCount: 0, rows: [] };
  const baseCount = Math.max(minimum, items.length);
  const base = Array.from({ length: baseCount }, (_, index) => items[index % items.length]);
  return {
    baseCount,
    rows: Array.from({ length: baseCount * 3 }, (_, index) => ({
      ...base[index % baseCount],
      loopIndex: index,
      loopSourceIndex: index % baseCount,
    })),
  };
}

function MaterialIcon({ children, className = "" }) {
  return <span className={`material-symbols-outlined${className ? ` ${className}` : ""}`}>{children}</span>;
}

function preventNativeDrag(event) {
  event.preventDefault();
}

function HeroPlaceholderCard({ index, isCenter, tab }) {
  const sourceIndex = index % 7;
  const isMessageCard = sourceIndex === 3;
  const title = tab === "my-courses" ? "You haven't started a course yet." : "No courses available right now.";
  const action = tab === "my-courses" ? "Explore Courses" : "Browse Courses";
  return (
    <article
      className={`hero-course-card hero-placeholder-card${isCenter ? " is-center" : ""}`}
      role="link"
      tabIndex={isCenter ? 0 : -1}
      aria-current={isCenter ? "true" : "false"}
      aria-label="Open courses page"
      data-hero-index={index}
      onClick={(event) => {
        if (event.target.closest("a, button")) return;
        window.location.href = "courses.html";
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        window.location.href = "courses.html";
      }}
    >
      <div className="hero-card-media" onClick={(event) => {
        if (event.target.closest("a, button")) return;
        event.stopPropagation();
        openFromCard();
      }}>
        <span className="hero-skeleton hero-skeleton-media"></span>
        <span className="hero-card-badge">{isMessageCard ? "Course grid" : "EduNex"}</span>
      </div>
      <div className="hero-card-body" onClick={(event) => {
        if (event.target.closest("a, button")) return;
        event.stopPropagation();
        openFromCard();
      }}>
        {isMessageCard ? (
          <>
            <div className="hero-card-kicker">Courses</div>
            <div className="hero-card-title">{title}</div>
            <div className="hero-placeholder-note">Real EduNex courses will appear in this carousel as soon as the backend returns them.</div>
            <div style={{ marginTop: 16 }}>
              <a className="hero-card-action" href="courses.html">{action} <MaterialIcon className="text-base">arrow_forward</MaterialIcon></a>
            </div>
          </>
        ) : (
          <>
            <span className="hero-skeleton hero-skeleton-kicker"></span>
            <span className="hero-skeleton hero-skeleton-title"></span>
            <span className="hero-skeleton hero-skeleton-title short"></span>
            <span className="hero-skeleton hero-skeleton-line"></span>
            <span className="hero-skeleton hero-skeleton-line medium"></span>
          </>
        )}
      </div>
    </article>
  );
}

function HeroCourseCard({ item, index, isCenter, hasAccess, isSaved, onOpen, onContinue, onPath, onSuppressibleClick, onToggleWishlist }) {
  const course = item.course || {};
  const progress = item.progress || progressFor(course);
  const id = courseId(course);
  const title = item.type === "path" ? `${item.category} Learning Path` : (course.title || "Untitled course");
  const category = item.type === "path" ? "Learning Path" : categoryName(course);
  const image = window.EduNex?.courseImage?.(course) || course.thumbnail || course.image || "";
  const label = item.type === "enrolled" ? "Continue Learning" : (item.type === "path" ? "Suggested Path" : category);
  const lessonTitle = course.videos?.[progress.lessonIndex]?.title || `Lesson ${progress.lessonIndex + 1} of ${progress.total}`;
  const href = item.type === "path"
    ? categoryHref(item.category || category)
    : item.type === "enrolled"
      ? courseVideoHref(course, progress.lessonIndex)
      : hasAccess
        ? courseVideoHref(course)
        : `course.html?id=${encodeURIComponent(id)}`;

  const openFromCard = () => {
    if (item.type === "path") onPath(item.category || category);
    else if (id) onOpen(course);
  };

  return (
    <article
      className={`hero-course-card${isCenter ? " is-center" : ""}`}
      tabIndex={0}
      role="link"
      data-hero-index={index}
      data-hero-id={item.type === "path" ? undefined : id}
      data-hero-path={item.type === "path" ? item.category : undefined}
      aria-current={isCenter ? "true" : "false"}
      aria-label={title}
      onClick={(event) => {
        if (event.target.closest("a, button")) return;
        if (onSuppressibleClick()) return;
        openFromCard();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openFromCard();
      }}
    >
      <div className="hero-card-media">
        <a href={href} aria-label={title} style={{ display: "block", height: "100%" }} onClick={(event) => event.stopPropagation()}>
          <img
            src={image}
            alt={title}
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = window.EduNex?.placeholderImage?.(event.currentTarget.alt || "EduNex") || "";
            }}
          />
        </a>
        <span className="hero-card-badge">{label}</span>
      </div>
      <div className="hero-card-body">
        <a className="hero-card-title" href={href} onClick={(event) => event.stopPropagation()}>{title}</a>
        {item.type === "enrolled" ? (
          <>
            <div className="hero-card-lesson">
              <span><i className="fas fa-play-circle" aria-hidden="true"></i> {lessonTitle}</span>
              <span>Lesson {progress.lessonIndex + 1} of {progress.total}</span>
            </div>
            <div className="hero-progress-row"><span>{progress.percent}% Complete</span><span>Continue</span></div>
            <div className="hero-progress-track" style={{ "--progress": `${progress.percent}%` }}><span></span></div>
            <div className="hero-card-price"><strong>In progress</strong></div>
            <div className="hero-card-actions">
              <button className="hero-card-primary" type="button" onClick={(event) => {
                event.stopPropagation();
                if (!onSuppressibleClick()) onContinue(course);
              }}>
                Continue Course
              </button>
              <button
                className={`hero-card-wish${isSaved ? " is-saved" : ""}`}
                type="button"
                aria-label={isSaved ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={isSaved}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!onSuppressibleClick()) onToggleWishlist(course);
                }}
              >
                <i className={`${isSaved ? "fas" : "far"} fa-heart`} aria-hidden="true"></i>
              </button>
            </div>
          </>
        ) : item.type === "path" ? (
          <>
            <div className="hero-card-meta">
              <span><i className="fas fa-layer-group" aria-hidden="true"></i> {item.courses?.length || 1} courses</span>
              <span><i className="fas fa-play-circle" aria-hidden="true"></i> {lessonCount(course) || "Real"} lessons</span>
              <span><i className="fas fa-language" aria-hidden="true"></i> {languageLabel(course)}</span>
            </div>
            <div className="hero-card-price"><strong>Learning path</strong></div>
            <div className="hero-card-actions is-single">
              <button className="hero-card-primary" type="button" onClick={(event) => {
                event.stopPropagation();
                if (!onSuppressibleClick()) onPath(item.category || category);
              }}>
                Explore Path
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="hero-card-author">by <span>{instructorName(course)}</span></div>
            <div className="hero-card-meta">
              <span><i className="fas fa-star" aria-hidden="true"></i> {ratingLabel(course)}</span>
              <span><i className="fas fa-users" aria-hidden="true"></i> {learnerLabel(course)}</span>
              <span><i className="fas fa-play-circle" aria-hidden="true"></i> {lessonCount(course) || "Real"} lessons</span>
              <span><i className="fas fa-clock" aria-hidden="true"></i> {durationLabel(course)}</span>
              <span><i className="fas fa-language" aria-hidden="true"></i> {languageLabel(course)}</span>
            </div>
            <div className="hero-card-price"><strong>{priceLabel(course)}</strong></div>
            <div className="hero-card-actions">
              <button className="hero-card-primary" type="button" onClick={(event) => {
                event.stopPropagation();
                if (!onSuppressibleClick()) onOpen(course);
              }}>
                {hasAccess ? "View Course" : "Start ₹1 Trial"}
              </button>
              <button
                className={`hero-card-wish${isSaved ? " is-saved" : ""}`}
                type="button"
                aria-label={isSaved ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={isSaved}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!onSuppressibleClick()) onToggleWishlist(course);
                }}
              >
                <i className={`${isSaved ? "fas" : "far"} fa-heart`} aria-hidden="true"></i>
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

export function HomePage() {
  const [courses, setCourses] = useState([]);
  const [hasAccess, setHasAccess] = useState(() => hasLocalCourseAccess());
  const [wishlist, setWishlist] = useState(() => localWishlist());
  const [activeTab, setActiveTab] = useState("trending");
  const [activeIndex, setActiveIndex] = useState(10);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("loading");
  const viewportRef = useRef(null);
  const rafRef = useRef(0);
  const motionRef = useRef(0);
  const lastFrameRef = useRef(0);
  const pauseRef = useRef(false);
  const directionRef = useRef(1);
  const pointerRef = useRef({ down: false, moved: false, startX: 0, startY: 0, startLeft: 0, suppressClickUntil: 0 });
  const runtimeReady = useEduNexRuntimeReady();

  usePageStyle("react-page-style-index", indexPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...indexPage,
    scripts: indexPage.scripts.filter((script) => script.src && script.src !== "js/main.js"),
  }), []);

  useEffect(() => {
    document.title = indexPage.title;
    document.documentElement.lang = indexPage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  useEffect(() => {
    if (!runtimeReady) return undefined;
    let cancelled = false;
    setStatus("loading");
    window.EduNex.request("/api/courses")
      .then((response) => {
        if (cancelled) return;
        const realCourses = coursesArray(response).filter((course) => course && course._id);
        setCourses(realCourses);
        setActiveTab(window.EduNex?.getUser?.() && enrolledItems(realCourses).length ? "my-courses" : "trending");
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setCourses(FALLBACK_COURSES);
        setActiveTab(window.EduNex?.getUser?.() && enrolledItems(FALLBACK_COURSES).length ? "my-courses" : "trending");
        setStatus("fallback");
      });
    return () => {
      cancelled = true;
    };
  }, [runtimeReady]);

  useEffect(() => {
    if (!runtimeReady) return undefined;
    let cancelled = false;
    const nextWishlist = localWishlist();
    const localAccess = hasLocalCourseAccess();
    const accessToken = window.EduNex?.getAccessToken?.();

    if (!accessToken) {
      setWishlist(nextWishlist);
      setHasAccess(localAccess);
      return undefined;
    }

    Promise.allSettled([
      window.EduNex.authRequest("/api/wishlist"),
      window.EduNex.authRequest("/api/payment/subscription-status"),
    ]).then(([wishlistResult, accessResult]) => {
      if (cancelled) return;
      if (wishlistResult.status === "fulfilled") {
        (wishlistResult.value?.courses || wishlistResult.value?.courseIds || []).forEach((id) => nextWishlist.add(String(id?._id || id)));
        saveLocalWishlist(nextWishlist);
      }
      setWishlist(new Set(nextWishlist));
      setHasAccess(accessResult.status === "fulfilled"
        ? Boolean(window.EduNex?.hasCourseAccess?.(accessResult.value) || localAccess)
        : localAccess);
    });

    return () => {
      cancelled = true;
    };
  }, [runtimeReady]);

  const currentItems = useMemo(() => itemsForTab(activeTab, courses), [activeTab, courses]);
  const loop = useMemo(() => repeatedItems(currentItems), [currentItems]);

  useEffect(() => {
    directionRef.current = 1;
    if (!loop.baseCount) {
      setActiveIndex(10);
      return;
    }
    setActiveIndex(loop.baseCount + (activeTab === "my-courses" ? 0 : Math.min(3, loop.baseCount - 1)));
  }, [activeTab, loop.baseCount]);

  const scrollToIndex = (index, behavior = "smooth") => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const cards = Array.from(viewport.querySelectorAll(".hero-course-card[data-hero-index]"));
    if (!cards.length) return;
    const nextIndex = Math.max(0, Math.min(index, cards.length - 1));
    setActiveIndex(nextIndex);
    const card = cards[nextIndex];
    const left = card.offsetLeft - ((viewport.clientWidth - card.offsetWidth) / 2);
    viewport.scrollTo({ left, behavior });
  };

  useEffect(() => {
    if (!loop.rows.length) return undefined;
    const id = requestAnimationFrame(() => scrollToIndex(activeIndex, "auto"));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop.rows.length]);

  const syncCenterFromScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const cards = Array.from(viewport.querySelectorAll(".hero-course-card[data-hero-index]"));
    if (!cards.length) return;
    const center = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
    let nearest = 0;
    let distance = Infinity;
    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const nextDistance = Math.abs(center - (rect.left + rect.width / 2));
      if (nextDistance < distance) {
        distance = nextDistance;
        nearest = index;
      }
    });
    setActiveIndex((current) => (current === nearest ? current : nearest));
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(syncCenterFromScroll);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafRef.current);
      viewport.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const tick = (timestamp) => {
      if (!lastFrameRef.current) lastFrameRef.current = timestamp;
      const delta = Math.min(64, timestamp - lastFrameRef.current);
      lastFrameRef.current = timestamp;
      if (loop.rows.length > 1 && !pauseRef.current && !document.hidden) {
        viewport.classList.add("is-auto-moving");
        const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
        if (maxScrollLeft > 0) {
          const step = delta * 0.035;
          let nextScrollLeft = viewport.scrollLeft + (step * directionRef.current);
          if (nextScrollLeft >= maxScrollLeft) {
            nextScrollLeft = Math.max(0, maxScrollLeft - (nextScrollLeft - maxScrollLeft));
            directionRef.current = -1;
          } else if (nextScrollLeft <= 0) {
            nextScrollLeft = Math.min(maxScrollLeft, -nextScrollLeft);
            directionRef.current = 1;
          }
          viewport.scrollLeft = nextScrollLeft;
        }
        syncCenterFromScroll();
      }
      motionRef.current = requestAnimationFrame(tick);
    };
    motionRef.current = requestAnimationFrame(tick);
    const onVisibility = () => { pauseRef.current = document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(motionRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      viewport.classList.remove("is-auto-moving");
      lastFrameRef.current = 0;
    };
  }, [loop.rows.length]);

  const handlePointerDown = (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (event.target.closest?.("input, textarea, select")) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    pointerRef.current = {
      down: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: viewport.scrollLeft,
      suppressClickUntil: pointerRef.current.suppressClickUntil,
    };
    pauseRef.current = true;
    viewport.classList.add("is-dragging");
  };

  const handlePointerMove = (event) => {
    const viewport = viewportRef.current;
    const pointer = pointerRef.current;
    if (!viewport || !pointer.down) return;
    const deltaX = event.clientX - pointer.startX;
    if (!pointer.moved && Math.abs(deltaX) <= 5) return;
    pointer.moved = true;
    if (!viewport.hasPointerCapture?.(event.pointerId)) viewport.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    viewport.scrollLeft = pointer.startLeft - deltaX;
  };

  const handlePointerEnd = (event) => {
    const viewport = viewportRef.current;
    const pointer = pointerRef.current;
    if (pointer.moved) pointer.suppressClickUntil = Date.now() + 250;
    pointer.down = false;
    if (viewport?.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    pauseRef.current = Boolean(viewport?.matches(":hover") || viewport?.contains(document.activeElement));
    viewport?.classList.remove("is-dragging");
    window.setTimeout(() => { pointerRef.current.moved = false; }, 0);
  };

  const handlePointerLeave = () => {
    const viewport = viewportRef.current;
    const pointer = pointerRef.current;
    if (!viewport || !pointer.down || pointer.moved) return;
    pointer.down = false;
    pauseRef.current = false;
    viewport.classList.remove("is-dragging");
  };

  const suppressibleClick = () => pointerRef.current.moved || Date.now() < pointerRef.current.suppressClickUntil;
  const openCourse = (course) => {
    if (hasAccess) {
      window.location.href = courseVideoHref(course);
      return;
    }
    window.EduNex?.openCourseDetails?.(course);
  };
  const continueCourse = (course) => window.EduNex?.openCourse?.(course);
  const openPath = (category) => {
    if (category) window.location.href = categoryHref(category);
  };
  const toggleWishlist = async (course) => {
    const id = courseId(course);
    if (!id) return;
    const next = new Set(wishlist);
    const currentlySaved = next.has(id);
    if (currentlySaved) next.delete(id);
    else next.add(id);
    setWishlist(next);
    saveLocalWishlist(next);
    if (!window.EduNex?.getAccessToken?.()) return;
    try {
      await window.EduNex.authRequest("/api/wishlist", {
        method: currentlySaved ? "DELETE" : "POST",
        body: JSON.stringify({ courseId: id }),
      });
    } catch (_) {}
  };

  const handleSearch = (event) => {
    event.preventDefault();
    const value = query.trim();
    window.location.href = value ? `courses.html?search=${encodeURIComponent(value)}` : "courses.html";
  };

  const shownCategories = groupedCategories(courses).slice(0, 4);
  const popularCourses = courses.slice(0, 4);
  const activeRows = loop.rows.length ? loop.rows : Array.from({ length: 21 }, (_, index) => ({ loopIndex: index, placeholder: true }));

  return (
    <div className="react-page-root" data-page="index.html">
      <div className="page-grid"></div>
      <main className="relative pt-16">
        <section className="learning-hero" aria-labelledby="learningHeroTitle">
          <div className="learning-hero-copy">
            <div className="learning-hero-label">LEARN WITH AI. EARN WITH AI.</div>
            <h1 id="learningHeroTitle">Build skills that turn<br />into opportunities.</h1>
            <p>Learn practical AI, content, business and digital skills through short expert-led lessons designed for real-world results.</p>
          </div>

          <div className="hero-carousel-shell" id="homeHeroCarousel" aria-live="polite">
            <div
              className="hero-carousel-viewport"
              tabIndex={0}
              ref={viewportRef}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  pauseRef.current = true;
                  scrollToIndex(activeIndex - 1);
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  pauseRef.current = true;
                  scrollToIndex(activeIndex + 1);
                }
              }}
              onDragStart={preventNativeDrag}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onPointerLeave={handlePointerLeave}
              onClickCapture={(event) => {
                if (!suppressibleClick()) return;
                event.preventDefault();
                event.stopPropagation();
              }}
              onMouseEnter={() => { pauseRef.current = true; }}
              onMouseLeave={() => { if (!pointerRef.current.down) pauseRef.current = false; }}
              onFocus={() => { pauseRef.current = true; }}
              onBlur={() => { if (!pointerRef.current.down) pauseRef.current = false; }}
            >
              <div className={`hero-carousel-track${!currentItems.length ? " is-empty" : ""}`} id="homeHeroCarouselTrack" data-base-count={loop.baseCount || 7} data-looped="true">
                {activeRows.map((item, index) => item.placeholder ? (
                  <HeroPlaceholderCard index={index} isCenter={index === activeIndex} tab={activeTab} key={`placeholder-${index}`} />
                ) : (
                  <HeroCourseCard
                    item={item}
                    index={index}
                    isCenter={index === activeIndex}
                    hasAccess={hasAccess}
                    isSaved={wishlist.has(courseId(item.course))}
                    onOpen={openCourse}
                    onContinue={continueCourse}
                    onPath={openPath}
                    onSuppressibleClick={suppressibleClick}
                    onToggleWishlist={toggleWishlist}
                    key={`${courseId(item.course)}-${item.type}-${index}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="learning-hero-actions">
            <a href="courses.html" className="hero-cta-primary">
              Explore Courses
              <MaterialIcon className="text-[19px]">arrow_forward</MaterialIcon>
            </a>
            <a href="payment.html" className="hero-cta-secondary">Start ₹1 Trial</a>
          </div>

          <div className="hero-search-block">
            <form className="hero-search-form" id="homeHeroSearch" onSubmit={handleSearch}>
              <label className="hero-search-field">
                <MaterialIcon>search</MaterialIcon>
                <input type="search" name="q" placeholder="What do you want to learn today?" aria-label="Search courses" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <button className="hero-search-btn" type="submit">Search</button>
            </form>
            <div className="hero-topics" aria-label="Popular learning topics">
              {TOPICS.map((topic) => <a className="hero-topic" href={`courses.html?search=${encodeURIComponent(topic)}`} key={topic}>{topic}</a>)}
            </div>
          </div>

          <div className="hero-trust-strip" aria-label="EduNex platform trust indicators">
            {[
              ["groups", "100K+ Learners", "Growing across India"],
              ["workspace_premium", "Expert-Led Courses", "Practical instructors"],
              ["play_lesson", "Short Vertical Lessons", "Built for momentum"],
              ["verified", "Recognised Certificates", "Career-ready proof"],
              ["devices", "Learn on Any Device", "Mobile and web"],
            ].map(([icon, strong, copy]) => (
              <div className="hero-trust-item" key={strong}><MaterialIcon>{icon}</MaterialIcon><span><strong>{strong}</strong> {copy}</span></div>
            ))}
          </div>
        </section>

        <section className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop mb-24">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <div className="section-kicker justify-center">Skill Areas</div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Top Categories</h2>
            <p className="text-on-surface-variant leading-relaxed">Focused tracks that help learners move from curiosity to practical, portfolio-ready skills.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-gutter" id="homeCategoriesGrid">
            {status === "loading" ? <div className="glass-card rounded-xl p-6">Loading real categories...</div> : null}
            {status !== "loading" && !shownCategories.length ? <div className="glass-card rounded-xl p-6">No course categories found.</div> : null}
            {shownCategories.map(([category, items]) => {
              const course = items.find((item) => window.EduNex?.courseImage?.(item)) || items[0];
              const videos = items.reduce((count, item) => count + lessonCount(item), 0);
              return (
                <div className="glass-card professional-card rounded-xl overflow-hidden cursor-pointer" role="link" tabIndex={0} key={category} onClick={() => openCourse(course)} onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  openCourse(course);
                }}>
                  <div className="h-44 relative overflow-hidden">
                    <img className="w-full h-full object-cover" src={window.EduNex?.courseImage?.(course) || ""} alt={category} onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = window.EduNex?.placeholderImage?.(event.currentTarget.alt || "EduNex") || "";
                    }} />
                    <div className="absolute top-4 left-4 bg-black/80 border border-primary/30 text-primary px-3 py-1 rounded-full text-[10px] font-bold uppercase">{items.length} courses</div>
                  </div>
                  <div className="p-6">
                    <div className="text-primary text-xs font-semibold uppercase tracking-[.08em] mb-3">{videos || "Real"} Lessons</div>
                    <h3 className="font-bold text-on-surface mb-2 leading-snug min-h-[48px]">{category}</h3>
                    <p className="home-category-course text-on-surface-variant text-sm leading-relaxed mb-5">{course?.title || "Explore this EduNex track"}</p>
                    <a href={categoryHref(category)} className="text-primary font-semibold inline-flex items-center gap-2" onClick={(event) => event.stopPropagation()}>View More <MaterialIcon className="text-base">arrow_forward</MaterialIcon></a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop mb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
            <div className="glass-card professional-card rounded-xl p-8 md:p-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold uppercase tracking-[.08em] mb-6">
                <MaterialIcon className="text-[16px]">bolt</MaterialIcon>
                Limited Time Offer
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Unlock Full Access for Just <span className="text-primary">₹1</span> Trial</h2>
              <p className="text-on-surface-variant leading-relaxed mb-8">Experience the power of AI-driven education. Get 7 days of unlimited access to premium courses, mentorship, and project tools for the cost of a candy.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                <div className="rounded-2xl bg-white/[.035] border border-white/[.07] p-3 text-sm text-on-surface-variant">Verified certificates</div>
                <div className="rounded-2xl bg-white/[.035] border border-white/[.07] p-3 text-sm text-on-surface-variant">AI tutors 24/7</div>
                <div className="rounded-2xl bg-white/[.035] border border-white/[.07] p-3 text-sm text-on-surface-variant">Cloud lab access</div>
              </div>
              <a href="login.html" className="inline-flex bg-primary !text-[#FFFDF8] px-6 py-3 rounded-full font-bold hover:shadow-[0_0_18px_rgba(197,139,42,.32)] transition-all">Claim Your Trial Now</a>
            </div>
            <div className="rounded-xl p-8 md:p-10 bg-primary text-[#332820]">
              <h2 className="ai-mentorship-heading font-bold mb-4">
                <span className="flex items-center gap-1">
                  <span className="text-[4rem] md:text-[5.25rem] leading-none">AI</span>
                  <img
                    className="-ml-2 h-20 w-20 md:h-24 md:w-24 object-contain"
                    src="/assets/ai-bulb.png"
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <span className="block mt-2 text-4xl md:text-5xl">Mentorship Engine</span>
              </h2>
              <p className="text-[1.05rem] text-[#5F534A] leading-relaxed mb-8">Our neural engine maps your career goals to industry requirements, suggesting the exact skills you need to land your dream job.</p>
              <a href="ai-tutor.html" className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-8 py-3.5 text-[1.05rem] font-bold !text-white transition-colors hover:bg-[#171717]">Explore Engine <MaterialIcon>arrow_forward</MaterialIcon></a>
            </div>
          </div>
        </section>

        <section className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop mb-32">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div>
              <div className="section-kicker">Catalog</div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Popular Courses</h2>
              <p className="text-on-surface-variant max-w-lg">Real EduNex courses from the backend, shown with the current learning catalog.</p>
            </div>
            <a className="text-primary flex items-center gap-2 font-semibold hover:gap-4 transition-all" href="courses.html">
              View All Courses
              <MaterialIcon>trending_flat</MaterialIcon>
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter" id="homeCoursesGrid">
            {status === "loading" ? <div className="glass-card rounded-xl p-6">Loading real EduNex courses...</div> : null}
            {status !== "loading" && !popularCourses.length ? <div className="glass-card rounded-xl p-6">No published courses found.</div> : null}
            {popularCourses.map((course) => {
              const category = categoryName(course);
              return (
                <div className="glass-card professional-card rounded-xl overflow-hidden" key={courseId(course)}>
                  <div className="h-44 relative overflow-hidden">
                    <img className="w-full h-full object-cover" src={window.EduNex?.courseImage?.(course) || ""} alt={course.title || "Untitled course"} onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = window.EduNex?.placeholderImage?.(event.currentTarget.alt || "EduNex") || "";
                    }} />
                    <div className="absolute top-4 left-4 bg-black/80 border border-primary/30 text-primary px-3 py-1 rounded-full text-[10px] font-bold uppercase">{category}</div>
                  </div>
                  <div className="p-6">
                    <div className="text-primary text-xs font-semibold uppercase tracking-[.08em] mb-3">{lessonCount(course)} Lessons</div>
                    <h3 className="font-bold text-on-surface mb-5 leading-snug min-h-[48px]">{course.title || "Untitled course"}</h3>
                    <button className="text-primary font-semibold inline-flex items-center gap-2" type="button" onClick={() => openCourse(course)}>Open Course <MaterialIcon className="text-base">arrow_forward</MaterialIcon></button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
