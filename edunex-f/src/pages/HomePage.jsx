import { useEffect, useMemo, useRef, useState } from "react";
import { page as indexPage } from "../generated-pages/index.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";
import { route } from "../lib/routes.js";
import { courseEntryHref } from "../lib/courseNavigation.js";

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

function lessonHref(course, lessonIndex = 0) {
  const id = courseId(course);
  const index = Math.max(0, Number(lessonIndex) || 0);
  return id ? route(`videos.html?courseId=${encodeURIComponent(id)}&video=${index}`) : route("courses.html");
}

function carouselItemKey(item, fallbackIndex = 0) {
  const courseKey = courseId(item?.course) || "course";
  if (item?.type === "lesson") {
    const videoKey = item.video?._id || item.video?.id || item.video?.videoUrl || item.video?.title || "lesson";
    return `${courseKey}:lesson:${item.lessonIndex}:${videoKey}`;
  }
  if (item?.type === "path") return `path:${item.category || fallbackIndex}`;
  return `${courseKey}:${item?.type || "item"}:${fallbackIndex}`;
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
  const explicitCount = Number(course?.videoCount || course?.lessonCount || 0);
  if (explicitCount > 0) return explicitCount;
  return Array.isArray(course?.videos) ? course.videos.length : 0;
}

function authenticatedUserId() {
  if (typeof window === "undefined" || !window.EduNex?.getAccessToken?.()) return "";
  const user = window.EduNex?.getUser?.();
  return String(user?._id || user?.id || "");
}

function readProgressRecord(courseId, ownerId) {
  if (!courseId || !ownerId || typeof window === "undefined") return {};
  try {
    const scopedKey = `edunexCourseProgress:${ownerId}:${courseId}`;
    const scopedValue = localStorage.getItem(scopedKey);
    const legacyValue = localStorage.getItem(`edunexCourseProgress:${courseId}`);
    const rawValue = scopedValue || legacyValue || "{}";
    const value = JSON.parse(rawValue);
    if (!scopedValue && legacyValue) localStorage.setItem(scopedKey, legacyValue);
    return value && typeof value === "object" ? value : {};
  } catch (_) {
    return {};
  }
}

function videoAliases(video, index) {
  return [video?._id, video?.id, video?.videoId, video?.bunnyVideoId, video?.bunnyGuid, video?.youtubeId, index]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map(String);
}

export function progressFor(course, ownerId = authenticatedUserId()) {
  const id = courseId(course);
  const saved = readProgressRecord(id, ownerId);
  const videos = Array.isArray(course?.videos) ? course.videos : [];
  const total = Math.max(lessonCount(course), 1);
  const completed = Number(saved.completed || 0);
  const percent = Math.max(0, Math.min(100, Number(saved.percent ?? Math.round((completed / total) * 100))));
  const lastWatchedVideoId = String(saved.lastWatchedVideoId || "");
  const watchedIndex = lastWatchedVideoId
    ? videos.findIndex((video, index) => videoAliases(video, index).includes(lastWatchedVideoId))
    : -1;
  const lessonIndex = Math.max(0, Math.min(watchedIndex >= 0 ? watchedIndex : Number(saved.lessonIndex || 0), total - 1));
  const hasProgress = Boolean(saved.viewed || saved.lastViewedAt || lastWatchedVideoId || Number(saved.watchedSeconds || 0) > 0 || completed > 0 || percent > 0);
  return { total, completed, percent, lessonIndex, hasProgress, lastWatchedVideoId, lastViewedAt: saved.lastViewedAt || "" };
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

function lessonImage(course, video) {
  return imageCandidate(
    video?.thumbnailUrl
    || video?.thumbnailVerticalUrl
    || (video?._id && courseId(course) ? `/api/courses/${courseId(course)}/videos/${video._id}/thumbnail` : "")
    || window.EduNex?.courseImage?.(course)
    || course?.thumbnailUrl
    || course?.thumbnailVerticalUrl
  );
}

function durationLabel(course) {
  return course?.duration || (lessonCount(course) ? `${lessonCount(course)} lessons` : "Self paced");
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!value) return "Self paced";
  return `${Math.max(1, Math.ceil(value / 60))} min`;
}

function ratingLabel(course) {
  return course?.averageRating || course?.rating || "4.8";
}

function learnerLabel(course) {
  const count = course?.learnerCount || course?.enrolledCount || course?.students || course?.studentsCount;
  return count ? `${Number(count).toLocaleString("en-IN")} learners` : "100K+ learners";
}

function priceLabel(course) {
  return course?.price && Number(course.price) > 1 ? `₹${Number(course.price).toLocaleString("en-IN")}` : "₹1 for 24 hours";
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

function lessonItems(courses) {
  return courses.flatMap((course) => {
    const videos = Array.isArray(course?.videos) ? course.videos : [];
    return videos.map((video, lessonIndex) => ({
      type: "lesson",
      course,
      video,
      lessonIndex,
    }));
  });
}

function itemsForTab(tab, courses) {
  const enrolled = enrolledItems(courses);
  const lessons = lessonItems(courses);
  if (tab === "my-courses") {
    const enrolledLessons = enrolled.flatMap((item) => {
      const videos = Array.isArray(item.course?.videos) ? item.course.videos : [];
      return videos.map((video, lessonIndex) => ({
        type: "lesson",
        course: item.course,
        video,
        lessonIndex,
      }));
    });
    return enrolledLessons.length
      ? enrolledLessons
      : enrolled.map((item) => ({ type: "enrolled", course: item.course, progress: item.progress }));
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
  return lessons.length ? lessons : courses.slice(0, 8).map((course) => ({ type: "trending", course }));
}

function repeatedItems(items, minimum = 7) {
  const uniqueItems = [];
  const seen = new Set();
  items.forEach((item, index) => {
    const key = carouselItemKey(item, index);
    if (seen.has(key)) return;
    seen.add(key);
    uniqueItems.push(item);
  });
  if (!uniqueItems.length) return { baseCount: 0, rows: [] };
  const baseCount = Math.max(minimum, uniqueItems.length);
  const base = Array.from({ length: baseCount }, (_, index) => uniqueItems[index % uniqueItems.length]);
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

function sectionAction(label, href = "courses.html") {
  return <a className="curriculum-section-action" href={href}>{label} <MaterialIcon>arrow_forward</MaterialIcon></a>;
}

function imageCandidate(value) {
  return window.EduNex?.normalizeImageSrc?.(value) || String(value || "").trim();
}

function courseFallbackImage(course, fallback = "/assets/female1.jpeg") {
  if (!course) return fallback;
  return imageCandidate(window.EduNex?.courseImage?.(course) || course.thumbnailUrl || course.thumbnailVerticalUrl) || fallback;
}

export function activeProgressLessons(courses, ownerId) {
  if (!ownerId) return [];
  return courses
    .filter((course) => course && !course.isFallback)
    .map((course) => {
      const progress = progressFor(course, ownerId);
      const videos = Array.isArray(course.videos) ? course.videos : [];
      const lessonIndex = Math.max(0, Math.min(progress.lessonIndex, Math.max(videos.length - 1, 0)));
      return {
        course,
        progress,
        video: videos[lessonIndex] || null,
        lessonIndex,
      };
    })
    .filter((item) => item.video && item.progress.hasProgress)
    .sort((a, b) => new Date(b.progress.lastViewedAt || 0).getTime() - new Date(a.progress.lastViewedAt || 0).getTime())
    .slice(0, 4);
}

function watchedLectureItems(course) {
  const videos = Array.isArray(course?.videos) ? course.videos : [];
  return videos.map((video, index) => ({
    course,
    video,
    lessonIndex: index,
    title: video?.title || `Lesson ${index + 1}`,
    duration: video?.duration ? formatDuration(video.duration) : "Lecture",
  }));
}

function handleCurriculumImageError(event, course, fallback = "/assets/female1.jpeg") {
  const image = event.currentTarget;
  const next = courseFallbackImage(course, fallback);
  if (next && image.src !== new URL(next, window.location.origin).href) {
    image.src = next;
    return;
  }
  image.onerror = null;
  image.src = fallback;
}

export function CurriculumShowcase({ courses, status, authUserId, hasAccess, accessResolved = true }) {
  const course = courses.find((item) => !item.isFallback) || courses[0] || null;
  const continueLessons = activeProgressLessons(courses, authUserId);
  const watchedItems = watchedLectureItems(course);
  const courseHref = course ? courseEntryHref(course, { hasAccess }) : route("courses.html");
  const courseTitle = course?.title || "AI Influencer Course";
  const courseImage = courseFallbackImage(course);
  const totalLessons = Math.max(lessonCount(course), 34);
  const courseCategory = course ? categoryName(course) : "AI Basics";
  return (
    <section className="curriculum-home" aria-labelledby="curriculumHomeTitle">
      <div className="curriculum-shell">
        <div className="curriculum-overview">
          <img src={courseImage} alt="" loading="lazy" decoding="async" onError={(event) => handleCurriculumImageError(event, course)} />
          <div className="curriculum-overview-copy">
            <span>{courseCategory}</span>
            <h2 id="curriculumHomeTitle">{courseTitle}</h2>
            <p>A single guided workspace for lessons, modules, projects, and certification.</p>
          </div>
          <div className="curriculum-overview-stats" aria-label="Course summary">
            <span><strong>{totalLessons}</strong><small>video lessons</small></span>
            <span><strong>7</strong><small>modules</small></span>
          </div>
          <a href={courseHref}>Open Course <MaterialIcon>arrow_forward</MaterialIcon></a>
        </div>

        <nav className="curriculum-jump-nav" aria-label="Curriculum sections">
          {[
            ...(continueLessons.length ? [["Continue", "#continue-learning"]] : []),
            ["Lessons", "#popular-lessons"],
          ].map(([label, href]) => <a href={href} key={href}>{label}</a>)}
        </nav>

        {continueLessons.length ? <>
          <div className="curriculum-section-head" id="continue-learning">
            <div>
              <h2>Continue Learning</h2>
              <p>Pick up where you left off and keep going.</p>
            </div>
            {sectionAction("View My Course", courseHref)}
          </div>
          <div className="continue-learning-row">
            {continueLessons.map(({ course: lessonCourse, video, progress, lessonIndex }) => {
            const title = video?.title || `Lesson ${lessonIndex + 1}`;
            const href = lessonHref(lessonCourse, lessonIndex);
            const duration = video?.duration ? formatDuration(video.duration) : durationLabel(lessonCourse);
            const progressWidth = `${Math.max(8, Math.min(progress.percent || Math.round(((lessonIndex + 1) / Math.max(progress.total, 1)) * 100), 96))}%`;
            return (
            <article
              className="continue-lesson-card"
              key={`${courseId(lessonCourse)}-${video?._id || video?.id || lessonIndex}`}
              role="link"
              tabIndex={0}
              onClick={() => { window.location.href = href; }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                window.location.href = href;
              }}
            >
              <img src={lessonImage(lessonCourse, video)} alt="" loading="lazy" decoding="async" onError={(event) => handleCurriculumImageError(event, lessonCourse)} />
              <div>
                <span>Lesson {lessonIndex + 1}</span>
                <strong>{title}</strong>
                <small>{lessonCourse.title || "Skillomate course"}</small>
                <div className="lesson-progress"><i style={{ width: progressWidth }}></i><small><MaterialIcon>schedule</MaterialIcon>{duration}</small></div>
              </div>
              <button type="button" aria-label={`Open ${title}`} onClick={(event) => {
                event.stopPropagation();
                window.location.href = href;
              }}><MaterialIcon>play_arrow</MaterialIcon></button>
            </article>
            );
            })}
          </div>
        </> : null}

        <div className="curriculum-section-head" id="popular-lessons">
          <div>
            <h2>Lectures</h2>
            <p>{course?.title ? `All ${watchedItems.length} lectures from ${course.title}, in order.` : "All lectures from your uploaded course, in order."}</p>
          </div>
          {sectionAction("View All Lessons", courseHref)}
        </div>
        <div className="watched-grid">
          {watchedItems.length ? watchedItems.map((item) => {
            const href = courseEntryHref(item.course, { hasAccess, lessonIndex: item.lessonIndex });
            return (
            <button className="watched-card" type="button" key={item.video?._id || `${item.title}-${item.lessonIndex}`} onClick={() => { window.location.href = href; }}>
              <div className="watched-media">
                <img src={lessonImage(item.course, item.video)} alt="" loading="lazy" decoding="async" onError={(event) => handleCurriculumImageError(event, item.course)} />
                <span>{item.duration}</span>
              </div>
              <strong>{item.title}</strong>
              <small>Lecture {item.lessonIndex + 1} of {lessonCount(item.course)}</small>
              <em><MaterialIcon>play_circle</MaterialIcon>Open lecture</em>
            </button>
            );
          }) : (
            <div className="watched-empty">
              <strong>No lectures published yet</strong>
              <p>Upload course videos and this section will show real lectures automatically.</p>
            </div>
          )}
        </div>

        <h2 className="curriculum-standalone-heading">Your Learning Journey</h2>
        <div className="journey-strip">
          {["Beginner", "Create", "Grow", "Monetize", "Scale"].map((title, index) => (
            <div className="journey-step" key={title}>
              <span className="journey-number">{index + 1}</span>
              <strong>{title}</strong>
              <small>{["Learn the basics", "Build your skills", "Get an audience", "Turn skills into income", "Build your brand"][index]}</small>
            </div>
          ))}
        </div>

        {!hasAccess && accessResolved ? <div className="curriculum-cta">
          <div>
            <span><MaterialIcon>auto_awesome</MaterialIcon> Limited Time Offer</span>
            <h2>Unlock 24 Hours for ₹1</h2>
            <p>Then continue at ₹499/month until cancelled. Digital access is added to your Skillomate account.</p>
          </div>
          <div className="curriculum-cta-pills">
            <small><MaterialIcon>video_library</MaterialIcon>{totalLessons} video lessons</small>
            <small><MaterialIcon>assignment</MaterialIcon>Real projects</small>
            <small><MaterialIcon>workspace_premium</MaterialIcon>Certificate</small>
            <small><MaterialIcon>schedule</MaterialIcon>Learn at your pace</small>
          </div>
          <a href={route("payment.html?plan=trial")}>Try 24 Hours for ₹1 <MaterialIcon>arrow_forward</MaterialIcon></a>
        </div> : null}
        {status === "loading" ? <p className="curriculum-status">Loading your live course catalog...</p> : null}
      </div>
    </section>
  );
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
            <div className="hero-placeholder-note">Courses are temporarily unavailable. Browse the catalog or try again shortly.</div>
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
  const isLesson = item.type === "lesson";
  const lessonNumber = Math.max(0, Number(item.lessonIndex) || 0) + 1;
  const title = isLesson
    ? (item.video?.title || `Lesson ${lessonNumber}`)
    : item.type === "path" ? `${item.category} Learning Path` : (course.title || "Untitled course");
  const category = item.type === "path" ? "Learning Path" : categoryName(course);
  const image = isLesson
    ? lessonImage(course, item.video)
    : window.EduNex?.courseImage?.(course) || course.thumbnail || course.image || "";
  const label = isLesson ? `Lesson ${lessonNumber}` : item.type === "enrolled" ? "Continue Learning" : (item.type === "path" ? "Suggested Path" : category);
  const lessonTitle = course.videos?.[progress.lessonIndex]?.title || `Lesson ${progress.lessonIndex + 1} of ${progress.total}`;
  const href = isLesson
    ? lessonHref(course, item.lessonIndex)
    : item.type === "enrolled"
    ? lessonHref(course, progress.lessonIndex)
    : item.type === "path"
    ? categoryHref(item.category || category)
    : courseEntryHref(course, { hasAccess });

  const openFromCard = () => {
    if (item.type === "path") onPath(item.category || category);
    else if (isLesson && id) window.location.href = href;
    else if (item.type === "enrolled" && id) onContinue(course);
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
        {isLesson ? (
          <>
            <div className="hero-card-author">from <span>{course.title || "Skillomate course"}</span></div>
            <div className="hero-card-meta">
              <span><i className="fas fa-play-circle" aria-hidden="true"></i> Lecture {lessonNumber} of {lessonCount(course) || "all"}</span>
              <span><i className="fas fa-layer-group" aria-hidden="true"></i> {category}</span>
              <span><i className="fas fa-clock" aria-hidden="true"></i> {item.video?.duration ? `${Math.ceil(Number(item.video.duration) / 60)} min` : "Self paced"}</span>
              <span><i className="fas fa-language" aria-hidden="true"></i> {languageLabel(course)}</span>
            </div>
            <div className="hero-card-price"><strong>Lecture {lessonNumber}</strong></div>
            <div className="hero-card-actions is-single">
              <a className="hero-card-primary" href={href} onClick={(event) => {
                event.stopPropagation();
                if (onSuppressibleClick()) event.preventDefault();
              }}>
                Open Lecture
              </a>
            </div>
          </>
        ) : item.type === "enrolled" ? (
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
  const [accessResolved, setAccessResolved] = useState(() => hasLocalCourseAccess() || !authenticatedUserId());
  const [wishlist, setWishlist] = useState(() => localWishlist());
  const [activeTab, setActiveTab] = useState("trending");
  const [activeIndex, setActiveIndex] = useState(10);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("loading");
  const [authUserId, setAuthUserId] = useState(() => authenticatedUserId());
  const [progressVersion, setProgressVersion] = useState(0);
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
    if (!runtimeReady || !authUserId || !courses.length || !window.EduNex?.authRequest) return undefined;
    let cancelled = false;
    window.EduNex.authRequest(`/api/user/${encodeURIComponent(authUserId)}/progress`)
      .then((response) => {
        if (cancelled) return;
        const summaries = response?.courseProgress;
        if (!summaries || typeof summaries !== "object" || Array.isArray(summaries)) return;

        courses.forEach((course) => {
          const id = courseId(course);
          const summary = summaries[id];
          if (!id || !summary) return;
          const local = readProgressRecord(id, authUserId);
          const localTime = new Date(local.lastViewedAt || 0).getTime() || 0;
          const remoteTime = new Date(summary.updatedAt || 0).getTime() || 0;
          if (localTime > remoteTime) return;

          const videos = Array.isArray(course.videos) ? course.videos : [];
          const lastWatchedVideoId = String(summary.lastWatchedVideoId || "");
          const watchedIndex = videos.findIndex((video, index) => videoAliases(video, index).includes(lastWatchedVideoId));
          const completed = Math.max(0, Number(summary.completedCount || 0));
          const total = Math.max(videos.length, Number(summary.totalVideos || 0), 1);
          const percentValue = Number(summary.progressPercent);
          const percent = Math.max(0, Math.min(100, Number.isFinite(percentValue) ? percentValue : Math.round((completed / total) * 100)));
          const videoProgress = Object.values(summary.videoProgress || {});
          const nextRecord = {
            ...local,
            viewed: Boolean(summary.updatedAt || lastWatchedVideoId || completed > 0 || percent > 0),
            lastViewedAt: summary.updatedAt || local.lastViewedAt || "",
            lastWatchedVideoId: lastWatchedVideoId || local.lastWatchedVideoId || "",
            lessonIndex: watchedIndex >= 0 ? watchedIndex : Math.max(0, Math.min(Number(local.lessonIndex || completed || 0), total - 1)),
            completed,
            percent,
            watchedSeconds: videoProgress.reduce((sum, row) => sum + Math.max(0, Number(row?.watchedSeconds || 0)), 0),
            durationSeconds: videoProgress.reduce((sum, row) => sum + Math.max(0, Number(row?.durationSeconds || 0)), 0),
          };
          try {
            localStorage.setItem(`edunexCourseProgress:${authUserId}:${id}`, JSON.stringify(nextRecord));
          } catch (_) {}
        });
        setProgressVersion((version) => version + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [runtimeReady, authUserId, courses]);

  useEffect(() => {
    const syncAuth = () => setAuthUserId(authenticatedUserId());
    const syncProgress = () => setProgressVersion((version) => version + 1);
    window.addEventListener("edunex:auth-changed", syncAuth);
    window.addEventListener("storage", syncAuth);
    window.addEventListener("learning-progress", syncProgress);
    syncAuth();
    return () => {
      window.removeEventListener("edunex:auth-changed", syncAuth);
      window.removeEventListener("storage", syncAuth);
      window.removeEventListener("learning-progress", syncProgress);
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
      setAccessResolved(true);
      return undefined;
    }

    setAccessResolved(false);
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
      setAccessResolved(true);
    });

    return () => {
      cancelled = true;
    };
  }, [runtimeReady, authUserId]);

  const currentItems = useMemo(() => itemsForTab(activeTab, courses), [activeTab, courses, authUserId, progressVersion]);
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

  const normalizeLoopPosition = () => {
    const viewport = viewportRef.current;
    const track = viewport?.querySelector(".hero-carousel-track");
    const cards = carouselCards();
    const baseCount = Number(track?.dataset.baseCount || 0);
    if (!viewport || !baseCount || cards.length < baseCount * 3) return 0;

    const first = cards[0];
    const middle = cards[baseCount];
    if (!first || !middle) return 0;
    const cycleWidth = middle.offsetLeft - first.offsetLeft;
    if (cycleWidth <= 0) return 0;

    const centerOffset = (viewport.clientWidth - middle.offsetWidth) / 2;
    const middleStart = middle.offsetLeft - centerOffset;
    const lowerBoundary = middleStart - (cycleWidth / 2);
    const upperBoundary = middleStart + (cycleWidth * 1.5);
    let shift = 0;
    if (viewport.scrollLeft < lowerBoundary) shift = cycleWidth;
    else if (viewport.scrollLeft > upperBoundary) shift = -cycleWidth;
    if (!shift) return 0;

    viewport.scrollLeft += shift;
    setActiveIndex((current) => current + (shift > 0 ? baseCount : -baseCount));
    return shift;
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
    const id = requestAnimationFrame(() => scrollToIndex(loop.baseCount, "auto"));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loop.baseCount, loop.rows.length]);

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
      const shift = normalizeLoopPosition();
      if (shift && pointerRef.current.down) pointerRef.current.startLeft += shift;
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

      const canScroll = viewport.scrollWidth - viewport.clientWidth > 1;
      if (canScroll && !pauseRef.current && !pointerRef.current.down && !smoothScrollRef.current.frame && !document.hidden) {
        viewport.classList.add("is-auto-moving");
        const speed = 0.075;
        viewport.scrollLeft += delta * speed * directionRef.current;
        normalizeLoopPosition();
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
    const shift = normalizeLoopPosition();
    if (shift) pointer.startLeft += shift;
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
    const viewport = viewportRef.current;
    if (!viewport) return;
    pauseCarouselAfterInput(1800);
    viewport.scrollLeft += event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
    normalizeLoopPosition();
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
    window.location.href = courseEntryHref(course, { hasAccess });
  };
  const continueCourse = (course) => {
    window.location.href = lessonHref(course, progressFor(course).lessonIndex);
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

  const searchSuggestions = uniqueLabels(courses.filter((course) => !course.isFallback).map((course) => course.title)).slice(0, 6);
  const activeRows = loop.rows.length ? loop.rows : Array.from({ length: 21 }, (_, index) => ({ loopIndex: index, placeholder: true }));

  return (
    <div className="react-page-root" data-page="index.html">
      <div className="page-grid"></div>
      <main className="relative pt-16">
        <section className="learning-hero" aria-labelledby="learningHeroTitle">
          <div className="learning-hero-copy">
            <div className="learning-hero-label">LEARN WITH AI. EARN WITH AI.</div>
            <h1 id="learningHeroTitle">
              <span>Build skills that turn</span>
              <span>into opportunities.</span>
            </h1>
            <p>Learn practical AI, content, business and digital skills through short expert-led lessons designed for real-world results.</p>
          </div>

          <div className="hero-carousel-shell" id="homeHeroCarousel" aria-live="polite">
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
                    key={`${carouselItemKey(item, index)}-${item.loopIndex ?? index}`}
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
            {!hasAccess && accessResolved ? <a href="payment.html?plan=trial" className="hero-cta-secondary">Try 24 Hours for ₹1</a> : null}
          </div>

          <div className="hero-search-block">
            <form className="hero-search-form" id="homeHeroSearch" onSubmit={handleSearch}>
              <label className="hero-search-field">
                <MaterialIcon>search</MaterialIcon>
                <input type="search" name="q" placeholder="What do you want to learn today?" aria-label="Search courses" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
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

        <CurriculumShowcase courses={courses} status={status} authUserId={authUserId} hasAccess={hasAccess} accessResolved={accessResolved} />
      </main>
    </div>
  );
}
