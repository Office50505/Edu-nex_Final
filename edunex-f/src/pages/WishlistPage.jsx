import { useEffect, useMemo, useState } from "react";
import { page as wishlistPage } from "../generated-pages/wishlist.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";

function localWishlistIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem("edunexWishlistLocal") || "[]").map(String));
  } catch (_) {
    return new Set();
  }
}

function setLocalWishlistIds(ids) {
  localStorage.setItem("edunexWishlistLocal", JSON.stringify(Array.from(ids)));
}

function coursesArray(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.courses)) return response.courses;
  return [];
}

function categoryName(course) {
  return typeof course.category === "string" ? course.category : (course.category?.name || "Course");
}

export function WishlistPage() {
  const [courses, setCourses] = useState([]);
  const [message, setMessage] = useState("Loading your saved real courses...");
  const runtimeReady = useEduNexRuntimeReady();

  usePageStyle("react-page-style-wishlist", wishlistPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...wishlistPage,
    scripts: wishlistPage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    document.title = wishlistPage.title;
    document.documentElement.lang = wishlistPage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  const renderCourseImage = (course) => window.EduNex?.courseImage?.(course) || course.thumbnail || course.image || "";
  const placeholderImage = (label) => window.EduNex?.placeholderImage?.(label || "EduNex") || "";

  const loadWishlist = async () => {
    setMessage("Loading your saved real courses...");
    if (!window.EduNex?.getAccessToken?.()) {
      try {
        const localIds = localWishlistIds();
        const response = await window.EduNex.request("/api/courses");
        setCourses(coursesArray(response).filter((course) => localIds.has(String(course._id))));
        setMessage("");
      } catch (_) {
        setCourses([]);
        setMessage("Log in to sync your saved courses.");
      }
      return;
    }
    try {
      const localIds = localWishlistIds();
      const [wishlist, courseResponse] = await Promise.all([
        window.EduNex.authRequest("/api/wishlist"),
        window.EduNex.request("/api/courses"),
      ]);
      const savedIds = new Set([...(wishlist.courses || []).map(String), ...localIds]);
      setCourses(coursesArray(courseResponse).filter((course) => savedIds.has(String(course._id))));
      setMessage("");
    } catch (error) {
      setCourses([]);
      setMessage(`Could not load wishlist: ${error.message}`);
    }
  };

  useEffect(() => {
    if (runtimeReady) loadWishlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeReady]);

  const removeCourse = async (courseId) => {
    const localIds = localWishlistIds();
    localIds.delete(String(courseId));
    setLocalWishlistIds(localIds);
    try {
      await window.EduNex.authRequest("/api/wishlist/toggle", {
        method: "POST",
        body: JSON.stringify({ courseId }),
      });
      setCourses((current) => current.filter((course) => course._id !== courseId));
    } catch (error) {
      alert(error.message || "Could not update wishlist.");
    }
  };

  const clearAll = async () => {
    const ids = courses.map((course) => course._id);
    await Promise.all(ids.map((id) => removeCourse(id)));
  };

  return (
    <div className="react-page-root" data-page="wishlist.html">
      <div className="page">
        <div className="back-row">
          <button className="back-btn" type="button" onClick={() => history.back()} aria-label="Go back">
            <i className="fas fa-arrow-left" aria-hidden="true"></i>
          </button>
          <h1 className="back-title">My Wishlist</h1>
        </div>

        <div className="wl-summary">
          <div className="wl-count"><span id="wlCountNum">{courses.length}</span> courses saved</div>
          <button className="wl-clear-btn" type="button" onClick={clearAll}>
            <i className="fas fa-trash-alt" style={{ marginRight: 5 }} aria-hidden="true"></i>Clear All
          </button>
        </div>

        <div className="wl-sort-row">
          <button className="wl-sort-btn active" type="button">Recently Added</button>
          <button className="wl-sort-btn" type="button">Price: Low to High</button>
          <button className="wl-sort-btn" type="button">Highest Rated</button>
        </div>

        <div className="wl-grid" id="wlGrid">
          {message ? <div className="wl-card" style={{ padding: 20 }}>{message}</div> : null}
          {!message && !courses.length ? (
            <div className="wl-empty" style={{ display: "block" }}>
              <i className="far fa-bookmark" aria-hidden="true"></i>
              <h2>Your wishlist is empty</h2>
              <p>Browse real courses and tap the heart icon to save them here.</p>
              <a href="courses.html" className="wl-browse-btn">Browse Courses</a>
            </div>
          ) : null}
          {!message ? courses.map((course) => {
            const videos = Array.isArray(course.videos) ? course.videos.length : 0;
            return (
              <div className="wl-card" id={`course-${course._id}`} key={course._id}>
                <button className="wl-remove" type="button" onClick={() => removeCourse(course._id)} aria-label="Remove course">
                  <i className="fas fa-times" aria-hidden="true"></i>
                </button>
                <div className="wl-thumb-wrap">
                  <img
                    className="wl-thumb"
                    src={renderCourseImage(course)}
                    alt={course.title || "Untitled course"}
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = placeholderImage(event.currentTarget.alt || "EduNex");
                    }}
                  />
                  <span className="wl-badge badge-cyan">{categoryName(course)}</span>
                </div>
                <div className="wl-body">
                  <h3 className="wl-title">{course.title || "Untitled course"}</h3>
                  <div className="wl-instructor"><i className="fas fa-play-circle" aria-hidden="true"></i> {videos} videos</div>
                  <div className="wl-rating">
                    <div className="wl-stars"><i className="fas fa-star" aria-hidden="true"></i></div>
                    <span className="wl-rating-val">{course.averageRating || "New"}</span>
                    <span className="wl-rating-count">backend course</span>
                  </div>
                  <div className="wl-meta">
                    <span><i className="fas fa-layer-group" aria-hidden="true"></i> {videos} lessons</span>
                    <span><i className="fas fa-signal" aria-hidden="true"></i> Published</span>
                  </div>
                  <div className="wl-footer">
                    <span className="wl-price">REAL COURSE</span>
                    <button className="wl-enroll-btn" type="button" onClick={() => window.EduNex?.openCourseDetails?.({ _id: course._id })}>Open</button>
                  </div>
                </div>
              </div>
            );
          }) : null}
        </div>
      </div>
    </div>
  );
}
