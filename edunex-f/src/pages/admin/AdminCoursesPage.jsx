import { useEffect, useMemo, useState } from "react";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, adminRoutes, formatNumber, requireAdmin } from "./adminApi.js";

function courseId(course) {
  return String(course?._id || course?.id || "");
}

function categoryId(course) {
  return String(course?.category?._id || course?.category || "");
}

function categoryName(course) {
  return course?.category?.name || course?.categoryName || "Uncategorized";
}

function statusClass(status) {
  if (status === "published") return "good";
  if (status === "draft") return "warn";
  return "";
}

function statusLabel(status) {
  return status === "published" ? "Published" : "Draft";
}

const emptyVideo = (index = 0) => ({
  title: `Video ${index + 1}`,
  description: "",
  duration: 0,
  videoUrl: "",
});

function CourseEditor({ course, categories, saving, onCancel, onSave }) {
  const sourceVideos = Array.isArray(course.videos) && course.videos.length ? course.videos : [emptyVideo()];
  const [form, setForm] = useState({
    title: course.title || "",
    slug: course.slug || "",
    description: course.description || "",
    category: categoryId(course),
    status: course.status === "published" ? "published" : "draft",
    thumbnailUrl: course.thumbnailUrl || "",
    thumbnailVerticalUrl: course.thumbnailVerticalUrl || "",
    notesUrl: course.notesUrl || "",
    videos: sourceVideos.map((video, index) => ({
      title: video.title || `Video ${index + 1}`,
      description: video.description || "",
      duration: Number(video.duration || 0),
      videoUrl: video.videoUrl || video.url || "",
    })),
  });

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateVideo(index, field, value) {
    setForm((current) => ({
      ...current,
      videos: current.videos.map((video, videoIndex) => videoIndex === index ? { ...video, [field]: value } : video),
    }));
  }

  function addVideo() {
    setForm((current) => ({ ...current, videos: [...current.videos, emptyVideo(current.videos.length)] }));
  }

  function removeVideo(index) {
    setForm((current) => {
      if (current.videos.length <= 1) return current;
      return { ...current, videos: current.videos.filter((_, videoIndex) => videoIndex !== index) };
    });
  }

  return (
    <div className="course-edit-panel">
      <form className="course-inline-form" onSubmit={(event) => { event.preventDefault(); onSave(courseId(course), form); }}>
        <div className="form-grid">
          <div className="field"><label>Course title</label><input value={form.title} maxLength={120} required onChange={(event) => updateField("title", event.target.value)} /></div>
          <div className="field"><label>Slug</label><input value={form.slug} maxLength={120} required onChange={(event) => updateField("slug", event.target.value)} /></div>
          <div className="field span-2"><label>Description</label><textarea value={form.description} maxLength={3000} required onChange={(event) => updateField("description", event.target.value)} /></div>
          <div className="field"><label>Category</label><select value={form.category} required onChange={(event) => updateField("category", event.target.value)}><option value="">Choose category</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select></div>
          <div className="field"><label>Status</label><select value={form.status} onChange={(event) => updateField("status", event.target.value)}><option value="draft">Draft</option><option value="published">Published</option></select></div>
          <div className="field"><label>Horizontal thumbnail URL</label><input type="url" value={form.thumbnailUrl} placeholder="https://..." onChange={(event) => updateField("thumbnailUrl", event.target.value)} /></div>
          <div className="field"><label>Vertical thumbnail URL</label><input type="url" value={form.thumbnailVerticalUrl} placeholder="https://..." onChange={(event) => updateField("thumbnailVerticalUrl", event.target.value)} /></div>
          <div className="field span-2"><label>Notes URL</label><input type="url" value={form.notesUrl} placeholder="https://..." onChange={(event) => updateField("notesUrl", event.target.value)} /></div>
        </div>
        <div className="course-publish-panel inline-video-panel">
          <div className="section-heading"><h2>Videos</h2><span>{formatNumber(form.videos.length)} videos in this course</span></div>
          <div className="video-editor">
            {form.videos.map((video, index) => (
              <article className="managed-video" key={index}>
                <div className="video-entry-head"><strong className="video-entry-title">Video {index + 1}</strong><button className="action-button danger" type="button" onClick={() => removeVideo(index)}>Remove</button></div>
                <div className="form-grid compact-form-grid">
                  <div className="field"><label>Title</label><input value={video.title} maxLength={200} required onChange={(event) => updateVideo(index, "title", event.target.value)} /></div>
                  <div className="field"><label>Duration seconds</label><input type="number" min="0" step="1" value={video.duration} onChange={(event) => updateVideo(index, "duration", Number(event.target.value || 0))} /></div>
                  <div className="field span-2"><label>Bunny Stream URL</label><input type="url" value={video.videoUrl} placeholder="https://player.mediadelivery.net/embed/..." required onChange={(event) => updateVideo(index, "videoUrl", event.target.value)} /></div>
                  <div className="field span-2"><label>Description</label><textarea value={video.description} maxLength={2000} onChange={(event) => updateVideo(index, "description", event.target.value)} /></div>
                </div>
              </article>
            ))}
          </div>
          <button className="secondary-button" type="button" onClick={addVideo}>Add video</button>
        </div>
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="submit-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
        </div>
      </form>
    </div>
  );
}

export function AdminCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("newest");
  const [openCourseId, setOpenCourseId] = useState("");
  const [pendingIds, setPendingIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  async function loadCourses() {
    if (!requireAdmin()) return;
    setLoading(true);
    setMessage("");
    try {
      const [courseData, categoryData] = await Promise.all([
        adminJson("/api/admin/courses", {}, "Unable to load courses."),
        adminJson("/api/categories", {}, "Unable to load categories."),
      ]);
      setCourses(Array.isArray(courseData) ? courseData : []);
      setCategories(Array.isArray(categoryData) ? categoryData : []);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to load courses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    document.title = "Course Management | EduNex";
    loadCourses();
  }, []);

  const filteredCourses = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = courses.filter((course) => {
      const haystack = [course.title, course.slug, categoryName(course)].join(" ").toLowerCase();
      const matchesSearch = !term || haystack.includes(term);
      const matchesStatus = status === "all" || course.status === status;
      const matchesCategory = category === "all" || categoryId(course) === category;
      return matchesSearch && matchesStatus && matchesCategory;
    });
    return rows.sort((a, b) => {
      if (sort === "title") return String(a.title || "").localeCompare(String(b.title || ""));
      if (sort === "videos") return Number(b.videoCount || b.videos?.length || 0) - Number(a.videoCount || a.videos?.length || 0);
      if (sort === "learners") return Number(b.totalStarted || 0) - Number(a.totalStarted || 0);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [courses, query, status, category, sort]);

  const summary = useMemo(() => {
    const totalVideos = filteredCourses.reduce((sum, course) => sum + Number(course.videoCount || course.videos?.length || 0), 0);
    const published = filteredCourses.filter((course) => course.status === "published").length;
    const draft = filteredCourses.length - published;
    const learners = filteredCourses.reduce((sum, course) => sum + Number(course.totalStarted || 0), 0);
    return [["Courses", filteredCourses.length], ["Published", published], ["Draft", draft], ["Videos", totalVideos], ["Learners", learners]].map(([label, value]) => [label, formatNumber(value)]);
  }, [filteredCourses]);

  function markPending(id, isPending) {
    setPendingIds((current) => {
      const next = new Set(current);
      if (isPending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function updateStatus(course) {
    const id = courseId(course);
    const nextStatus = course.status === "published" ? "draft" : "published";
    markPending(id, true);
    try {
      const updated = await adminJson(`/api/admin/courses/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) }, "Unable to update course.");
      setCourses((rows) => rows.map((item) => courseId(item) === id ? updated : item));
      setMessageType("success");
      setMessage(`Course moved to ${nextStatus}.`);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to update course.");
    } finally {
      markPending(id, false);
    }
  }

  async function deleteCourse(course) {
    const id = courseId(course);
    if (!window.confirm(`Delete ${course.title || "this course"} and its related learning records?`)) return;
    markPending(id, true);
    try {
      const data = await adminJson(`/api/admin/courses/${encodeURIComponent(id)}`, { method: "DELETE" }, "Unable to delete course.");
      setCourses((rows) => rows.filter((item) => courseId(item) !== id));
      if (openCourseId === id) setOpenCourseId("");
      setMessageType("success");
      setMessage(data.message || "Course deleted.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to delete course.");
    } finally {
      markPending(id, false);
    }
  }

  async function saveCourse(id, form) {
    const payload = {
      ...form,
      title: form.title.trim(),
      slug: form.slug.trim(),
      description: form.description.trim(),
      thumbnailUrl: form.thumbnailUrl.trim(),
      thumbnailVerticalUrl: form.thumbnailVerticalUrl.trim(),
      notesUrl: form.notesUrl.trim(),
      videos: form.videos.map((video, index) => ({
        title: video.title.trim() || `Video ${index + 1}`,
        description: video.description.trim(),
        duration: Number(video.duration || 0),
        videoUrl: video.videoUrl.trim(),
      })),
    };
    if (!payload.videos.length || payload.videos.some((video) => !video.videoUrl)) {
      setMessageType("error");
      setMessage("Every video needs a Bunny Stream URL.");
      return;
    }
    markPending(id, true);
    try {
      const updated = await adminJson(`/api/admin/courses/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }, "Unable to save course.");
      setCourses((rows) => rows.map((item) => courseId(item) === id ? updated : item));
      setOpenCourseId(id);
      setMessageType("success");
      setMessage("Course changes saved.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to save course.");
    } finally {
      markPending(id, false);
    }
  }

  return (
    <AdminShell
      activePage="courses"
      shellClass="courses-shell"
      title="Course Management"
      subtitle="Review, publish, update, and remove EduNex courses."
      actions={<button className="toolbar-button" type="button" onClick={loadCourses} disabled={loading}>Refresh</button>}
    >
      <Message text={message} type={messageType} />
      <form className="controls-panel" onSubmit={(event) => event.preventDefault()}>
        <div><label htmlFor="searchInput">Search</label><input id="searchInput" type="search" placeholder="Title, slug, category" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div><label htmlFor="statusFilter">Status</label><select id="statusFilter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option></select></div>
        <div><label htmlFor="categoryFilter">Category</label><select id="categoryFilter" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></div>
        <div><label htmlFor="sortFilter">Sort</label><select id="sortFilter" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="title">Title A-Z</option><option value="videos">Most videos</option><option value="learners">Most learners</option></select></div>
        <button className="toolbar-button" type="button" onClick={() => { setQuery(""); setStatus("all"); setCategory("all"); setSort("newest"); }}>Clear</button>
      </form>

      <section className="summary-grid course-summary-grid" aria-label="Course summary">
        {summary.map(([label, value]) => <div className="summary-card" key={label}><strong>{label}</strong><span>{value}</span></div>)}
      </section>

      <div className="crm-results-bar">
        <div><strong>Catalog workspace</strong><span>{formatNumber(filteredCourses.length)} shown from {formatNumber(courses.length)} total courses</span></div>
        <a className="toolbar-button" href={adminRoutes.upload}>New course</a>
      </div>

      <section className="courses-panel" aria-label="Courses">
        <div className="courses-head"><span>Course</span><span>Status</span><span>Category</span><span>Videos</span><span>Actions</span></div>
        {loading ? <div className="loading-state">Loading courses...</div> : null}
        {!loading && !filteredCourses.length ? <div className="empty-state">No courses found.</div> : null}
        {!loading && filteredCourses.map((course) => {
          const id = courseId(course);
          const isOpen = openCourseId === id;
          const isPending = pendingIds.has(id);
          return (
            <article className={`course-card${isOpen ? " is-open" : ""}`} key={id}>
              <div className="course-row">
                <div className="course-title-cell">
                  <div className="course-thumb">{course.thumbnailUrl ? <img src={course.thumbnailUrl} alt="" /> : <span>No image</span>}</div>
                  <div><strong>{course.title || "Untitled course"}</strong><span>{course.slug || course._id || ""}</span></div>
                </div>
                <span><span className={`badge ${statusClass(course.status)}`}>{statusLabel(course.status)}</span></span>
                <span>{categoryName(course)}</span>
                <span>{formatNumber(course.videoCount || course.videos?.length || 0)}</span>
                <div className="course-actions">
                  <button className="secondary-button" type="button" onClick={() => setOpenCourseId(isOpen ? "" : id)}>{isOpen ? "Close editor" : "Edit"}</button>
                  <button className="secondary-button" type="button" disabled={isPending} onClick={() => updateStatus(course)}>{course.status === "published" ? "Move to draft" : "Publish"}</button>
                  <button className="secondary-button danger" type="button" disabled={isPending} onClick={() => deleteCourse(course)}>Delete</button>
                </div>
              </div>
              {isOpen ? <CourseEditor course={course} categories={categories} saving={isPending} onCancel={() => setOpenCourseId("")} onSave={saveCourse} /> : null}
            </article>
          );
        })}
      </section>
    </AdminShell>
  );
}
