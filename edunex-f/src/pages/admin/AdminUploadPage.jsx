import { inferProvider, videoError, importLessons, CLOUDFRONT_HOST } from "./videoForm.js";
import { VideoPreview } from "./VideoPreview.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminShell, Message } from "./AdminShell.jsx";
import { adminJson, adminRoutes, formatNumber, requireAdmin, slugify } from "./adminApi.js";

function normalizeThumbnailUrl(url, width = 1600) {
  const value = String(url || "").trim();
  if (!/^https?:\/\/(?:www\.)?drive\.google\.com\//i.test(value)) return value;

  const pathMatch = value.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/i);
  const queryMatch = value.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  const driveFileId = pathMatch?.[1] || queryMatch?.[1];
  return driveFileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w${width}`
    : value;
}

const MAX_THUMBNAIL_FILE_SIZE = 2 * 1024 * 1024;
const THUMBNAIL_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function makeVideo(index = 0) {
  return {
    provider: "bunny_stream",
    title: "",
    topic: "",
    description: "",
    duration: "",
    videoUrl: "",
    thumbnailUrl: "",
    thumbnailVerticalUrl: "",
    examplePrompt: "",
    key: crypto.randomUUID(),
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
    thumbnailDataUrl: "",
    thumbnailVerticalDataUrl: "",
    thumbnailFileName: "",
    thumbnailVerticalFileName: "",
    notesUrl: "",
    videos: [makeVideo()],
  };
}

function courseIdFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return params.get("courseId") || params.get("id") || "";
}

function thumbnailPreviewSrc(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(data|blob):/i.test(raw)) return raw;

  try {
    const parsed = new URL(raw, window.location.origin);
    const isDrive = /(^|\.)drive\.google\.com$/i.test(parsed.hostname);
    if (isDrive) {
      const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
      const driveId = fileMatch?.[1] || parsed.searchParams.get("id");
      if (driveId) {
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1200`;
      }
    }
    if (parsed.origin === window.location.origin) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return `/api/image-proxy?url=${encodeURIComponent(parsed.href)}`;
  } catch (_) {
    return raw;
  }
}

function readThumbnailFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    if (!THUMBNAIL_FILE_TYPES.has(file.type)) {
      reject(new Error("Thumbnail upload must be a JPEG, PNG, or WebP image."));
      return;
    }

    if (file.size > MAX_THUMBNAIL_FILE_SIZE) {
      reject(new Error("Thumbnail upload must be smaller than 2 MB."));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not decode thumbnail."));
      image.onload = () => {
        const scale = Math.min(1, 960 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      image.src = String(reader.result || "");
    };
    reader.onerror = () => reject(new Error("Could not read the selected thumbnail image."));
    reader.readAsDataURL(file);
  });
}

function categoryId(course) {
  return String(course?.category?._id || course?.category || "");
}

function embeddedThumbnailDataUrl(...images) {
  const image = images.find((value) => value?.data);
  return image ? `data:${image.mimeType || image.contentType || "image/jpeg"};base64,${image.data}` : "";
}

function courseVideo(video, index) {
  return {
    _id: video?._id,
    provider: inferProvider(video),
    youtubeId: video?.youtubeId,
    transcriptUrl: video?.transcriptUrl,
    title: video?.title || `Video ${index + 1}`,
    topic: video?.topic || "",
    description: video?.description || "",
    duration: String(video?.duration || ""),
    videoUrl: video?.videoUrl || video?.embedUrl || video?.url || (video?.bunnyVideoId && video?.bunnyLibraryId ? `https://player.mediadelivery.net/embed/${video.bunnyLibraryId}/${video.bunnyVideoId}` : ""),
    thumbnailUrl: video?.thumbnailUrl || video?.thumbnailHorizontalUrl || "",
    thumbnailVerticalUrl: video?.thumbnailVerticalUrl || "",
    examplePrompt: video?.examplePrompt || video?.examplePromptText || video?.examplePromptUrl || video?.promptUrl || "",
    key: `${video?._id || video?.videoUrl || Date.now()}-${index}`,
  };
}

function courseForm(course) {
  const horizontalThumbnailDataUrl = embeddedThumbnailDataUrl(course?.thumbnailHorizontal, course?.thumbnail, course?.thumbnailVertical);
  const verticalThumbnailDataUrl = embeddedThumbnailDataUrl(course?.thumbnailVertical, course?.thumbnailHorizontal, course?.thumbnail);
  const courseId = String(course?._id || course?.id || "");
  const publishedThumbnailUrl = courseId && course?.status === "published" ? `/api/courses/${courseId}/thumbnail` : "";
  const publishedVerticalThumbnailUrl = courseId && course?.status === "published" ? `/api/courses/${courseId}/thumbnail?orientation=vertical` : "";
  const videos = Array.isArray(course?.videos) && course.videos.length
    ? course.videos.slice().sort((a,b)=>(a.order||0)-(b.order||0)).map((video,index) => ({...courseVideo(video,index),
      thumbnailUrl: video.thumbnailUrl === course.thumbnailUrl ? '' : video.thumbnailUrl || '',
      thumbnailVerticalUrl: video.thumbnailVerticalUrl === course.thumbnailVerticalUrl ? '' : video.thumbnailVerticalUrl || ''}))
    : [makeVideo()];
  return {
    title: course?.title || "",
    slug: course?.slug || "",
    description: course?.description || "",
    category: categoryId(course),
    status: course?.status === "published" ? "published" : "draft",
    thumbnailUrl: /^https?:\/\//i.test(course?.thumbnailUrl || "") ? course.thumbnailUrl : "",
    thumbnailStoredUrl: course?.thumbnailUrl || "",
    thumbnailPreviewUrl: course?.thumbnailUrl || publishedThumbnailUrl,
    thumbnailVerticalUrl: /^https?:\/\//i.test(course?.thumbnailVerticalUrl || "") ? course.thumbnailVerticalUrl : "",
    thumbnailVerticalStoredUrl: course?.thumbnailVerticalUrl || "",
    thumbnailVerticalPreviewUrl: course?.thumbnailVerticalUrl || publishedVerticalThumbnailUrl,
    thumbnailDataUrl: horizontalThumbnailDataUrl,
    thumbnailVerticalDataUrl: verticalThumbnailDataUrl,
    thumbnailFileName: "",
    thumbnailVerticalFileName: "",
    notesUrl: course?.notesUrl || "",
    videos,
  };
}

export function AdminUploadPage() {
  const [bulk, setBulk] = useState('');
  const [preview, setPreview] = useState(null);
  const [cloudHost, setCloudHost] = useState(CLOUDFRONT_HOST);
  useEffect(() => { adminJson('/api/admin/video-providers').then(data => setCloudHost(data.cloudFrontHost)).catch(() => {}); }, []);
  function moveVideo(index, offset) {
    setPreview(null);
    setForm(current => { const videos=[...current.videos]; const next=index+offset; if(next<0||next>=videos.length)return current; [videos[index],videos[next]]=[videos[next],videos[index]];return {...current,videos}; });
  }
  const checkingRef = useRef(false);
  const mountedRef = useRef(true);
  const [checking, setChecking] = useState(false);
  useEffect(() => { mountedRef.current=true; return () => { mountedRef.current=false; }; }, []);
  async function checkLessons(lessons) {
    if (checkingRef.current) return;
    checkingRef.current=true;setChecking(true);
    let cursor=0;
    async function worker() {
      while (cursor < lessons.length && mountedRef.current) {
        const lesson=lessons[cursor++];
        let result;
        try {
          const error=videoError(lesson,cloudHost);if(error)throw new Error(error);
          result=await adminJson('/api/admin/video-metadata',{method:'POST',body:JSON.stringify(lesson)});
        } catch(error) { result={message:error.message,error:true}; }
        if(!mountedRef.current)return;
        setForm(current=>({...current,videos:current.videos.map(v=>v.key===lesson.key && v.videoUrl===lesson.videoUrl && v.provider===lesson.provider ? {...v,
          duration: !result.error && String(v.duration)===String(lesson.duration) ? String(result.duration) : v.duration,
          metadataMessage:result.message,metadataError:!!result.error} : v)}));
      }
    }
    try { await Promise.all(Array.from({length:Math.min(3,lessons.length)},worker)); }
    finally { checkingRef.current=false;if(mountedRef.current)setChecking(false); }
  }
  function importBulk() {
    try {
      const imported=importLessons(bulk);
      for(const lesson of imported){const error=videoError(lesson,cloudHost);if(error)throw new Error(`${lesson.title}: ${error}`);}
      const existing=form.videos.filter(v=>v.title||v.videoUrl);
      if(existing.length+imported.length>500)throw new Error('A course can contain at most 500 lessons.');
      if(imported.some(v=>existing.some(old=>old.videoUrl===v.videoUrl)))throw new Error('One of these URLs is already in the course. Remove it from the import first.');
      const lessons=imported.map((v,i)=>({...makeVideo(i),...v}));
      setForm(current=>({...current,videos:[...current.videos.filter(v=>v.title||v.videoUrl),...lessons]}));
      setBulk('');setMessage('Lessons imported. Checking durations; review the generated titles and preview playback.');setMessageType('success');
      void checkLessons(lessons);
    } catch(error){setMessage(error.message);setMessageType('error');}
  }
  const editCourseId = courseIdFromLocation();
  const [editLoaded, setEditLoaded] = useState(false);
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
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const isEditing = Boolean(editCourseId);
  const previewThumbnailSrc = useMemo(
    () => thumbnailPreviewSrc(form.thumbnailDataUrl || form.thumbnailUrl || form.thumbnailVerticalDataUrl || form.thumbnailVerticalUrl || form.thumbnailPreviewUrl || form.thumbnailVerticalPreviewUrl),
    [form.thumbnailDataUrl, form.thumbnailUrl, form.thumbnailVerticalDataUrl, form.thumbnailVerticalUrl, form.thumbnailPreviewUrl, form.thumbnailVerticalPreviewUrl]
  );

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
    setEditLoaded(false);
    try {
      const course = await adminJson(`/api/admin/courses/${encodeURIComponent(editCourseId)}`, {}, "Unable to load course.");
      if (String(course._id || course.id) !== editCourseId) throw new Error("The requested course could not be loaded.");
      setForm(courseForm(course));
      setEditLoaded(true);
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

  useEffect(() => {
    setThumbnailFailed(false);
  }, [previewThumbnailSrc]);

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "title" && !slugTouched) next.slug = slugify(value);
      return next;
    });
  }

  async function updateThumbnailFile(field, fileNameField, file) {
    try {
      const dataUrl = await readThumbnailFile(file);
      setForm((current) => ({
        ...current,
        [field]: dataUrl,
        [fileNameField]: file?.name || "",
        ...(file && field === "thumbnailDataUrl" ? { thumbnailUrl: "" } : {}),
        ...(file && field === "thumbnailVerticalDataUrl" ? { thumbnailVerticalUrl: "" } : {}),
      }));
      setThumbnailFailed(false);
      setMessage("");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Could not use that thumbnail image.");
    }
  }

  function updateVideo(index, field, value) {
    setForm((current) => ({
      ...current,
      videos: current.videos.map((video, videoIndex) => videoIndex === index ? { ...video, [field]: value, ...(['videoUrl','provider'].includes(field) ? {duration:'',metadataMessage:'',metadataError:false} : {}) } : video),
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
    ["Lesson durations", form.videos.every(v=>Number(v.duration)>0)],
  ];
  const readinessWarnings = checks.filter(([, complete]) => !complete).map(([label]) => label);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isEditing && !editLoaded) return;
    const invalid = form.videos.map((video,index)=>({index,error:videoError(video,cloudHost)})).find(item=>item.error);
    if(invalid){setMessageType('error');setMessage(`Lesson ${invalid.index+1}: ${invalid.error}`);return;}
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      description: form.description.trim(),
      category: form.category,
      status: form.status,
      thumbnailUrl: normalizeThumbnailUrl(form.thumbnailUrl),
      thumbnailVerticalUrl: normalizeThumbnailUrl(form.thumbnailVerticalUrl),
      notesUrl: form.notesUrl.trim(),
      videos: form.videos.map((video, index) => ({
        _id: video._id, provider: video.provider, youtubeId: video.youtubeId, transcriptUrl: video.transcriptUrl, order: index + 1,
        title: video.title.trim() || `Video ${index + 1}`,
        topic: video.topic.trim(),
        description: video.description.trim(),
        duration: Number(video.duration || 0),
        videoUrl: video.videoUrl,
        thumbnailUrl: String(video.thumbnailUrl || "").trim(),
        thumbnailVerticalUrl: String(video.thumbnailVerticalUrl || "").trim(),
        examplePrompt: String(video.examplePrompt || "").trim(),
      })),
    };
    // Preserve existing internal storage references without putting them in URL inputs.
    if (!form.thumbnailUrl && form.thumbnailStoredUrl?.startsWith('/')) delete payload.thumbnailUrl;
    if (!form.thumbnailVerticalUrl && form.thumbnailVerticalStoredUrl?.startsWith('/')) delete payload.thumbnailVerticalUrl;
    if (form.thumbnailDataUrl) payload.thumbnailDataUrl = form.thumbnailDataUrl;
    if (form.thumbnailVerticalDataUrl) payload.thumbnailVerticalDataUrl = form.thumbnailVerticalDataUrl;

    if (!payload.title || !payload.slug || !payload.description || !payload.category || payload.videos.some((video) => !video.videoUrl && !video.youtubeId)) {
      setMessageType("error");
      setMessage("Complete the course details and at least one valid lesson.");
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
      subtitle={isEditing ? "Continue editing this course with the full upload layout." : "Create drafts and published courses with CloudFront HLS and Bunny Stream lessons."}
      actions={isEditing ? <a className="toolbar-button" href={adminRoutes.courses}>Back to courses</a> : null}
      navLabels={isEditing ? { upload: "Edit course" } : undefined}
    >
      <section className="editor-panel">
        {isEditing && !editLoaded ? (
          <div role={loadingCourse ? 'status' : 'alert'} className="loading-state">
            <p>{loadingCourse ? 'Loading your course and lessons…' : message || 'The course could not be loaded.'}</p>
            {!loadingCourse && <button type="button" className="secondary-button" onClick={loadCourseForEdit}>Retry loading course</button>}
            <a href={adminRoutes.courses}>Back to course library</a>
          </div>
        ) : <form className="course-form" onSubmit={handleSubmit}>
          <nav className="course-editor-steps" aria-label="Course editor sections">
            {["Basic details", "Pricing / access", "Course media", "Modules & lessons", "Certificate settings", "SEO metadata", "Publish settings"].map((step, index) => <a href={index < 3 ? "#title" : "#bulkLessons"} key={step}>{step}</a>)}
          </nav>
          <div className="course-builder-grid">
            <div className="form-section">
              <div className="form-section-head"><div><h2>Course Details</h2><p>Enter these once. All lessons share the category, course notes and thumbnails unless overridden.</p></div></div>
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
                <div className="field"><label htmlFor="thumbnailUrl">Horizontal thumbnail URL</label><input id="thumbnailUrl" name="thumbnailUrl" type="url" placeholder="https://..." value={form.thumbnailUrl} onChange={(event) => updateField("thumbnailUrl", event.target.value)} /><small>Google Drive links are supported when the file is shared publicly.</small></div>
                <div className="field"><label htmlFor="thumbnailVerticalUrl">Vertical thumbnail URL</label><input id="thumbnailVerticalUrl" name="thumbnailVerticalUrl" type="url" placeholder="https://..." value={form.thumbnailVerticalUrl} onChange={(event) => updateField("thumbnailVerticalUrl", event.target.value)} /><small>Use a public image URL or public Google Drive file link.</small></div>
                <div className="field">
                  <label htmlFor="thumbnailUpload">Upload horizontal thumbnail</label>
                  <div className="file-upload-control">
                    <input className="file-upload-input" id="thumbnailUpload" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => updateThumbnailFile("thumbnailDataUrl", "thumbnailFileName", event.target.files?.[0])} />
                    <label className="file-upload-button" htmlFor="thumbnailUpload">Choose file</label>
                    <span className="file-upload-name">{form.thumbnailFileName || "No file chosen"}</span>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="thumbnailVerticalUpload">Upload vertical thumbnail</label>
                  <div className="file-upload-control">
                    <input className="file-upload-input" id="thumbnailVerticalUpload" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => updateThumbnailFile("thumbnailVerticalDataUrl", "thumbnailVerticalFileName", event.target.files?.[0])} />
                    <label className="file-upload-button" htmlFor="thumbnailVerticalUpload">Choose file</label>
                    <span className="file-upload-name">{form.thumbnailVerticalFileName || "No file chosen"}</span>
                  </div>
                </div>
                <div className="field span-2"><label htmlFor="notesUrl">Notes URL</label><input id="notesUrl" name="notesUrl" type="url" placeholder="https://..." value={form.notesUrl} onChange={(event) => updateField("notesUrl", event.target.value)} /></div>
              </div>
            </div>

            <aside className="form-section course-preview-panel" aria-label="Course preview">
              <div className={`thumbnail-preview-card${thumbnailFailed ? " has-error" : ""}`}>
                {previewThumbnailSrc ? (
                  <>
                    <img
                      src={previewThumbnailSrc}
                      alt=""
                      onError={() => setThumbnailFailed(true)}
                    />
                    {thumbnailFailed ? <span>Thumbnail URL is not public or not an image</span> : null}
                  </>
                ) : (
                  <span>No thumbnail selected</span>
                )}
              </div>
              {thumbnailFailed ? (
                <p className="thumbnail-help">Google Drive thumbnails must be public. Upload the image here or use a direct image/CDN URL.</p>
              ) : null}
              <div className="preview-copy"><span>{form.status === "published" ? "Published" : "Draft"}</span><h2>{form.title.trim() || "Untitled course"}</h2><p>{form.description.trim() || "Course description preview will appear here."}</p></div>
              <div className="publish-checklist">{checks.map(([label, complete]) => <span className={complete ? "is-complete" : ""} key={label}>{complete ? "[x]" : "[ ]"} {label}</span>)}</div>
              <div className="admin-placeholder-note">{readinessWarnings.length ? `Inline warnings: ${readinessWarnings.join(", ")} still need attention before publishing.` : "Ready for admin preview. Pricing, SEO, and certificate toggles are not saved until backend course fields are added."}</div>
            </aside>
          </div>

          <section className="form-section admin-editor-grid" aria-label="Pricing, certificate and SEO placeholders">
            <div><h2>Pricing / Subscription Access</h2><p>Backend API not connected for price, plan access, free/paid mode, and featured course flags.</p></div>
            <div><h2>Certificate Settings</h2><p>Use Operations → Certification for live criteria today. Course-level certificate toggles need backend course fields.</p></div>
            <div><h2>SEO / Metadata</h2><p>Slug, title, description, notes URL and thumbnails are saved now. Meta title and search tags need backend fields.</p></div>
          </section>

          <div className="course-publish-panel">
            <div className="publish-panel-head"><div><h2>Videos</h2><p>Add permanent video references, arrange lessons, and preview before publishing.</p></div><span>{formatNumber(form.videos.length)} {form.videos.length === 1 ? "video" : "videos"}</span></div>
            <div className="field"><label htmlFor="bulkLessons">Paste lesson URLs</label><textarea id="bulkLessons" value={bulk} onChange={e=>setBulk(e.target.value)} placeholder={'https://d2vntxz4x493rp.cloudfront.net/Course/01_Introduction/master.m3u8\nhttps://d2vntxz4x493rp.cloudfront.net/Course/02_Next_Lesson/master.m3u8'}/><button type="button" className="secondary-button" disabled={checking} onClick={importBulk}>Import & detect durations</button></div>
            <p>One URL per line. Titles and numbering come from filenames or lesson folders; numbered title + URL imports still work.</p>
            <button type="button" className="secondary-button" disabled={checking} onClick={()=>checkLessons(form.videos)}>{checking?'Checking video details…':'Detect all durations / retry checks'}</button>
            <p role="status">{checking?'You can keep editing while checks run.': 'Detected duration does not replace a playback preview. Retry failed checks after confirming the video URL and provider access.'}</p>
            {preview ? <VideoPreview key={preview.key} video={preview} onClose={()=>setPreview(null)}/> : null}
            <div className="video-editor">
              {form.videos.map((video, index) => (
                <article className="video-entry" key={video.key}>
                  <div className="video-entry-head"><strong className="video-entry-title">Lesson {index + 1}</strong><button type="button" className="toolbar-button" disabled={index===0} onClick={()=>moveVideo(index,-1)}>Move up</button><button type="button" className="toolbar-button" disabled={index===form.videos.length-1} onClick={()=>moveVideo(index,1)}>Move down</button><button type="button" className="toolbar-button" onClick={()=>{const error=videoError(video,cloudHost);if(error){setMessageType('error');setMessage(error);}else setPreview({...video,key:Date.now()});}}>Preview</button><button className="action-button danger" type="button" onClick={() => removeVideo(index)}>Remove</button></div>
                  <div className="form-grid">
                    <div className="field"><label htmlFor={`videoProvider${index}`}>Video provider</label><select id={`videoProvider${index}`} value={video.provider} onChange={e=>updateVideo(index,'provider',e.target.value)}><option value="aws_cloudfront">AWS CloudFront</option><option value="bunny_stream">Bunny Stream</option>{video.provider==='youtube'?<option value="youtube">YouTube (existing)</option>:null}</select></div>
                    <div className="field"><label htmlFor={`videoTitle${index}`}>Title</label><input id={`videoTitle${index}`} value={video.title} required onChange={(event) => updateVideo(index, "title", event.target.value)} /></div>
                    <div className="field span-2"><label htmlFor={`videoUrl${index}`}>Permanent video URL</label><input id={`videoUrl${index}`} type="text" required={video.provider!=="youtube"} spellCheck={false} placeholder={video.provider==="aws_cloudfront"?`https://${cloudHost}/Course/Lesson/master.m3u8`:"https://player.mediadelivery.net/embed/..."} value={video.videoUrl} onChange={(event) => updateVideo(index, "videoUrl", event.target.value)} /></div>
                  </div>
                  <p role="status">{video.metadataMessage || 'Uses course thumbnails and notes. Duration can be detected automatically.'}</p>
                  <details className="lesson-advanced"><summary>Advanced · optional lesson overrides</summary><div className="form-grid">
                    <div className="field"><label htmlFor={`videoTopic${index}`}>Topic</label><input id={`videoTopic${index}`} maxLength={80} placeholder="e.g. Prompt Engineering" value={video.topic} onChange={(event) => updateVideo(index, "topic", event.target.value)} /></div>
                    <div className="field"><label htmlFor={`videoThumbnailUrl${index}`}>Horizontal thumbnail URL</label><input id={`videoThumbnailUrl${index}`} type="url" placeholder="https://..." value={video.thumbnailUrl} onChange={(event) => updateVideo(index, "thumbnailUrl", event.target.value)} /></div>
                    <div className="field"><label htmlFor={`videoThumbnailVerticalUrl${index}`}>Vertical thumbnail URL</label><input id={`videoThumbnailVerticalUrl${index}`} type="url" placeholder="https://..." value={video.thumbnailVerticalUrl} onChange={(event) => updateVideo(index, "thumbnailVerticalUrl", event.target.value)} /></div>
                    <div className="field span-2"><label htmlFor={`examplePrompt${index}`}>Example prompt</label><textarea id={`examplePrompt${index}`} placeholder="Example: Create a 30-second ad script for a local bakery using this framework." value={video.examplePrompt} onChange={(event) => updateVideo(index, "examplePrompt", event.target.value)} /></div>
                    <div className="field span-2"><label htmlFor={`videoDescription${index}`}>Description</label><textarea id={`videoDescription${index}`} value={video.description} onChange={(event) => updateVideo(index, "description", event.target.value)} /></div>
                  </div></details>
                </article>
              ))}
            </div>
            <button className="secondary-button" type="button" onClick={addVideo}>Add video</button>
          </div>

          <button className="submit-button" type="submit" disabled={submitting || loadingCourse || (isEditing && !editLoaded)}>{submitting ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save changes" : "Create course")}</button>
          <Message text={message} type={messageType} />
        </form>}
      </section>
    </AdminShell>
  );
}
