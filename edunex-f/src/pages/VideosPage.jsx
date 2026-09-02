import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { page as videosPage } from "../generated-pages/videos.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";

const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27900%27%20height=%27600%27%20viewBox=%270%200%20900%20600%27%3E%3Crect%20width=%27900%27%20height=%27600%27%20fill=%27%23000000%27/%3E%3Crect%20x=%271%27%20y=%271%27%20width=%27898%27%20height=%27598%27%20rx=%2732%27%20fill=%27%230d0d0d%27%20stroke=%27%23C58B2A%27%20stroke-opacity=%27.35%27/%3E%3Ctext%20x=%27450%27%20y=%27312%27%20text-anchor=%27middle%27%20fill=%27%23C58B2A%27%20font-family=%27Arial%27%20font-size=%2748%27%20font-weight=%27800%27%3EEduNex%3C/text%3E%3C/svg%3E";
const AUTO_NEXT_KEY = "edunexAutoNextVideo";

function queryParams() {
  return new URLSearchParams(window.location.search);
}

function getToken() {
  return localStorage.getItem("edunexAccessToken") || sessionStorage.getItem("edunexAccessToken") || "";
}

function clearAuthStorage() {
  ["edunexAccessToken", "edunexRefreshToken", "edunexUser"].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

function paymentUrlForCourse(courseId) {
  const paymentUrl = new URL("/payment.html", window.location.origin);
  if (courseId) paymentUrl.searchParams.set("courseId", courseId);
  paymentUrl.searchParams.set("next", window.location.pathname + window.location.search);
  return paymentUrl.pathname + paymentUrl.search;
}

function normalizeSubscriptionStatus(status) {
  return String(status || "none").trim().toLowerCase();
}

function hasCourseAccess(subscriptionData) {
  if (typeof subscriptionData?.hasActiveAccess === "boolean") return subscriptionData.hasActiveAccess;
  const status = normalizeSubscriptionStatus(
    subscriptionData?.subscriptionDocStatus || subscriptionData?.status || subscriptionData?.subscriptionStatus,
  );
  const now = Date.now();
  if (status === "trial_active" || status === "paid_active") return true;
  if (status === "trial" || status === "1rs trial") {
    return !subscriptionData?.trialExpiresAt || new Date(subscriptionData.trialExpiresAt).getTime() > now;
  }
  if (status === "active" || status === "subscribed") {
    return !subscriptionData?.currentPeriodEnd || new Date(subscriptionData.currentPeriodEnd).getTime() > now;
  }
  return false;
}

function googleDriveImageUrl(url) {
  const value = String(url || "").trim();
  if (!value.includes("drive.google.com")) return value;
  const patterns = [/\/file\/d\/([^/]+)/, /[?&]id=([^&]+)/, /\/uc\?export=(?:download|view)&id=([^&]+)/];
  const match = patterns.map((pattern) => value.match(pattern)).find(Boolean);
  const id = match?.[1];
  return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200` : value;
}

function proxyImageUrl(url) {
  const value = googleDriveImageUrl(url);
  if (!value || /^(data|blob):/i.test(value)) return value;
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin === window.location.origin) return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return `/api/image-proxy?url=${encodeURIComponent(parsed.href)}`;
  } catch (_) {
    return value;
  }
}

function courseImage(course) {
  const embedded = course?.thumbnailHorizontal || course?.thumbnail || course?.thumbnailVertical || course?.videos?.[0]?.thumbnail;
  if (embedded?.data && embedded?.mimeType) return `data:${embedded.mimeType};base64,${embedded.data}`;
  if (course?.thumbnailUrl) return proxyImageUrl(course.thumbnailUrl);
  if (course?.thumbnailVerticalUrl) return proxyImageUrl(course.thumbnailVerticalUrl);
  if (course?.videos?.[0]?.thumbnailUrl) return proxyImageUrl(course.videos[0].thumbnailUrl);
  if (course?.videos?.[0]?.youtubeId) return proxyImageUrl(`https://img.youtube.com/vi/${course.videos[0].youtubeId}/hqdefault.jpg`);
  return FALLBACK_IMAGE;
}

function lessonImage(course, lesson) {
  if (lesson?.thumbnail?.data && lesson?.thumbnail?.mimeType) return `data:${lesson.thumbnail.mimeType};base64,${lesson.thumbnail.data}`;
  if (lesson?.thumbnailUrl) return proxyImageUrl(lesson.thumbnailUrl);
  if (lesson?.youtubeId) return proxyImageUrl(`https://img.youtube.com/vi/${lesson.youtubeId}/mqdefault.jpg`);
  return courseImage(course);
}

function fallbackImage(label = "EduNex") {
  const clean = String(label || "EduNex").replace(/[&<>"']/g, "").slice(0, 32);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><rect width="900" height="600" fill="#050710"/><rect x="1" y="1" width="898" height="598" rx="32" fill="#0d0d0d" stroke="#C58B2A" stroke-opacity=".35"/><text x="450" y="300" text-anchor="middle" fill="#C58B2A" font-family="Arial" font-size="42" font-weight="800">${clean}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function courseProgress(course) {
  try {
    const saved = JSON.parse(localStorage.getItem(`edunexCourseProgress:${course._id}`) || "{}");
    const total = Math.max(course.videos?.length || 0, 1);
    const index = Math.min(Number(saved.lessonIndex || 0), total - 1);
    const completed = Number(saved.completed || 0);
    const percent = saved.percent ?? Math.round((completed / total) * 100);
    return { index, completed, percent: Math.max(0, Math.min(100, percent)) };
  } catch (_) {
    return { index: 0, completed: 0, percent: 0 };
  }
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!value) return "Video";
  const minutes = Math.max(1, Math.round(value / 60));
  return `${minutes} min`;
}

function formatVideoTime(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  const hrs = Math.floor(value / 3600);
  const mins = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  return hrs ? `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${mins}:${String(secs).padStart(2, "0")}`;
}

function normalizeCourse(course) {
  return {
    ...course,
    _id: String(course?._id || course?.id || course?.slug || course?.title || ""),
    videos: Array.isArray(course?.videos) ? course.videos : [],
  };
}

function embedUrl(lesson) {
  if (lesson?.embedUrl) return lesson.embedUrl;
  if (lesson?.youtubeId) return `https://www.youtube.com/embed/${lesson.youtubeId}?rel=0&autoplay=0`;
  if (lesson?.videoUrl) return lesson.videoUrl;
  return "";
}

function isBunnyEmbedUrl(value) {
  return /player\.mediadelivery\.net\/embed|iframe\.mediadelivery\.net\/embed/i.test(String(value || ""));
}

function isHlsUrl(value) {
  return /\.m3u8(\?|#|$)/i.test(String(value || ""));
}

function loadHlsJs() {
  if (window.Hls) return Promise.resolve(window.Hls);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-edunex-hls="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Hls), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
    script.async = true;
    script.dataset.edunexHls = "true";
    script.onload = () => resolve(window.Hls);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function directVideoUrl(lesson) {
  const value = String(lesson?.videoUrl || "").trim();
  if (!value) return "";
  return /\.(mp4|webm|ogg|mov|m4v|m3u8)(\?|#|$)/i.test(value) ? value : "";
}

function bunnyStreamUrl(lesson) {
  return String(lesson?.hlsUrl || lesson?.playlistUrl || lesson?.streamUrl || "").trim();
}

function noteValue(course) {
  return course?.notesUrl || course?.notesURL || course?.notesLink || course?.courseNotesUrl || course?.notes || course?.courseNotes || "";
}

function isLikelyUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim()) || /^\/[^/]/.test(String(value || "").trim());
}

function nextPlaybackRate(rate) {
  const rates = [1, 1.5, 2, 0.5];
  const current = Number(rate) || 1;
  const index = rates.findIndex((value) => value === current);
  return rates[(index + 1) % rates.length];
}

function VideoControls({ playing, volume, muted, rate, currentTime, duration, onToggle, onSeek, onVolume, onMute, onRate, onFullscreen, onAi, onTapLeft, onTapRight }) {
  const percent = duration ? Math.round((currentTime / duration) * 1000) : 0;
  const volumeIcon = muted || volume <= 0 ? "fa-volume-xmark" : volume < 0.5 ? "fa-volume-low" : "fa-volume-high";
  return (
    <>
      <button className="video-screen-btn video-fullscreen-btn" type="button" data-action="fullscreen" aria-label="Fullscreen" onClick={onFullscreen}><i className="fas fa-expand" aria-hidden="true"></i></button>
      <button className="video-screen-btn video-ai-screen-btn" type="button" data-action="ai" onClick={onAi}><i className="fas fa-bolt" aria-hidden="true"></i><span>AI</span></button>
      <button className="tap-zone tap-zone-left" type="button" aria-label="Rewind 10 seconds" onClick={onTapLeft}><span className="tap-hint">-10s</span></button>
      <button className="tap-zone tap-zone-right" type="button" aria-label="Forward 10 seconds" onClick={onTapRight}><span className="tap-hint">+10s</span></button>
      <div className="custom-video-controls">
        <button className="video-control-btn" type="button" data-action="toggle" aria-label={playing ? "Pause" : "Play"} onClick={onToggle}>
          <i className={`fas ${playing ? "fa-pause" : "fa-play"}`} aria-hidden="true"></i>
        </button>
        <div className="video-volume" aria-label="Volume control">
          <button className="video-control-btn" type="button" data-action="mute" aria-label={muted || volume <= 0 ? "Unmute" : "Mute"} onClick={onMute}>
            <i className={`fas ${volumeIcon}`} aria-hidden="true"></i>
          </button>
          <input className="video-volume-slider" type="range" min="0" max="100" value={Math.round(volume * 100)} step="1" aria-label="Volume" onChange={(event) => onVolume(Number(event.target.value) / 100)} />
          <span className="video-volume-value">{Math.round(volume * 100)}%</span>
        </div>
        <div className="video-timeline-wrap">
          <input className="video-seek" type="range" min="0" max="1000" value={percent} step="1" aria-label="Video progress" onChange={(event) => onSeek(Number(event.target.value) / 1000)} />
          <div className="video-time-row"><span data-current-time="true">{formatVideoTime(currentTime)}</span><span data-duration="true">Remaining {formatVideoTime(Math.max((duration || 0) - currentTime, 0))}</span></div>
        </div>
        <div className="video-speed" aria-label="Playback speed">
          <button className="video-speed-btn" type="button" data-rate={rate} aria-label="Playback speed" onClick={onRate}>{rate}x</button>
        </div>
      </div>
    </>
  );
}

function Player({ course, lesson, autoNext, onEnded }) {
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const shellRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(() => Math.max(0, Math.min(1, Number(localStorage.getItem("edunexVideoVolume") || 1))));
  const [muted, setMuted] = useState(() => localStorage.getItem("edunexVideoMuted") === "true");
  const [rate, setRate] = useState(1);
  const [time, setTime] = useState({ current: 0, duration: 0 });

  const url = embedUrl(lesson);
  const directUrl = directVideoUrl(lesson) || bunnyStreamUrl(lesson);
  const hasEmbedControls = isBunnyEmbedUrl(url);
  const needsHlsRuntime = Boolean(directUrl && isHlsUrl(directUrl));

  const postToEmbed = useCallback((payload) => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    try {
      frame.contentWindow.postMessage(JSON.stringify(payload), "*");
    } catch (_) {
      try {
        frame.contentWindow.postMessage(payload, "*");
      } catch (_) {}
    }
  }, []);

  const persistVolume = useCallback((nextVolume, nextMuted) => {
    const safeVolume = Math.max(0, Math.min(1, Number(nextVolume)));
    setVolume(safeVolume);
    setMuted(Boolean(nextMuted));
    localStorage.setItem("edunexVideoVolume", String(safeVolume));
    localStorage.setItem("edunexVideoMuted", nextMuted ? "true" : "false");
    if (videoRef.current) {
      videoRef.current.volume = safeVolume;
      videoRef.current.muted = Boolean(nextMuted || safeVolume <= 0);
    }
    postToEmbed({ event: "command", func: nextMuted || safeVolume <= 0 ? "mute" : "unMute", args: [] });
    postToEmbed({ event: "command", func: "setVolume", args: [Math.round(safeVolume * 100)] });
  }, [postToEmbed]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
      return;
    }
    const shouldPlay = !playing;
    postToEmbed({ event: "command", func: shouldPlay ? "play" : "pause", args: [] });
    postToEmbed({ method: shouldPlay ? "play" : "pause" });
    setPlaying(shouldPlay);
  }, [playing, postToEmbed]);

  const seekBy = useCallback((seconds) => {
    const video = videoRef.current;
    if (video) {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = Math.max(0, Math.min(duration || video.currentTime + seconds, video.currentTime + seconds));
      setTime({ current: video.currentTime, duration });
      return;
    }
    const next = Math.max(0, time.current + seconds);
    setTime((current) => ({ ...current, current: next }));
    postToEmbed({ event: "command", func: "seekTo", args: [next, true] });
    postToEmbed({ method: "seek", value: seconds });
  }, [postToEmbed, time.current]);

  const openVideoAi = () => {
    const container = document.fullscreenElement || shellRef.current || document.body;
    if (window.NexAIWidget?.open) window.NexAIWidget.open(container);
    else document.getElementById("nai-float-btn")?.click();
  };

  const fullscreen = () => {
    const target = document.getElementById("playerFrame") || shellRef.current;
    if (!target) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else target.requestFullscreen?.().catch?.(() => {});
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const refresh = () => setTime({
      current: video.currentTime || 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    });
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      setPlaying(false);
      if (autoNext) onEnded?.();
    };
    video.volume = volume;
    video.muted = muted || volume <= 0;
    video.playbackRate = rate;
    video.addEventListener("loadedmetadata", refresh);
    video.addEventListener("timeupdate", refresh);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnd);
    refresh();
    return () => {
      video.removeEventListener("loadedmetadata", refresh);
      video.removeEventListener("timeupdate", refresh);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnd);
    };
  }, [autoNext, muted, onEnded, rate, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !needsHlsRuntime) return undefined;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = directUrl;
      return undefined;
    }
    let cancelled = false;
    let hlsInstance = null;
    loadHlsJs()
      .then((Hls) => {
        if (cancelled || !Hls?.isSupported?.()) return;
        hlsInstance = new Hls({ enableWorker: true });
        hlsInstance.loadSource(directUrl);
        hlsInstance.attachMedia(video);
      })
      .catch(() => {
        if (!cancelled) video.src = directUrl;
      });
    return () => {
      cancelled = true;
      hlsInstance?.destroy?.();
    };
  }, [directUrl, needsHlsRuntime]);

  useEffect(() => {
    window.__edunexActiveVideoToggle = togglePlayback;
    window.__edunexActiveVideoSeek = seekBy;
    return () => {
      delete window.__edunexActiveVideoToggle;
      delete window.__edunexActiveVideoSeek;
    };
  }, [seekBy, togglePlayback]);

  const controls = (
    <VideoControls
      playing={playing}
      volume={volume}
      muted={muted}
      rate={rate}
      currentTime={time.current}
      duration={time.duration}
      onToggle={togglePlayback}
      onSeek={(fraction) => {
        const video = videoRef.current;
        if (video && Number.isFinite(video.duration)) {
          video.currentTime = fraction * video.duration;
          return;
        }
        const next = Math.max(0, fraction * (time.duration || 0));
        setTime((current) => ({ ...current, current: next }));
        postToEmbed({ event: "command", func: "seekTo", args: [next, true] });
      }}
      onVolume={(next) => persistVolume(next, false)}
      onMute={() => persistVolume(volume > 0 ? volume : 1, !muted && volume > 0)}
      onRate={() => {
        const next = nextPlaybackRate(rate);
        setRate(next);
        if (videoRef.current) videoRef.current.playbackRate = next;
        postToEmbed({ event: "command", func: "setPlaybackRate", args: [next] });
        postToEmbed({ method: "setPlaybackRate", value: next });
      }}
      onFullscreen={fullscreen}
      onAi={openVideoAi}
      onTapLeft={() => seekBy(-10)}
      onTapRight={() => seekBy(10)}
    />
  );

  if (directUrl) {
    return (
      <div className="custom-video-player" data-custom-player="true" tabIndex={-1} ref={shellRef}>
        <video ref={videoRef} src={needsHlsRuntime ? undefined : directUrl} poster={lessonImage(course, lesson)} playsInline preload="metadata"></video>
        {controls}
      </div>
    );
  }

  if (url) {
    if (!hasEmbedControls) {
      return <iframe src={url} title={lesson?.title || course?.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen></iframe>;
    }
    return (
      <div className="custom-video-player" data-embed-player="true" tabIndex={-1} ref={shellRef}>
        <iframe ref={iframeRef} src={url} title={lesson?.title || course?.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen></iframe>
        {controls}
      </div>
    );
  }

  return (
    <div className="player-placeholder">
      <div><strong>Video source coming soon</strong><span>This lesson is in the playlist, but no playable source is attached yet.</span></div>
    </div>
  );
}

function NotesModal({ course, onClose }) {
  const value = String(noteValue(course)).trim();
  const title = course?.title ? `${course.title} notes` : "Course notes";
  return (
    <div className="course-notes-modal" id="courseNotesModal" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="course-notes-card" role="dialog" aria-modal="true" aria-labelledby="notesTitle">
        <div className="notes-modal-head">
          <h2 id="notesTitle">{title}</h2>
          <button className="notes-modal-close" type="button" id="closeNotesBtn" onClick={onClose}><i className="fas fa-arrow-left" aria-hidden="true"></i> Back</button>
        </div>
        <div className="notes-modal-body" id="notesBody">
          {value ? <div>{value.split("\n").map((line, index) => <span key={`${line}-${index}`}>{line}<br /></span>)}</div> : <div className="notes-empty">No notes are attached to this course yet.</div>}
        </div>
      </div>
    </div>
  );
}

export function VideosPage() {
  const runtimeReady = useEduNexRuntimeReady();
  const query = queryParams();
  const selectedCourseId = query.get("courseId") || query.get("course") || query.get("id");
  const selectedVideo = Number(query.get("video") || 0);
  const [courses, setCourses] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState(null);
  const [activeIndex, setActiveIndex] = useState(Number.isFinite(selectedVideo) ? selectedVideo : 0);
  const [status, setStatus] = useState("Preparing course...");
  const [error, setError] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [autoNext, setAutoNext] = useState(() => localStorage.getItem(AUTO_NEXT_KEY) === "true");

  usePageStyle("react-page-style-videos", videosPage.styles);

  const sharedRuntimePage = useMemo(() => ({
    ...videosPage,
    scripts: videosPage.scripts.filter((script) => script.src),
  }), []);

  useEffect(() => {
    document.title = videosPage.title;
    document.documentElement.lang = videosPage.lang || "en";
    const cleanup = runLegacyPage(sharedRuntimePage);
    return () => cleanup?.();
  }, [sharedRuntimePage]);

  const ensureCourseAccess = useCallback(async (courseId) => {
    const accessToken = getToken();
    if (!accessToken) {
      window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return false;
    }
    try {
      const response = await fetch("/api/payment/subscription-status", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 401) {
        clearAuthStorage();
        window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return false;
      }
      const data = response.ok ? await response.json() : null;
      if (data && hasCourseAccess(data)) return true;
    } catch (_) {}
    window.location.href = paymentUrlForCourse(courseId);
    return false;
  }, []);

  useEffect(() => {
    if (!runtimeReady) return undefined;
    let cancelled = false;
    (async () => {
      if (!selectedCourseId) {
        window.location.replace("/courses.html");
        return;
      }
      let catalogCourses = [];
      try {
        const response = await fetch("/api/courses", { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} });
        if (response.ok) {
          catalogCourses = (await response.json()).map(normalizeCourse);
          if (!cancelled) setCourses(catalogCourses);
        }
      } catch (_) {}
      const allowed = await ensureCourseAccess(selectedCourseId);
      if (!allowed || cancelled) return;
      try {
        const response = await fetch(`/api/courses/${encodeURIComponent(selectedCourseId)}/lessons`, { headers: { Authorization: `Bearer ${getToken()}` } });
        if (!response.ok) throw new Error("Protected course unavailable");
        const nextCourse = normalizeCourse(await response.json());
        if (cancelled) return;
        const nextIndex = Math.max(0, Math.min(activeIndex, Math.max(nextCourse.videos.length - 1, 0)));
        setCourse(nextCourse);
        setActiveIndex(nextIndex);
        setStatus(nextCourse.videos.length ? "Course ready" : "No lessons yet");
      } catch (_) {
        const localCourse = catalogCourses.find((item) => item._id === String(selectedCourseId));
        if (!cancelled && localCourse?.videos?.length) {
          const nextIndex = Math.max(0, Math.min(activeIndex, Math.max(localCourse.videos.length - 1, 0)));
          setCourse(localCourse);
          setActiveIndex(nextIndex);
          setStatus("Course ready");
          return;
        }
        if (!cancelled) {
          setError("This course was not found in the database, or your account does not currently have access to its videos.");
          setStatus("Course unavailable");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeReady, selectedCourseId]);

  useEffect(() => {
    if (!course) return;
    const lessons = course.videos || [];
    localStorage.setItem(`edunexCourseProgress:${course._id}`, JSON.stringify({
      lessonIndex: activeIndex,
      completed: Math.min(activeIndex, Math.max(lessons.length - 1, 0)),
      percent: lessons.length ? Math.round((activeIndex / lessons.length) * 100) : 0,
    }));
    const urlState = new URL(window.location.href);
    urlState.searchParams.set("courseId", course._id);
    urlState.searchParams.set("video", activeIndex);
    history.replaceState(null, "", urlState.pathname + urlState.search);
  }, [activeIndex, course]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target?.closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === " " || event.code === "Space") {
        if (typeof window.__edunexActiveVideoToggle !== "function") return;
        event.preventDefault();
        window.__edunexActiveVideoToggle();
      } else if (event.key === "ArrowLeft") {
        if (typeof window.__edunexActiveVideoSeek !== "function") return;
        event.preventDefault();
        window.__edunexActiveVideoSeek(-10);
      } else if (event.key === "ArrowRight") {
        if (typeof window.__edunexActiveVideoSeek !== "function") return;
        event.preventDefault();
        window.__edunexActiveVideoSeek(10);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const shownCourses = courses.filter((item) => {
    const progress = courseProgress(item);
    if (filter === "active" && !(progress.percent > 0 && progress.percent < 100)) return false;
    if (filter === "new" && progress.percent !== 0) return false;
    if (filter === "complete" && progress.percent < 100) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${item.title || ""} ${item.description || ""} ${item.category?.name || ""}`.toLowerCase().includes(q);
  });
  const continueCourses = courses.filter((item) => item.videos?.length).sort((a, b) => courseProgress(b).percent - courseProgress(a).percent).slice(0, 3);
  const videoCount = courses.reduce((count, item) => count + (item.videos?.length || 0), 0);
  const inProgressCount = courses.filter((item) => {
    const progress = courseProgress(item);
    return progress.percent > 0 && progress.percent < 100;
  }).length;

  const lessons = course?.videos || [];
  const lesson = lessons[activeIndex] || lessons[0] || {};

  const openNotes = () => {
    const value = String(noteValue(course)).trim();
    if (value && isLikelyUrl(value)) {
      window.location.href = value;
      return;
    }
    setNotesOpen(true);
  };

  const advanceNext = useCallback(() => {
    setActiveIndex((index) => Math.min(index + 1, Math.max(lessons.length - 1, 0)));
  }, [lessons.length]);

  const renderCourseTile = (item, isContinue) => {
    const progress = courseProgress(item);
    const nextLesson = item.videos?.[progress.index] || item.videos?.[0] || {};
    const href = `/videos.html?courseId=${encodeURIComponent(item._id)}&video=${progress.index}`;
    const lessonCount = item.videos?.length || 0;
    const badge = isContinue && progress.percent > 0 ? "Continue" : lessonCount ? `${lessonCount} videos` : "Course";
    return (
      <a className="course-tile" href={href} data-course-id={item._id} key={`${item._id}-${isContinue ? "continue" : "all"}`}>
        <div className="tile-media">
          <img src={courseImage(item)} alt={item.title || "EduNex course"} onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = fallbackImage(event.currentTarget.alt || "EduNex");
          }} />
          <span className="tile-badge">{badge}</span>
        </div>
        <div className="tile-body">
          <h3>{item.title || "Untitled course"}</h3>
          <p>{isContinue ? `Next: ${nextLesson.title || "Start course"}` : (item.description || "Open this course to watch the full playlist.")}</p>
          <div className="tile-meta">
            <span>{lessonCount || "No"} lessons</span>
            <span>{item.averageRating ? `${Number(item.averageRating).toFixed(1)} rating` : "EduNex course"}</span>
          </div>
          <div className="tile-progress" style={{ "--progress": `${progress.percent}%` }}><span></span></div>
        </div>
      </a>
    );
  };

  return (
    <div className="react-page-root" data-page="videos.html">
      <main id="libraryView" hidden={Boolean(selectedCourseId)}>
        <section className="library-hero library-shell">
          <div>
            <p className="library-kicker">EduNex Library</p>
            <h1>Your courses, progress, and next lessons in one place.</h1>
            <p>See the courses currently in motion, continue from your latest lesson, or open any course into a focused watch page with the full playlist beside the video.</p>
            <form className="library-search" role="search" id="librarySearch" onSubmit={(event) => event.preventDefault()}>
              <input id="searchInput" type="search" placeholder="Search your courses" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} />
              <button type="submit"><i className="fas fa-search" aria-hidden="true"></i> Search</button>
            </form>
            <div className="library-quick-stats" aria-label="Library stats">
              <span><strong id="courseTotalStat">{courses.length}</strong> courses</span>
              <span><strong id="videoTotalStat">{videoCount}</strong> videos</span>
              <span><strong id="progressTotalStat">{inProgressCount}</strong> in progress</span>
            </div>
          </div>
          <aside className="library-summary" aria-label="Library summary">
            <span className="summary-pill">Continue watching</span>
            <div>
              <strong className="summary-number" id="activeCount">{courses.length}</strong>
              <span className="summary-label">courses available in your library</span>
              <span className="summary-subline" id="summaryVideoCount">{videoCount} playable videos synced</span>
            </div>
          </aside>
        </section>
        <section className="library-shell">
          <div className="library-tabs" aria-label="Library filters" role="tablist">
            {[
              ["all", "All courses"],
              ["active", "In progress"],
              ["new", "Not started"],
              ["complete", "Completed"],
            ].map(([key, label]) => (
              <button className={`library-tab${filter === key ? " is-active" : ""}`} type="button" data-filter={key} key={key} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
        </section>
        <section className="library-shell" id="continueSection">
          <div className="section-head">
            <div>
              <h2>Continue Watching</h2>
              <p>Jump back into the next lesson from your recent courses.</p>
            </div>
            <span className="status-line" id="loadStatus">{courses.length ? "Synced with EduNex courses" : "Loading library..."}</span>
          </div>
          <div className="continue-grid" id="continueGrid">{continueCourses.length ? continueCourses.map((item) => renderCourseTile(item, true)) : <div className="empty-state">No courses with videos are available yet.</div>}</div>
        </section>
        <section className="library-shell" style={{ paddingBottom: 70 }}>
          <div className="section-head">
            <div>
              <h2>All Courses</h2>
              <p>Open a course to view the video player and playlist.</p>
            </div>
          </div>
          <div className="course-grid" id="courseGrid">{shownCourses.map((item) => renderCourseTile(item, false))}</div>
          <div className="empty-state" id="emptyState" hidden={shownCourses.length > 0}>No matching courses found.</div>
        </section>
      </main>

      <main className="watch-page" id="watchView">
        <div className="watch-top">
          <a className="back-library" href="/courses.html"><i className="fas fa-arrow-left" aria-hidden="true"></i> Courses</a>
          <span className="back-bar-title" id="watchCourseTitle">{course?.title || (error ? "Course unavailable" : "Course playlist")}</span>
          <span className="status-line" id="watchStatus">{status}</span>
          <div className="watch-actions">
            <button className="watch-tool-btn" type="button" id="openNotesBtn" onClick={openNotes}><i className="fas fa-file-lines" aria-hidden="true"></i> Notes</button>
          </div>
        </div>
        <section className="watch-layout">
          <div className="player-wrap">
            <div className="player-frame" id="playerFrame">
              {error ? (
                <div className="player-placeholder"><div><strong>Could not open this course</strong><span>{error}</span></div></div>
              ) : course ? (
                <Player course={course} lesson={lesson} autoNext={autoNext} onEnded={advanceNext} key={`${course._id}-${activeIndex}`} />
              ) : (
                <div className="player-placeholder"><div><strong>Preparing course</strong><span>Loading your EduNex course playlist...</span></div></div>
              )}
            </div>
            <div className="lesson-info">
              <h1 id="lessonTitle">{error ? "Course unavailable" : (lesson.title || course?.title || "Select a lesson")}</h1>
              <p id="lessonDescription">{error || lesson.description || course?.description || "Choose a video from the playlist to begin watching."}</p>
              <div className="lesson-meta" id="lessonMeta">
                {course ? <span>{course.title || "EduNex course"}</span> : null}
                {course ? <span>Lesson {activeIndex + 1} of {Math.max(lessons.length, 1)}</span> : null}
                {course ? <span>{formatDuration(lesson.duration)}</span> : null}
              </div>
            </div>
          </div>
          <aside className="lesson-sidebar" aria-label="Course playlist">
            <div className="sidebar-head">
              <div className="sidebar-top-row">
                <h2 id="sidebarCourseTitle">{course?.title || "Course playlist"}</h2>
                <label className="auto-next-toggle" title="Automatically open the next lesson when the current video ends">
                  <input
                    type="checkbox"
                    id="autoNextToggle"
                    checked={autoNext}
                    onChange={(event) => {
                      setAutoNext(event.target.checked);
                      localStorage.setItem(AUTO_NEXT_KEY, event.target.checked ? "true" : "false");
                    }}
                  />
                  <span>Auto next</span>
                  <span className="auto-next-switch" aria-hidden="true"></span>
                </label>
              </div>
              <p id="sidebarCourseMeta">{course ? `${lessons.length} videos in this course` : "Videos will appear here."}</p>
            </div>
            <div className="lesson-list" id="lessonList">
              {error ? <div className="empty-state">{error}</div> : null}
              {!error && course && !lessons.length ? <div className="empty-state">This course does not have videos attached yet.</div> : null}
              {!error && lessons.map((item, index) => (
                <button className={`lesson-item${index === activeIndex ? " is-active" : ""}`} type="button" data-index={index} key={item._id || item.id || `${item.title}-${index}`} onClick={() => setActiveIndex(index)}>
                  <span className="lesson-thumb">
                    <img src={lessonImage(course, item)} alt={item.title || course.title || "EduNex lesson"} onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = fallbackImage(event.currentTarget.alt || "EduNex");
                    }} />
                    <span className="lesson-number">{index + 1}</span>
                  </span>
                  <span className="lesson-copy">
                    <strong>{item.title || `Lesson ${index + 1}`}</strong>
                    <span>{formatDuration(item.duration)}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </section>
      </main>

      {notesOpen ? <NotesModal course={course} onClose={() => setNotesOpen(false)} /> : null}
    </div>
  );
}
