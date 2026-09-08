import { useEffect, useMemo, useState } from "react";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, adminRoutes, formatNumber, requireAdmin, slugify } from "./adminApi.js";

function makeVideo(index = 0) {
  return {
    title: "",
    description: "",
    duration: "",
    videoUrl: "",
    thumbnailUrl: "",
    thumbnailVerticalUrl: "",
    examplePrompt: "",
    key: `${Date.now()}-${index}`,
  };
}

function emptyCourseForm() {
  return {
    title: "",
    slug: "",
    description: "",
    category: "",
    status: "draft",
    thumbnailUrl: "",
    thumbnailVerticalUrl: "",
    notesUrl: "",
    videos: [makeVideo()],
  };
}

function courseIdFromLocation() {
  return new URLSearchParams(window.location.search).get("courseId") || "";
}

function categoryId(course) {
  return String(course?.category?._id || course?.category || "");
}

function courseVideo(video, index) {
  return {
    title: video?.title || `Video ${index + 1}`,
    description: video?.description || "",
    duration: String(video?.duration || ""),
    videoUrl: video?.videoUrl || video?.url || "",
    thumbnailUrl: video?.thumbnailUrl || video?.thumbnailHorizontalUrl || "",
    thumbnailVerticalUrl: video?.thumbnailVerticalUrl || "",
    examplePrompt: video?.examplePrompt || video?.examplePromptText || video?.examplePromptUrl || video?.promptUrl || "",
    key: `${video?._id || video?.videoUrl || Date.now()}-${index}`,
  };
}

function courseForm(course) {
  const videos = Array.isArray(course?.videos) && course.videos.length
    ? course.videos.map(courseVideo)
    : [makeVideo()];
  return {
    title: course?.title || "",
    slug: course?.slug || "",
    description: course?.description || "",
    category: categoryId(course),
    status: course?.status === "published" ? "published" : "draft",
    thumbnailUrl: course?.thumbnailUrl || "",
    thumbnailVerticalUrl: course?.thumbnailVerticalUrl || "",
    notesUrl: course?.notesUrl || "",
    videos,
  };
}

export function AdminUploadPage() {
  const [editCourseId] = useState(courseIdFromLocation);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyCourseForm);
  const [slugTouched, setSlugTouched] = useState(Boolean(editCourseId));
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingCourse, setLoadingCourse] = useState(Boolean(editCourseId));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const isEditing = Boolean(editCourseId);

  async function loadCategories() {
    if (!requireAdmin()) return;
    setLoadingCategories(true);
    try {
      const data = await adminJson("/api/categories", {}, "Unable to load categories.");
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to load categories.");
    } finally {
      setLoadingCategories(false);
    }
  }

  async function loadCourseForEdit() {
    if (!editCourseId || !requireAdmin()) return;
    setLoadingCourse(true);
    try {
      const data = await adminJson("/api/admin/courses", {}, "Unable to load course.");
      const course = (Array.isArray(data) ? data : []).find((item) => String(item?._id || item?.id || "") === editCourseId);
      if (!course) throw new Error("Course not found.");
      setForm(courseForm(course));
      setSlugTouched(true);
      setMessage("");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to load course.");
    } finally {
      setLoadingCourse(false);
    }
  }

  useEffect(() => {
    document.title = isEditing ? "Edit Course | Skillomate" : "Upload Course | Skillomate";
    loadCategories();
    loadCourseForEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCourseId]);

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "title" && !slugTouched) next.slug = slugify(value);
      return next;
    });
  }

  function updateVideo(index, field, value) {
    setForm((current) => ({
      ...current,
      videos: current.videos.map((video, videoIndex) => videoIndex === index ? { ...video, [field]: value } : video),
    }));
  }

  function addVideo() {
    setForm((current) => ({ ...current, videos: [...current.videos, makeVideo(current.videos.length)] }));
  }

  function removeVideo(index) {
    setForm((current) => {
      if (current.videos.length <= 1) {
        setMessageType("error");
        setMessage("Keep at least one video in the course.");
        return current;
      }
      return { ...current, videos: current.videos.filter((_, videoIndex) => videoIndex !== index) };
    });
  }

  async function createCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      setMessageType("error");
      setMessage("Enter a category name.");
      return;
    }
    try {
      const category = await adminJson("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name, slug: slugify(name), isActive: true }),
      }, "Unable to create category.");
      setCategories((rows) => [...rows, category].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))));
      updateField("category", category._id);
      setNewCategoryName("");
      setCategoryOpen(false);
      setMessageType("success");
      setMessage("Category created.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Unable to create category.");
    }
  }

  const completeVideos = useMemo(() => form.videos.filter((video) => video.videoUrl.trim()).length, [form.videos]);
  const checks = [
    ["Title", Boolean(form.title.trim())],
    ["Slug", Boolean(form.slug.trim())],
    ["Description", Boolean(form.description.trim())],
    ["Category", Boolean(form.category)],
    ["Video URLs", Boolean(form.videos.length && completeVideos === form.videos.length)],
  ];

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      description: form.description.trim(),
      category: form.category,
      status: form.status,
      thumbnailUrl: form.thumbnailUrl.trim(),
      thumbnailVerticalUrl: form.thumbnailVerticalUrl.trim(),
      notesUrl: form.notesUrl.trim(),
      videos: form.videos.map((video, index) => ({
        title: video.title.trim() || `Video ${index + 1}`,
        description: video.description.trim(),
        duration: Number(video.duration || 0),
        videoUrl: video.videoUrl.trim(),
        thumbnailUrl: String(video.thumbnailUrl || "").trim(),
        thumbnailVerticalUrl: String(video.thumbnailVerticalUrl || "").trim(),
        examplePrompt: String(video.examplePrompt || "").trim(),
      })),
    };
    if (!payload.title || !payload.slug || !payload.description || !payload.category || payload.videos.some((video) => !video.videoUrl)) {
      setMessageType("error");
      setMessage("Complete the course details and at least one Bunny video URL.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const endpoint = isEditing ? `/api/admin/courses/${encodeURIComponent(editCourseId)}` : "/api/courses";
      const method = isEditing ? "PATCH" : "POST";
      const savedCourse = await adminJson(endpoint, { method, body: JSON.stringify(payload) }, isEditing ? "Unable to update course." : "Unable to create course.");
      setMessageType("success");
      setMessage(isEditing ? "Course updated successfully." : "Course created successfully.");
      if (isEditing) {
        setForm(courseForm(savedCourse));
        setSlugTouched(true);
      } else {
        setForm(emptyCourseForm());
        setSlugTouched(false);
      }
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || (isEditing ? "Unable to update course." : "Unable to create course."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminShell
      activePage="upload"
      shellClass="course-upload-shell"
      title={isEditing ? "Edit Course" : "Upload Course"}
      subtitle={isEditing ? "Continue editing this course with the full upload layout." : "Create a draft or published course with Bunny Stream video URLs."}
      actions={isEditing ? <a className="toolbar-button" href={adminRoutes.courses}>Back to courses</a> : null}
    >
      <section className="editor-panel">
        {loadingCourse ? <div className="loading-state">Loading course editor...</div> : null}
        <form className="course-form" onSubmit={handleSubmit}>
          <div className="course-builder-grid">
            <div className="form-section">
              <div className="form-section-head"><div><h2>Course Details</h2><p>Set the public catalog identity before attaching lessons.</p></div></div>
              <div className="form-grid">
                <div className="field"><label htmlFor="title">Course title</label><input id="title" name="title" required maxLength={120} value={form.title} onChange={(event) => updateField("title", event.target.value)} /></div>
                <div className="field"><label htmlFor="slug">Slug</label><input id="slug" name="slug" required maxLength={120} value={form.slug} onChange={(event) => { setSlugTouched(true); updateField("slug", event.target.value); }} /></div>
                <div className="field span-2"><label htmlFor="description">Description</label><textarea id="description" name="description" required maxLength={3000} value={form.description} onChange={(event) => updateField("description", event.target.value)} /></div>
                <div className="field">
                  <label htmlFor="category">Category</label>
                  <select id="category" name="category" required value={form.category} onChange={(event) => updateField("category", event.target.value)}>
                    <option value="">{loadingCategories ? "Loading categories..." : "Choose category"}</option>
                    {categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
                  </select>
                  <button className="secondary-button compact-button" type="button" onClick={() => setCategoryOpen((value) => !value)}>New category</button>
                  <div className={`category-create${categoryOpen ? " is-visible" : ""}`}>
                    <input type="text" placeholder="Category name" maxLength={80} value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} />
                    <button className="secondary-button" type="button" onClick={createCategory}>Create</button>
                  </div>
                </div>
                <div className="field"><label htmlFor="status">Status</label><select id="status" name="status" value={form.status} onChange={(event) => updateField("status", event.target.value)}><option value="draft">Draft</option><option value="published">Published</option></select></div>
                <div className="field"><label htmlFor="thumbnailUrl">Horizontal thumbnail URL</label><input id="thumbnailUrl" name="thumbnailUrl" type="url" placeholder="https://..." value={form.thumbnailUrl} onChange={(event) => updateField("thumbnailUrl", event.target.value)} /></div>
                <div className="field"><label htmlFor="thumbnailVerticalUrl">Vertical thumbnail URL</label><input id="thumbnailVerticalUrl" name="thumbnailVerticalUrl" type="url" placeholder="https://..." value={form.thumbnailVerticalUrl} onChange={(event) => updateField("thumbnailVerticalUrl", event.target.value)} /></div>
                <div className="field span-2"><label htmlFor="notesUrl">Notes URL</label><input id="notesUrl" name="notesUrl" type="url" placeholder="https://..." value={form.notesUrl} onChange={(event) => updateField("notesUrl", event.target.value)} /></div>
              </div>
            </div>

            <aside className="form-section course-preview-panel" aria-label="Course preview">
              <div className="thumbnail-preview-card">{form.thumbnailUrl ? <img src={form.thumbnailUrl} alt="" /> : <span>No thumbnail URL</span>}</div>
              <div className="preview-copy"><span>{form.status === "published" ? "Published" : "Draft"}</span><h2>{form.title.trim() || "Untitled course"}</h2><p>{form.description.trim() || "Course description preview will appear here."}</p></div>
              <div className="publish-checklist">{checks.map(([label, complete]) => <span className={complete ? "is-complete" : ""} key={label}>{complete ? "[x]" : "[ ]"} {label}</span>)}</div>
            </aside>
          </div>

          <div className="course-publish-panel">
            <div className="publish-panel-head"><div><h2>Videos</h2><p>Every video must include a valid Bunny Stream URL.</p></div><span>{formatNumber(form.videos.length)} {form.videos.length === 1 ? "video" : "videos"}</span></div>
            <div className="video-editor">
              {form.videos.map((video, index) => (
                <article className="video-entry" key={video.key}>
                  <div className="video-entry-head"><strong className="video-entry-title">Video {index + 1}</strong><button className="action-button danger" type="button" onClick={() => removeVideo(index)}>Remove</button></div>
                  <div className="form-grid">
                    <div className="field"><label htmlFor={`videoTitle${index}`}>Title</label><input id={`videoTitle${index}`} value={video.title} required onChange={(event) => updateVideo(index, "title", event.target.value)} /></div>
                    <div className="field"><label htmlFor={`videoDuration${index}`}>Duration seconds</label><input id={`videoDuration${index}`} type="number" min="0" step="1" value={video.duration} onChange={(event) => updateVideo(index, "duration", event.target.value)} /></div>
                    <div className="field span-2"><label htmlFor={`videoUrl${index}`}>Bunny Stream URL</label><input id={`videoUrl${index}`} type="url" required placeholder="https://player.mediadelivery.net/embed/..." value={video.videoUrl} onChange={(event) => updateVideo(index, "videoUrl", event.target.value)} /></div>
                    <div className="field"><label htmlFor={`videoThumbnailUrl${index}`}>Horizontal thumbnail URL</label><input id={`videoThumbnailUrl${index}`} type="url" placeholder="https://..." value={video.thumbnailUrl} onChange={(event) => updateVideo(index, "thumbnailUrl", event.target.value)} /></div>
                    <div className="field"><label htmlFor={`videoThumbnailVerticalUrl${index}`}>Vertical thumbnail URL</label><input id={`videoThumbnailVerticalUrl${index}`} type="url" placeholder="https://..." value={video.thumbnailVerticalUrl} onChange={(event) => updateVideo(index, "thumbnailVerticalUrl", event.target.value)} /></div>
                    <div className="field span-2"><label htmlFor={`examplePrompt${index}`}>Example prompt</label><textarea id={`examplePrompt${index}`} placeholder="Example: Create a 30-second ad script for a local bakery using this framework." value={video.examplePrompt} onChange={(event) => updateVideo(index, "examplePrompt", event.target.value)} /></div>
                    <div className="field span-2"><label htmlFor={`videoDescription${index}`}>Description</label><textarea id={`videoDescription${index}`} value={video.description} onChange={(event) => updateVideo(index, "description", event.target.value)} /></div>
                  </div>
                </article>
              ))}
            </div>
            <button className="secondary-button" type="button" onClick={addVideo}>Add video</button>
          </div>

          <button className="submit-button" type="submit" disabled={submitting || loadingCourse}>{submitting ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save changes" : "Create course")}</button>
          <Message text={message} type={messageType} />
        </form>
      </section>
    </AdminShell>
  );
}
