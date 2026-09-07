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

export function AdminCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("newest");
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
    document.title = "Course Management | Skillomate";
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
      setMessageType("success");
      setMessage(data.message || "Course deleted.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to delete course.");
    } finally {
      markPending(id, false);
    }
  }

  return (
    <AdminShell
      activePage="courses"
      shellClass="courses-shell"
      title="Course Management"
      subtitle="Review, publish, update, and remove Skillomate courses."
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
          const isPending = pendingIds.has(id);
          return (
            <article className="course-card" key={id}>
              <div className="course-row">
                <div className="course-title-cell">
                  <div className="course-thumb">{course.thumbnailUrl ? <img src={course.thumbnailUrl} alt="" /> : <span>No image</span>}</div>
                  <div><strong>{course.title || "Untitled course"}</strong><span>{course.slug || course._id || ""}</span></div>
                </div>
                <span><span className={`badge ${statusClass(course.status)}`}>{statusLabel(course.status)}</span></span>
                <span>{categoryName(course)}</span>
                <span>{formatNumber(course.videoCount || course.videos?.length || 0)}</span>
                <div className="course-actions">
                  <a className="secondary-button" href={`${adminRoutes.upload}?courseId=${encodeURIComponent(id)}`}>Edit</a>
                  <button className="secondary-button" type="button" disabled={isPending} onClick={() => updateStatus(course)}>{course.status === "published" ? "Move to draft" : "Publish"}</button>
                  <button className="secondary-button danger" type="button" disabled={isPending} onClick={() => deleteCourse(course)}>Delete</button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </AdminShell>
  );
}
