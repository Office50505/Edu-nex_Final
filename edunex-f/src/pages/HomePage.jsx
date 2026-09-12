import { useEffect, useMemo, useRef, useState } from "react";
import { page as indexPage } from "../generated-pages/index.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";
import { route } from "../lib/routes.js";

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
  instructorName: "Skillomate Mentors",
  language: "Hindi + English",
  duration: `${lessons} lessons`,
  averageRating: rating,
  learnerCount: learners,
  price,
  videos: Array.from({ length: lessons }, (_, index) => ({ title: `Lesson ${index + 1}` })),
}));

function courseId(course) {
  return String(course?._id || course?.id || "");
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

function courseDetailsHref(course) {
  const id = courseId(course);
  return id ? route(`course.html?id=${encodeURIComponent(id)}`) : route("courses.html");
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
  return route(`courses.html?category=${encodeURIComponent(category)}`);
}

function searchHref(value) {
  return route(`courses.html?search=${encodeURIComponent(value)}`);
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
  const hasProgress = Boolean(saved.viewed || saved.lastViewedAt);
  return { total, completed, percent, lessonIndex, hasProgress };
}

function instructorName(course) {
  return course?.instructor?.name || course?.instructorName || course?.author || "Skillomate AI Mentors";
}

function languageLabel(course) {
  return course?.language || course?.courseLanguage || "Hindi + English";
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

function openNexAiEngine() {
  if (window.NexAIWidget?.open) {
    window.NexAIWidget.open();
    return;
  }

  document.getElementById("nai-float-btn")?.click();
  if (!window.NexAIWidget?.isOpen?.()) {
    window.location.href = route("ai-tutor.html");
  }
}

function enrolledItems(courses) {
  return courses
    .map((course) => ({ course, progress: progressFor(course) }))
    .filter((item) => item.progress.hasProgress)
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
  const openFromCard = () => {
    window.location.href = "courses.html";
  };

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
        openFromCard();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openFromCard();
      }}
    >
      <div className="hero-card-media" onClick={(event) => {
        if (event.target.closest("a, button")) return;
        event.stopPropagation();
        openFromCard();
      }}>
        <span className="hero-skeleton hero-skeleton-media"></span>
        <span className="hero-card-badge">{isMessageCard ? "Course grid" : "Skillomate"}</span>
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
            <div className="hero-placeholder-note">Real Skillomate courses will appear in this carousel as soon as the backend returns them.</div>
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
    : courseDetailsHref(course);

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
            onError={(event) => handleCourseImageError(event, course)}
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
              <a className="hero-card-primary" href={href} onClick={(event) => {
                event.stopPropagation();
                if (onSuppressibleClick()) event.preventDefault();
              }}>
                Continue Course
              </a>
              <button
                className={`hero-card-wish${isSaved ? " is-saved" : ""}`}
                type="button"
                aria-label={isSaved ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={isSaved}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!onSuppressibleClick()) onToggleWishlist(course);
                }}
              >
                <WishlistHeartIcon filled={isSaved} />
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
              <a className="hero-card-primary" href={href} onClick={(event) => {
                event.stopPropagation();
                if (onSuppressibleClick()) event.preventDefault();
              }}>
                View Course
              </a>
              <button
                className={`hero-card-wish${isSaved ? " is-saved" : ""}`}
                type="button"
                aria-label={isSaved ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={isSaved}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!onSuppressibleClick()) onToggleWishlist(course);
                }}
              >
                <WishlistHeartIcon filled={isSaved} />
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
  const resumeCarouselTimerRef = useRef(0);
  const smoothScrollRef = useRef({ frame: 0, target: 0 });
  const userScrollTimerRef = useRef(0);
  const lastFrameRef = useRef(0);
  const pauseRef = useRef(false);
  const directionRef = useRef(1);
  const pointerRef = useRef({ down: false, moved: false, input: "", startX: 0, startY: 0, startLeft: 0, suppressClickUntil: 0 });
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
        setActiveTab("trending");
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setCourses(FALLBACK_COURSES);
        setActiveTab("trending");
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
    setActiveIndex(loop.baseCount);
  }, [activeTab, loop.baseCount]);

  const setUserScrolling = () => {
    const viewport = viewportRef.current;
    viewport?.classList.add("is-user-scrolling");
    if (userScrollTimerRef.current) window.clearTimeout(userScrollTimerRef.current);
    userScrollTimerRef.current = window.setTimeout(() => {
      userScrollTimerRef.current = 0;
      if (!pointerRef.current.down) viewport?.classList.remove("is-user-scrolling");
    }, 220);
  };

  const animateViewportTo = (left, duration = 430) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const target = Math.max(0, Math.min(maxScrollLeft, left));
    const start = viewport.scrollLeft;
    const distance = target - start;
    cancelAnimationFrame(smoothScrollRef.current.frame);
    smoothScrollRef.current = { frame: 0, target };
    if (Math.abs(distance) < 1) {
      viewport.scrollLeft = target;
      return;
    }
    setUserScrolling();
    const startedAt = performance.now();
    const animate = (timestamp) => {
      const elapsed = Math.min(1, (timestamp - startedAt) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      viewport.scrollLeft = start + distance * eased;
      if (elapsed < 1) {
        smoothScrollRef.current.frame = requestAnimationFrame(animate);
      } else {
        viewport.scrollLeft = target;
        smoothScrollRef.current.frame = 0;
      }
    };
    smoothScrollRef.current.frame = requestAnimationFrame(animate);
  };

  const carouselCards = () => {
    const viewport = viewportRef.current;
    return viewport ? Array.from(viewport.querySelectorAll(".hero-course-card[data-hero-index]")) : [];
  };

  const nearestCarouselIndex = () => {
    const viewport = viewportRef.current;
    const cards = carouselCards();
    if (!viewport || !cards.length) return activeIndex;
    const center = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
    return cards.reduce((nearest, card, index) => {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(center - (rect.left + rect.width / 2));
      return distance < nearest.distance ? { index, distance } : nearest;
    }, { index: 0, distance: Infinity }).index;
  };

  const scrollToIndex = (index, behavior = "smooth") => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const cards = carouselCards();
    if (!cards.length) return;
    const nextIndex = Math.max(0, Math.min(index, cards.length - 1));
    setActiveIndex(nextIndex);
    const card = cards[nextIndex];
    const left = card.offsetLeft - ((viewport.clientWidth - card.offsetWidth) / 2);
    if (behavior === "auto") {
      cancelAnimationFrame(smoothScrollRef.current.frame);
      smoothScrollRef.current.frame = 0;
      viewport.scrollLeft = left;
      return;
    }
    animateViewportTo(left);
  };

  const settleCarousel = () => {
    const nearest = nearestCarouselIndex();
    scrollToIndex(nearest);
  };

  const stepCarousel = (direction) => {
    pauseCarouselAfterInput();
    directionRef.current = direction;
    scrollToIndex(nearestCarouselIndex() + direction);
  };

  useEffect(() => {
    if (!loop.rows.length) return undefined;
    const id = requestAnimationFrame(() => scrollToIndex(activeIndex, "auto"));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop.rows.length]);

  const pauseCarouselAfterInput = (duration = 2200) => {
    pauseRef.current = true;
    setUserScrolling();
    if (resumeCarouselTimerRef.current) window.clearTimeout(resumeCarouselTimerRef.current);
    resumeCarouselTimerRef.current = window.setTimeout(() => {
      resumeCarouselTimerRef.current = 0;
      if (!pointerRef.current.down) pauseRef.current = false;
    }, duration);
  };

  const useNativeTouchCarousel = () => window.matchMedia?.("(pointer: coarse), (max-width: 820px)")?.matches;

  const syncCenterFromScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const cards = carouselCards();
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
      if (viewport.classList.contains("is-auto-moving")) return;
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
      const delta = Math.min(32, timestamp - lastFrameRef.current);
      lastFrameRef.current = timestamp;

      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      if (maxScrollLeft > 1 && !pauseRef.current && !pointerRef.current.down && !smoothScrollRef.current.frame && !document.hidden) {
        viewport.classList.add("is-auto-moving");
        const speed = 0.075;
        let nextLeft = viewport.scrollLeft + (delta * speed * directionRef.current);
        if (nextLeft >= maxScrollLeft) {
          nextLeft = maxScrollLeft;
          directionRef.current = -1;
        } else if (nextLeft <= 0) {
          nextLeft = 0;
          directionRef.current = 1;
        }
        viewport.scrollLeft = nextLeft;
      } else {
        viewport.classList.remove("is-auto-moving");
      }

      motionRef.current = requestAnimationFrame(tick);
    };
    motionRef.current = requestAnimationFrame(tick);
    const onVisibility = () => { pauseRef.current = document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(motionRef.current);
      cancelAnimationFrame(smoothScrollRef.current.frame);
      if (resumeCarouselTimerRef.current) window.clearTimeout(resumeCarouselTimerRef.current);
      if (userScrollTimerRef.current) window.clearTimeout(userScrollTimerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      viewport.classList.remove("is-auto-moving");
      lastFrameRef.current = 0;
    };
  }, [loop.rows.length]);

  const handlePointerDown = (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (event.pointerType === "mouse") return;
    if (event.pointerType === "touch") {
      pauseCarouselAfterInput(3000);
      return;
    }
    if (event.target.closest?.("input, textarea, select")) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    pointerRef.current = {
      down: true,
      moved: false,
      input: "pointer",
      startX: event.clientX,
      startY: event.clientY,
      startLeft: viewport.scrollLeft,
      suppressClickUntil: pointerRef.current.suppressClickUntil,
    };
    pauseCarouselAfterInput();
  };

  const handlePointerMove = (event) => {
    const viewport = viewportRef.current;
    const pointer = pointerRef.current;
    if (!viewport || !pointer.down || pointer.input !== "pointer") return;
    cancelAnimationFrame(smoothScrollRef.current.frame);
    smoothScrollRef.current.frame = 0;
    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;
    if (!pointer.moved) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX <= 6) return;
      if (absX < Math.max(8, absY * 1.08)) {
        pointer.down = false;
        return;
      }
      viewport.classList.add("is-dragging");
      try { viewport.setPointerCapture?.(event.pointerId); } catch (_) {}
    }
    pointer.moved = true;
    event.preventDefault();
    viewport.scrollLeft = pointer.startLeft - deltaX;
  };

  const handlePointerEnd = (event) => {
    const viewport = viewportRef.current;
    const pointer = pointerRef.current;
    if (pointer.moved) pointer.suppressClickUntil = Date.now() + 250;
    pointer.down = false;
    pointer.input = "";
    if (viewport?.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    if (!resumeCarouselTimerRef.current) pauseRef.current = Boolean(viewport?.matches(":hover") || viewport?.contains(document.activeElement));
    viewport?.classList.remove("is-dragging");
    if (pointer.moved) settleCarousel();
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

  const handleTouchStart = (event) => {
    if (event.touches.length !== 1) return;
    if (event.target.closest?.("input, textarea, select")) return;
    const viewport = viewportRef.current;
    if (!viewport || pointerRef.current.down) return;
    if (useNativeTouchCarousel()) {
      pauseCarouselAfterInput(3000);
      return;
    }
    const touch = event.touches[0];
    pointerRef.current = {
      down: true,
      moved: false,
      input: "touch",
      startX: touch.clientX,
      startY: touch.clientY,
      startLeft: viewport.scrollLeft,
      suppressClickUntil: pointerRef.current.suppressClickUntil,
    };
    pauseCarouselAfterInput();
  };

  const handleTouchMove = (event) => {
    const viewport = viewportRef.current;
    const pointer = pointerRef.current;
    if (!viewport || !pointer.down || pointer.input !== "touch" || event.touches.length !== 1) return;
    cancelAnimationFrame(smoothScrollRef.current.frame);
    smoothScrollRef.current.frame = 0;
    const touch = event.touches[0];
    const deltaX = touch.clientX - pointer.startX;
    const deltaY = touch.clientY - pointer.startY;
    if (!pointer.moved) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX <= 8) return;
      if (absX < Math.max(10, absY * 1.08)) {
        pointer.down = false;
        return;
      }
      viewport.classList.add("is-dragging");
    }
    pointer.moved = true;
    event.preventDefault();
    viewport.scrollLeft = pointer.startLeft - deltaX;
  };

  const handleTouchEnd = () => {
    const viewport = viewportRef.current;
    const pointer = pointerRef.current;
    if (pointer.input !== "touch") return;
    if (pointer.moved) pointer.suppressClickUntil = Date.now() + 250;
    pointer.down = false;
    pointer.input = "";
    if (!resumeCarouselTimerRef.current) pauseRef.current = Boolean(viewport?.matches(":hover") || viewport?.contains(document.activeElement));
    viewport?.classList.remove("is-dragging");
    if (pointer.moved) settleCarousel();
    window.setTimeout(() => { pointerRef.current.moved = false; }, 0);
  };

  const handleWheel = (event) => {
    const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
    if (!horizontalIntent) return;
    event.preventDefault();
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    viewport.addEventListener("touchstart", handleTouchStart, { passive: true });
    viewport.addEventListener("touchmove", handleTouchMove, { passive: false });
    viewport.addEventListener("touchend", handleTouchEnd, { passive: true });
    viewport.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("touchmove", handleTouchMove);
      viewport.removeEventListener("touchend", handleTouchEnd);
      viewport.removeEventListener("touchcancel", handleTouchEnd);
    };
    // The handlers read mutable refs, so one native binding is enough for the carousel lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suppressibleClick = () => pointerRef.current.moved || Date.now() < pointerRef.current.suppressClickUntil;
  const openCourse = (course) => {
    window.location.href = courseDetailsHref(course);
  };
  const continueCourse = (course) => {
    window.location.href = courseDetailsHref(course);
  };
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

  const handleSearch = (event) => {
    event.preventDefault();
    const value = query.trim();
    window.location.href = value ? searchHref(value) : route("courses.html");
  };

  const shownCategories = groupedCategories(courses).slice(0, 4);
  const searchSuggestions = uniqueLabels(courses.filter((course) => !course.isFallback).map((course) => course.title)).slice(0, 6);
  const autocompleteSuggestions = uniqueLabels([
    ...searchSuggestions,
    ...courses.filter((course) => !course.isFallback).map((course) => categoryName(course)),
  ]);
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
            <button className="hero-carousel-control hero-carousel-control-prev" type="button" aria-label="Previous courses" onClick={() => stepCarousel(-1)}>
              <MaterialIcon>chevron_left</MaterialIcon>
            </button>
            <div
              className="hero-carousel-viewport"
              tabIndex={0}
              role="region"
              aria-label="Featured courses carousel. Use left and right arrow keys to scroll courses."
              ref={viewportRef}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  stepCarousel(-1);
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  stepCarousel(1);
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
            <button className="hero-carousel-control hero-carousel-control-next" type="button" aria-label="Next courses" onClick={() => stepCarousel(1)}>
              <MaterialIcon>chevron_right</MaterialIcon>
            </button>
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
                <input type="search" name="q" list="home-course-search-suggestions" placeholder="What do you want to learn today?" aria-label="Search courses" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <datalist id="home-course-search-suggestions">
                {autocompleteSuggestions.map((suggestion) => <option value={suggestion} key={suggestion} />)}
              </datalist>
              <button className="hero-search-btn" type="submit">Search</button>
            </form>
            {searchSuggestions.length ? (
              <div className="hero-topics" aria-label="Available course suggestions">
                {searchSuggestions.map((suggestion) => <a className="hero-topic" href={searchHref(suggestion)} key={suggestion}>{suggestion}</a>)}
              </div>
            ) : null}
          </div>

          <div className="hero-trust-strip" aria-label="Skillomate platform trust indicators">
            {[
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
                    <img className="w-full h-full object-cover" src={window.EduNex?.courseImage?.(course) || ""} alt={category} onError={(event) => handleCourseImageError(event, course)} />
                    <div className="absolute top-4 left-4 bg-black/80 border border-primary/30 text-primary px-3 py-1 rounded-full text-[10px] font-bold uppercase">{items.length} courses</div>
                  </div>
                  <div className="p-6">
                    <div className="text-primary text-xs font-semibold uppercase tracking-[.08em] mb-3">{videos || "Real"} Lessons</div>
                    <h3 className="font-bold text-on-surface mb-2 leading-snug min-h-[48px]">{category}</h3>
                    <p className="home-category-course text-on-surface-variant text-sm leading-relaxed mb-5">{course?.title || "Explore this Skillomate track"}</p>
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
              <button type="button" onClick={openNexAiEngine} className="inline-flex items-center justify-center gap-2 rounded-full border-0 bg-black px-8 py-3.5 text-[1.05rem] font-bold !text-white transition-colors hover:bg-[#171717] cursor-pointer">Explore Engine <MaterialIcon>arrow_forward</MaterialIcon></button>
            </div>
          </div>
        </section>

        <section className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop mb-32">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div>
              <div className="section-kicker">Catalog</div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Popular Courses</h2>
              <p className="text-on-surface-variant max-w-lg">Real Skillomate courses from the backend, shown with the current learning catalog.</p>
            </div>
            <a className="text-primary flex items-center gap-2 font-semibold hover:gap-4 transition-all" href="courses.html">
              View All Courses
              <MaterialIcon>trending_flat</MaterialIcon>
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter" id="homeCoursesGrid">
            {status === "loading" ? <div className="glass-card rounded-xl p-6">Loading real Skillomate courses...</div> : null}
            {status !== "loading" && !popularCourses.length ? <div className="glass-card rounded-xl p-6">No published courses found.</div> : null}
            {popularCourses.map((course) => {
              const category = categoryName(course);
              return (
                <div className="glass-card professional-card rounded-xl overflow-hidden" key={courseId(course)}>
                  <div className="h-44 relative overflow-hidden">
                    <img className="w-full h-full object-cover" src={window.EduNex?.courseImage?.(course) || ""} alt={course.title || "Untitled course"} onError={(event) => handleCourseImageError(event, course)} />
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
