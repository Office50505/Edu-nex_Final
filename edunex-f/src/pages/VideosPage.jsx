import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { page as videosPage } from "../generated-pages/videos.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { useEduNexRuntimeReady } from "../hooks/useEduNexRuntimeReady.js";

const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27900%27%20height=%27600%27%20viewBox=%270%200%20900%20600%27%3E%3Crect%20width=%27900%27%20height=%27600%27%20fill=%27%23000000%27/%3E%3Crect%20x=%271%27%20y=%271%27%20width=%27898%27%20height=%27598%27%20rx=%2732%27%20fill=%27%230d0d0d%27%20stroke=%27%23C58B2A%27%20stroke-opacity=%27.35%27/%3E%3Ctext%20x=%27450%27%20y=%27312%27%20text-anchor=%27middle%27%20fill=%27%23C58B2A%27%20font-family=%27Arial%27%20font-size=%2748%27%20font-weight=%27800%27%3EEduNex%3C/text%3E%3C/svg%3E";
const AUTO_NEXT_KEY = "edunexAutoNextVideo";
const APP_FULLSCREEN_CLASS = "is-app-fullscreen";
const BODY_FULLSCREEN_CLASS = "has-edunex-player-fullscreen";

function nativeFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isPlayerFullscreen(frame) {
  if (!frame) return false;
  if (frame.classList.contains(APP_FULLSCREEN_CLASS)) return true;
  const element = nativeFullscreenElement();
  return Boolean(element && (
    element === frame
    || element.contains?.(frame)
    || frame.contains?.(element)
  ));
}

function setAppFullscreen(frame, active) {
  if (!frame) return;
  frame.classList.toggle(APP_FULLSCREEN_CLASS, active);
  document.body.classList.toggle(BODY_FULLSCREEN_CLASS, active);
  if (active) frame.focus?.({ preventScroll: true });
}

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
  const value = lesson?.embedUrl
    || (lesson?.youtubeId ? `https://www.youtube.com/embed/${lesson.youtubeId}?rel=0&autoplay=0` : "")
    || lesson?.videoUrl
    || "";
  if (!isYoutubeEmbedUrl(value)) return value;
  try {
    const parsed = new URL(value);
    parsed.searchParams.set("enablejsapi", "1");
    parsed.searchParams.set("playsinline", "1");
    return parsed.href;
  } catch (_) {
    return value;
  }
}

function isBunnyEmbedUrl(value) {
  return /player\.mediadelivery\.net\/embed|iframe\.mediadelivery\.net\/embed/i.test(String(value || ""));
}

function isYoutubeEmbedUrl(value) {
  return /(?:youtube(?:-nocookie)?\.com)\/embed\//i.test(String(value || ""));
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

function loadEmbeddedPlayerApi() {
  if (window.playerjs?.Player) return Promise.resolve();
  if (window.__edunexPlayerJsPromise) return window.__edunexPlayerJsPromise;
  window.__edunexPlayerJsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-edunex-playerjs="true"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js";
    script.async = true;
    script.dataset.edunexPlayerjs = "true";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Embedded player controls unavailable"));
    document.head.appendChild(script);
  });
  return window.__edunexPlayerJsPromise;
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

function isVerticalLesson(lesson) {
  const orientation = String(lesson?.orientation || lesson?.format || "").toLowerCase();
  if (/vertical|portrait|reel|short/.test(orientation)) return true;

  const aspect = String(lesson?.aspectRatio || lesson?.ratio || "").trim();
  const parts = aspect.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  if (!parts) return false;
  return Number(parts[1]) > 0 && Number(parts[2]) > 0 && Number(parts[1]) < Number(parts[2]);
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

function VideoControls({ playing, volume, muted, rate, currentTime, duration, onToggle, onSeek, onVolume, onRate, onFullscreen, onAi, onScreenTap, onScreenSwipe }) {
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeControlRef = useRef(null);
  const tapZoneSwipeRef = useRef({ active: false, pointerId: null, input: "", startX: 0, startY: 0, lastX: 0, lastY: 0, startedAt: 0, horizontal: false, suppressClickUntil: 0 });
  const percent = duration ? Math.round((currentTime / duration) * 1000) : 0;
  const volumeIcon = muted || volume <= 0 ? "fa-volume-xmark" : volume < 0.5 ? "fa-volume-low" : "fa-volume-high";

  const claimTapZoneGesture = useCallback((event) => {
    if (event?.cancelable) event.preventDefault();
    event?.stopPropagation?.();
  }, []);

  const beginTapZoneSwipe = useCallback((clientX, clientY, pointerId, input) => {
    if (typeof onScreenSwipe !== "function") return;
    tapZoneSwipeRef.current = {
      ...tapZoneSwipeRef.current,
      active: true,
      pointerId,
      input,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      startedAt: Date.now(),
      horizontal: false,
    };
  }, [onScreenSwipe]);

  const cancelTapZoneSwipe = useCallback(() => {
    tapZoneSwipeRef.current = { ...tapZoneSwipeRef.current, active: false, pointerId: null, input: "", horizontal: false };
  }, []);

  const moveTapZoneSwipe = useCallback((clientX, clientY, event) => {
    const swipe = tapZoneSwipeRef.current;
    if (!swipe.active) return false;
    swipe.lastX = clientX;
    swipe.lastY = clientY;
    const deltaX = clientX - swipe.startX;
    const deltaY = clientY - swipe.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (!swipe.horizontal && absX > 10 && absX > absY * 1.15) swipe.horizontal = true;
    if (swipe.horizontal) {
      claimTapZoneGesture(event);
      return true;
    }
    return false;
  }, [claimTapZoneGesture]);

  const finishTapZoneSwipe = useCallback((clientX, clientY, event) => {
    const swipe = tapZoneSwipeRef.current;
    if (!swipe.active) return false;
    const deltaX = (Number.isFinite(clientX) ? clientX : swipe.lastX) - swipe.startX;
    const deltaY = (Number.isFinite(clientY) ? clientY : swipe.lastY) - swipe.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const shouldNavigate = typeof onScreenSwipe === "function" && swipe.horizontal && absX >= 46 && absX > Math.max(24, absY * 1.15);
    tapZoneSwipeRef.current = {
      ...swipe,
      active: false,
      pointerId: null,
      input: "",
      horizontal: false,
      suppressClickUntil: shouldNavigate ? Date.now() + 500 : swipe.suppressClickUntil,
    };
    if (!shouldNavigate) return false;
    claimTapZoneGesture(event);
    onScreenSwipe(deltaX < 0 ? 1 : -1);
    return true;
  }, [claimTapZoneGesture, onScreenSwipe]);

  const handleTapZoneClick = useCallback((event, side) => {
    if (Date.now() < tapZoneSwipeRef.current.suppressClickUntil) {
      claimTapZoneGesture(event);
      return;
    }
    onScreenTap(side);
  }, [claimTapZoneGesture, onScreenTap]);

  const tapZoneSwipeHandlers = {
    onPointerDown: (event) => {
      if (event.button > 0 || event.isPrimary === false) return;
      beginTapZoneSwipe(event.clientX, event.clientY, event.pointerId, "pointer");
    },
    onPointerMove: (event) => {
      const swipe = tapZoneSwipeRef.current;
      if (!swipe.active || swipe.input !== "pointer" || swipe.pointerId !== event.pointerId) return;
      moveTapZoneSwipe(event.clientX, event.clientY, event);
    },
    onPointerUp: (event) => {
      const swipe = tapZoneSwipeRef.current;
      if (!swipe.active || swipe.input !== "pointer" || swipe.pointerId !== event.pointerId) return;
      finishTapZoneSwipe(event.clientX, event.clientY, event);
    },
    onPointerCancel: cancelTapZoneSwipe,
    onTouchStart: (event) => {
      if (tapZoneSwipeRef.current.active && tapZoneSwipeRef.current.input === "pointer") return;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      beginTapZoneSwipe(touch.clientX, touch.clientY, null, "touch");
    },
    onTouchMove: (event) => {
      const swipe = tapZoneSwipeRef.current;
      if (!swipe.active || swipe.input !== "touch" || event.touches.length !== 1) return;
      const touch = event.touches[0];
      moveTapZoneSwipe(touch.clientX, touch.clientY, event);
    },
    onTouchEnd: (event) => {
      const swipe = tapZoneSwipeRef.current;
      if (!swipe.active || swipe.input !== "touch") return;
      const touch = event.changedTouches[0];
      finishTapZoneSwipe(touch?.clientX, touch?.clientY, event);
    },
    onTouchCancel: cancelTapZoneSwipe,
  };

  useEffect(() => {
    if (!volumeOpen) return undefined;
    const closeOnOutsidePress = (event) => {
      if (!volumeControlRef.current?.contains(event.target)) setVolumeOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setVolumeOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [volumeOpen]);

  return (
    <>
      <button className="video-screen-btn video-ai-screen-btn" type="button" data-action="ai" onClick={onAi}><i className="fas fa-bolt" aria-hidden="true"></i><span>AI</span></button>
      <button className="tap-zone tap-zone-left" type="button" tabIndex={-1} aria-label="Play or pause; double-click to rewind 10 seconds" onClick={(event) => handleTapZoneClick(event, "left")} onDoubleClick={(event) => event.preventDefault()} {...tapZoneSwipeHandlers}><span className="tap-hint">-10s</span></button>
      <button className="tap-zone tap-zone-right" type="button" tabIndex={-1} aria-label="Play or pause; double-click to forward 10 seconds" onClick={(event) => handleTapZoneClick(event, "right")} onDoubleClick={(event) => event.preventDefault()} {...tapZoneSwipeHandlers}><span className="tap-hint">+10s</span></button>
      <div className="custom-video-controls">
        <button className="video-control-btn video-play-control" type="button" data-action="toggle" aria-label={playing ? "Pause" : "Play"} onClick={onToggle}>
          <i className={`fas ${playing ? "fa-pause" : "fa-play"}`} aria-hidden="true"></i>
        </button>
        <div className="video-timeline-wrap">
          <input className="video-seek" type="range" min="0" max="1000" value={percent} step="1" aria-label="Video progress" onChange={(event) => onSeek(Number(event.target.value) / 1000)} />
          <div className="video-time-row"><span data-current-time="true">{formatVideoTime(currentTime)}</span><span data-duration="true">Remaining {formatVideoTime(Math.max((duration || 0) - currentTime, 0))}</span></div>
        </div>
        <div className={`video-volume${volumeOpen ? " is-open" : ""}`} ref={volumeControlRef}>
          <button className="video-control-btn video-volume-toggle" type="button" data-action="volume" aria-label={`Volume ${Math.round(volume * 100)} percent`} aria-expanded={volumeOpen} onClick={() => setVolumeOpen((open) => !open)}>
            <i className={`fas ${volumeIcon}`} aria-hidden="true"></i>
          </button>
          <div className="video-volume-panel" aria-hidden={!volumeOpen}>
            <span className="video-volume-value">{Math.round(volume * 100)}%</span>
            <input className="video-volume-slider" type="range" min="0" max="100" value={Math.round(volume * 100)} step="1" aria-label="Volume" aria-orientation="vertical" onChange={(event) => onVolume(Number(event.target.value) / 100)} />
          </div>
        </div>
        <div className="video-end-controls">
          <div className="video-speed" aria-label="Playback speed">
            <button className="video-speed-btn" type="button" data-rate={rate} aria-label="Playback speed" onClick={onRate}>{rate}x</button>
          </div>
          <button className="video-control-btn video-fullscreen-control" type="button" data-action="fullscreen" aria-label="Enter fullscreen" onClick={onFullscreen}><i className="fas fa-expand" aria-hidden="true"></i></button>
        </div>
      </div>
    </>
  );
}

function Player({ course, lesson, autoNext, onEnded, onNavigateLesson, onAspectChange }) {
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const embeddedPlayerRef = useRef(null);
  const shellRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(() => Math.max(0, Math.min(1, Number(localStorage.getItem("edunexVideoVolume") || 1))));
  const [muted, setMuted] = useState(() => localStorage.getItem("edunexVideoMuted") === "true");
  const [rate, setRate] = useState(1);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const playerStateRef = useRef({ autoNext, muted, onEnded, rate, volume });
  const playingRef = useRef(false);
  const screenTapRef = useRef({ side: "", at: 0 });
  const screenToggleTimerRef = useRef(null);
  const screenHintTimerRef = useRef(null);

  const url = embedUrl(lesson);
  const directUrl = directVideoUrl(lesson) || bunnyStreamUrl(lesson);
  const isYoutubeEmbed = isYoutubeEmbedUrl(url);
  const hasEmbedControls = isBunnyEmbedUrl(url) || isYoutubeEmbed;
  const needsHlsRuntime = Boolean(directUrl && isHlsUrl(directUrl));

  const syncPlaying = useCallback((nextPlaying) => {
    const next = Boolean(nextPlaying);
    playingRef.current = next;
    setPlaying(next);
  }, []);

  useEffect(() => {
    playerStateRef.current = { autoNext, muted, onEnded, rate, volume };
  }, [autoNext, muted, onEnded, rate, volume]);

  const postToEmbed = useCallback((payload) => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    try { frame.contentWindow.postMessage(payload, "*"); } catch (_) {}
    try { frame.contentWindow.postMessage(JSON.stringify(payload), "*"); } catch (_) {}
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
    const embeddedPlayer = embeddedPlayerRef.current;
    const percent = Math.round(safeVolume * 100);
    try { embeddedPlayer?.setVolume?.(nextMuted ? 0 : percent); } catch (_) {}
    try {
      if (nextMuted || safeVolume <= 0) embeddedPlayer?.mute?.();
      else embeddedPlayer?.unmute?.();
    } catch (_) {}
    postToEmbed({ event: "command", func: nextMuted || safeVolume <= 0 ? "mute" : "unMute", args: [] });
    postToEmbed({ event: "command", func: "setVolume", args: [percent] });
  }, [postToEmbed]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (video.paused) {
        syncPlaying(true);
        video.play().catch(() => syncPlaying(false));
      } else {
        video.pause();
        syncPlaying(false);
      }
      return;
    }
    const shouldPlay = !playingRef.current;
    const embeddedPlayer = embeddedPlayerRef.current;
    syncPlaying(shouldPlay);
    try {
      if (shouldPlay) embeddedPlayer?.play?.();
      else embeddedPlayer?.pause?.();
    } catch (_) {
      syncPlaying(!shouldPlay);
    }
    postToEmbed({ context: "player.js", version: "0.0.11", event: "command", method: shouldPlay ? "play" : "pause" });
    postToEmbed({ event: "command", func: shouldPlay ? "playVideo" : "pauseVideo", args: [] });
    postToEmbed({ event: "command", func: shouldPlay ? "play" : "pause", args: [] });
    postToEmbed({ method: shouldPlay ? "play" : "pause" });
  }, [postToEmbed, syncPlaying]);

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
    try { embeddedPlayerRef.current?.setCurrentTime?.(next); } catch (_) {}
    postToEmbed({ event: "command", func: "seekTo", args: [next, true] });
    postToEmbed({ method: "seek", value: seconds });
  }, [postToEmbed, time.current]);

  const clearPendingScreenToggle = useCallback(() => {
    if (screenToggleTimerRef.current) window.clearTimeout(screenToggleTimerRef.current);
    screenToggleTimerRef.current = null;
    screenTapRef.current = { side: "", at: 0 };
  }, []);

  const showSeekHint = useCallback((side) => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.querySelectorAll(".tap-zone").forEach((zone) => zone.classList.remove("show"));
    const zone = shell.querySelector(`.tap-zone-${side}`);
    zone?.classList.add("show");
    if (screenHintTimerRef.current) window.clearTimeout(screenHintTimerRef.current);
    screenHintTimerRef.current = window.setTimeout(() => zone?.classList.remove("show"), 450);
  }, []);

  const handleScreenTap = useCallback((side) => {
    const now = Date.now();
    const previous = screenTapRef.current;
    if (previous.side === side && now - previous.at <= 320) {
      clearPendingScreenToggle();
      seekBy(side === "left" ? -10 : 10);
      showSeekHint(side);
      return;
    }
    clearPendingScreenToggle();
    screenTapRef.current = { side, at: now };
    screenToggleTimerRef.current = window.setTimeout(() => {
      screenToggleTimerRef.current = null;
      screenTapRef.current = { side: "", at: 0 };
      togglePlayback();
    }, 320);
  }, [clearPendingScreenToggle, seekBy, showSeekHint, togglePlayback]);

  const handleControlToggle = useCallback(() => {
    clearPendingScreenToggle();
    togglePlayback();
  }, [clearPendingScreenToggle, togglePlayback]);

  useEffect(() => () => {
    if (screenToggleTimerRef.current) window.clearTimeout(screenToggleTimerRef.current);
    if (screenHintTimerRef.current) window.clearTimeout(screenHintTimerRef.current);
  }, []);

  const updateNaturalAspect = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) return;
    onAspectChange?.({
      width: video.videoWidth,
      height: video.videoHeight,
      portrait: video.videoHeight > video.videoWidth,
    });
  }, [onAspectChange]);

  const openVideoAi = () => {
    if (isPlayerFullscreen(document.getElementById("playerFrame"))) return;
    const container = document.fullscreenElement || shellRef.current || document.body;
    if (window.NexAIWidget?.open) window.NexAIWidget.open(container);
    else document.getElementById("nai-float-btn")?.click();
  };

  const fullscreen = async () => {
    const target = document.getElementById("playerFrame") || shellRef.current;
    if (!target) return;
    if (target.classList.contains(APP_FULLSCREEN_CLASS)) {
      setAppFullscreen(target, false);
      return;
    }

    if (nativeFullscreenElement()) {
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFullscreen) {
        try { await exitFullscreen.call(document); } catch (_) {}
      }
    }
    setAppFullscreen(target, true);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const refresh = () => {
      setTime({
        current: video.currentTime || 0,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      });
      updateNaturalAspect();
    };
    const onPlay = () => syncPlaying(true);
    const onPause = () => syncPlaying(false);
    const onEnd = () => {
      syncPlaying(false);
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
  }, [autoNext, muted, onEnded, rate, syncPlaying, updateNaturalAspect, volume]);

  useEffect(() => {
    if (!hasEmbedControls) return undefined;
    const iframe = iframeRef.current;
    if (!iframe) return undefined;

    if (isYoutubeEmbed) {
      const handleYoutubeMessage = (event) => {
        if (event.source !== iframe.contentWindow) return;
        let data = event.data;
        if (typeof data === "string") {
          try { data = JSON.parse(data); } catch (_) { return; }
        }
        const playerState = data?.event === "onStateChange"
          ? Number(data.info)
          : Number(data?.info?.playerState);
        if (playerState === 1) syncPlaying(true);
        if (playerState === 0 || playerState === 2) syncPlaying(false);
        if (data?.event === "infoDelivery" && data?.info) {
          setTime((current) => ({
            current: Number(data.info.currentTime ?? current.current) || 0,
            duration: Number(data.info.duration ?? current.duration) || 0,
          }));
        }
      };
      const connectYoutubePlayer = () => {
        postToEmbed({ event: "listening", id: "edunex-course-player" });
        postToEmbed({ event: "command", func: "addEventListener", args: ["onStateChange"] });
      };
      window.addEventListener("message", handleYoutubeMessage);
      iframe.addEventListener("load", connectYoutubePlayer);
      connectYoutubePlayer();
      return () => {
        window.removeEventListener("message", handleYoutubeMessage);
        iframe.removeEventListener("load", connectYoutubePlayer);
      };
    }

    let cancelled = false;
    let player = null;
    let polling = null;
    const refreshTime = () => {
      if (!player) return;
      try {
        player.getCurrentTime?.((value) => {
          setTime((current) => ({ ...current, current: Number(value) || 0 }));
        });
        player.getDuration?.((value) => {
          setTime((current) => ({ ...current, duration: Number(value) || 0 }));
        });
      } catch (_) {}
    };
    const handlePlay = () => syncPlaying(true);
    const handlePause = () => syncPlaying(false);
    const handleEnded = () => {
      syncPlaying(false);
      if (playerStateRef.current.autoNext) playerStateRef.current.onEnded?.();
    };
    const handleTimeUpdate = (event) => {
      setTime((current) => ({
        current: Number(event?.seconds ?? event?.currentTime ?? current.current) || 0,
        duration: Number(event?.duration ?? current.duration) || 0,
      }));
    };

    loadEmbeddedPlayerApi().then(() => {
      if (cancelled || !window.playerjs?.Player) return;
      player = new window.playerjs.Player(iframe);
      embeddedPlayerRef.current = player;
      player.on?.("ready", () => {
        const settings = playerStateRef.current;
        const volumePercent = Math.round(settings.volume * 100);
        try { player.setVolume?.(settings.muted ? 0 : volumePercent); } catch (_) {}
        try { player.setPlaybackRate?.(settings.rate); } catch (_) {}
        if (settings.muted) {
          try { player.mute?.(); } catch (_) {}
        }
        refreshTime();
        polling = window.setInterval(refreshTime, 750);
      });
      player.on?.("play", handlePlay);
      player.on?.("pause", handlePause);
      player.on?.("ended", handleEnded);
      player.on?.("timeupdate", handleTimeUpdate);
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (polling) window.clearInterval(polling);
      if (embeddedPlayerRef.current === player) embeddedPlayerRef.current = null;
      try { player?.off?.("play", handlePlay); } catch (_) {}
      try { player?.off?.("pause", handlePause); } catch (_) {}
      try { player?.off?.("ended", handleEnded); } catch (_) {}
      try { player?.off?.("timeupdate", handleTimeUpdate); } catch (_) {}
    };
  }, [hasEmbedControls, isYoutubeEmbed, postToEmbed, syncPlaying]);

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
      onToggle={handleControlToggle}
      onSeek={(fraction) => {
        const video = videoRef.current;
        if (video && Number.isFinite(video.duration)) {
          video.currentTime = fraction * video.duration;
          return;
        }
        const next = Math.max(0, fraction * (time.duration || 0));
        setTime((current) => ({ ...current, current: next }));
        try { embeddedPlayerRef.current?.setCurrentTime?.(next); } catch (_) {}
        postToEmbed({ event: "command", func: "seekTo", args: [next, true] });
      }}
      onVolume={(next) => persistVolume(next, false)}
      onRate={() => {
        const next = nextPlaybackRate(rate);
        setRate(next);
        if (videoRef.current) videoRef.current.playbackRate = next;
        try { embeddedPlayerRef.current?.setPlaybackRate?.(next); } catch (_) {}
        postToEmbed({ event: "command", func: "setPlaybackRate", args: [next] });
        postToEmbed({ method: "setPlaybackRate", value: next });
      }}
      onFullscreen={fullscreen}
      onAi={openVideoAi}
      onScreenTap={handleScreenTap}
      onScreenSwipe={onNavigateLesson}
    />
  );

  if (directUrl) {
    return (
      <div className="custom-video-player" data-custom-player="true" tabIndex={-1} ref={shellRef}>
        <video ref={videoRef} src={needsHlsRuntime ? undefined : directUrl} poster={lessonImage(course, lesson)} playsInline preload="metadata" onLoadedMetadata={updateNaturalAspect}></video>
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
  const playerFrameRef = useRef(null);
  const lessonSwipeRef = useRef({ active: false, pointerId: null, startX: 0, startY: 0, lastX: 0, lastY: 0, startedAt: 0, horizontal: false, vertical: false, suppressClickUntil: 0 });
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
  const [naturalVideoRatio, setNaturalVideoRatio] = useState("");

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
    const key = `edunexCourseProgress:${course._id}`;
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(key) || "{}");
    } catch (_) {
      saved = {};
    }
    localStorage.setItem(key, JSON.stringify({
      ...saved,
      viewed: true,
      lastViewedAt: new Date().toISOString(),
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
  const verticalPlayer = Boolean(naturalVideoRatio) || isVerticalLesson(lesson);

  useEffect(() => {
    setNaturalVideoRatio("");
  }, [lesson?._id, lesson?.id, lesson?.videoUrl, lesson?.hlsUrl, lesson?.playlistUrl, lesson?.streamUrl, activeIndex]);

  const changeLessonByNavigation = useCallback((direction) => {
    setActiveIndex((index) => Math.max(0, Math.min(index + direction, Math.max(lessons.length - 1, 0))));
  }, [lessons.length]);

  useEffect(() => {
    const frame = playerFrameRef.current;
    if (!frame) return undefined;
    const swipe = lessonSwipeRef.current;
    let wheelDelta = 0;
    let wheelResetTimer = 0;
    let wheelLockedUntil = 0;
    const resetSwipe = () => {
      swipe.active = false;
      swipe.horizontal = false;
      swipe.vertical = false;
      swipe.pointerId = null;
    };
    const ignoreSwipeTarget = (target) => Boolean(target?.closest?.(".custom-video-controls, .video-screen-btn, input, select, textarea, [contenteditable='true']"));
    const canChangeLesson = (direction) => direction > 0 ? activeIndex < lessons.length - 1 : activeIndex > 0;
    const canTrackPlayerSwipe = () => isPlayerFullscreen(frame) || window.matchMedia?.("(max-width: 820px), (pointer: coarse)")?.matches;
    const beginSwipe = (clientX, clientY, pointerId = null) => {
      swipe.active = true;
      swipe.horizontal = false;
      swipe.vertical = false;
      swipe.pointerId = pointerId;
      swipe.startX = clientX;
      swipe.startY = clientY;
      swipe.lastX = clientX;
      swipe.lastY = clientY;
      swipe.startedAt = performance.now();
    };
    const moveSwipe = (clientX, clientY, event) => {
      if (!swipe.active || !canTrackPlayerSwipe()) return;
      swipe.lastX = clientX;
      swipe.lastY = clientY;
      const deltaX = swipe.lastX - swipe.startX;
      const deltaY = swipe.lastY - swipe.startY;
      const fullscreen = isPlayerFullscreen(frame);
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (!fullscreen && !swipe.horizontal && absY > 10 && absY > absX * 1.08) {
        resetSwipe();
        return;
      }
      if (!swipe.horizontal && absX > 10 && absX > absY * 1.1) {
        swipe.horizontal = true;
      }
      if (!swipe.vertical && fullscreen && absY > 10 && absY > absX * 1.1) {
        swipe.vertical = true;
      }
      if (swipe.horizontal && canChangeLesson(deltaX < 0 ? 1 : -1)) event.preventDefault();
      if (fullscreen && swipe.vertical && canChangeLesson(deltaY < 0 ? 1 : -1)) event.preventDefault();
    };
    const finishSwipe = (clientX, clientY, event) => {
      if (!swipe.active) return;
      const deltaX = clientX - swipe.startX;
      const deltaY = clientY - swipe.startY;
      const elapsed = Math.max(performance.now() - swipe.startedAt, 1);
      const horizontalDistanceThreshold = Math.min(96, Math.max(44, frame.clientWidth * 0.14));
      const verticalDistanceThreshold = Math.min(96, Math.max(44, frame.clientHeight * 0.06));
      const horizontalSwipe = swipe.horizontal && Math.abs(deltaX) > Math.abs(deltaY) * 1.1;
      const verticalSwipe = swipe.vertical && Math.abs(deltaY) > Math.abs(deltaX) * 1.1;
      const intentionalHorizontalSwipe = Math.abs(deltaX) >= horizontalDistanceThreshold || (Math.abs(deltaX) >= 34 && Math.abs(deltaX) / elapsed >= 0.28);
      const intentionalVerticalSwipe = Math.abs(deltaY) >= verticalDistanceThreshold || (Math.abs(deltaY) >= 34 && Math.abs(deltaY) / elapsed >= 0.28);
      const horizontalDirection = deltaX < 0 ? 1 : -1;
      const verticalDirection = deltaY < 0 ? 1 : -1;

      if (canTrackPlayerSwipe() && horizontalSwipe && intentionalHorizontalSwipe && canChangeLesson(horizontalDirection)) {
        event.preventDefault();
        swipe.suppressClickUntil = Date.now() + 500;
        changeLessonByNavigation(horizontalDirection);
      } else if (isPlayerFullscreen(frame) && verticalSwipe && intentionalVerticalSwipe && canChangeLesson(verticalDirection)) {
        event.preventDefault();
        swipe.suppressClickUntil = Date.now() + 500;
        changeLessonByNavigation(verticalDirection);
      }
      resetSwipe();
    };

    const onPointerDown = (event) => {
      if (!canTrackPlayerSwipe() || event.isPrimary === false || ignoreSwipeTarget(event.target)) {
        resetSwipe();
        return;
      }
      beginSwipe(event.clientX, event.clientY, event.pointerId);
    };
    const onPointerMove = (event) => {
      if (event.pointerId !== swipe.pointerId) return;
      moveSwipe(event.clientX, event.clientY, event);
    };
    const onPointerUp = (event) => {
      if (event.pointerId !== swipe.pointerId) return;
      finishSwipe(event.clientX, event.clientY, event);
    };

    const onTouchStart = (event) => {
      if (!canTrackPlayerSwipe() || event.touches.length !== 1 || ignoreSwipeTarget(event.target)) {
        resetSwipe();
        return;
      }
      const touch = event.touches[0];
      beginSwipe(touch.clientX, touch.clientY);
    };

    const onTouchMove = (event) => {
      if (!swipe.active || event.touches.length !== 1) return;
      const touch = event.touches[0];
      moveSwipe(touch.clientX, touch.clientY, event);
    };

    const onTouchEnd = (event) => {
      if (!swipe.active) return;
      const touch = event.changedTouches[0];
      finishSwipe(touch?.clientX ?? swipe.lastX, touch?.clientY ?? swipe.lastY, event);
    };

    const onWheel = (event) => {
      if (!isPlayerFullscreen(frame) || ignoreSwipeTarget(event.target) || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const direction = event.deltaY > 0 ? 1 : -1;
      if (!canChangeLesson(direction)) return;
      event.preventDefault();
      if (Date.now() < wheelLockedUntil) return;

      wheelDelta += event.deltaY;
      window.clearTimeout(wheelResetTimer);
      wheelResetTimer = window.setTimeout(() => { wheelDelta = 0; }, 180);
      if (Math.abs(wheelDelta) < 52) return;

      wheelLockedUntil = Date.now() + 650;
      wheelDelta = 0;
      changeLessonByNavigation(direction);
    };

    const onKeyDown = (event) => {
      if (!isPlayerFullscreen(frame)) return;
      if (event.key === "Escape" && frame.classList.contains(APP_FULLSCREEN_CLASS)) {
        event.preventDefault();
        setAppFullscreen(frame, false);
        return;
      }
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target?.closest?.("input, select, textarea, [contenteditable='true']")) return;
      const direction = event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
      if (!direction || !canChangeLesson(direction)) return;
      event.preventDefault();
      changeLessonByNavigation(direction);
    };

    const onFullscreenChange = () => {
      resetSwipe();
      if (isPlayerFullscreen(frame)) frame.focus?.({ preventScroll: true });
    };

    frame.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });
    document.addEventListener("pointermove", onPointerMove, { passive: false, capture: true });
    document.addEventListener("pointerup", onPointerUp, { passive: false, capture: true });
    document.addEventListener("pointercancel", resetSwipe, { passive: true, capture: true });
    frame.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    document.addEventListener("touchend", onTouchEnd, { passive: false, capture: true });
    document.addEventListener("touchcancel", resetSwipe, { passive: true, capture: true });
    frame.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      window.clearTimeout(wheelResetTimer);
      frame.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", resetSwipe, true);
      frame.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", resetSwipe, true);
      frame.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, [activeIndex, changeLessonByNavigation, lessons.length]);

  useEffect(() => () => {
    setAppFullscreen(playerFrameRef.current, false);
  }, []);

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
        <section className={`watch-layout${verticalPlayer ? " is-vertical-layout" : ""}`}>
          <div className="player-wrap">
            <div
              className={`player-frame mobile-reel-player${verticalPlayer ? " is-vertical-video" : ""}`}
              id="playerFrame"
              ref={playerFrameRef}
              style={verticalPlayer && naturalVideoRatio ? { "--natural-video-ratio": naturalVideoRatio } : undefined}
              tabIndex={-1}
              aria-label="Course video player. Swipe horizontally on mobile, or use arrow keys, to change lessons."
              onClickCapture={(event) => {
                if (Date.now() >= lessonSwipeRef.current.suppressClickUntil) return;
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {error ? (
                <div className="player-placeholder"><div><strong>Could not open this course</strong><span>{error}</span></div></div>
              ) : course ? (
                <Player
                  course={course}
                  lesson={lesson}
                  autoNext={autoNext}
                  onEnded={advanceNext}
                  onNavigateLesson={changeLessonByNavigation}
                  onAspectChange={({ width, height, portrait }) => setNaturalVideoRatio(portrait ? `${width} / ${height}` : "")}
                  key={`${course._id}-${activeIndex}`}
                />
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
