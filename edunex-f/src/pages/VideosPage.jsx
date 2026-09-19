import "../components/page-recovery.css";
import { plainCourseDescription } from "../lib/courseDescription.js";
import { CourseMediaPlayer } from "../components/media/CourseMediaPlayer.jsx";
import { adjacent, available, usesCustomPlayer } from "../components/media/playerRules.js";
import { loadHlsJs } from "../lib/hlsRuntime.js";
import { usePlaybackAccess } from "../hooks/usePlaybackAccess.js";
import { useLearningProgress, progressCacheKey } from "../hooks/useLearningProgress.js";
import { CertificationProgress } from "../components/CertificationProgress.jsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { page as videosPage } from "../generated-pages/videos.html.js";
import { runLegacyPage } from "../legacyRuntime.js";
import { usePageStyle } from "../hooks/usePageStyle.js";
import { courseRequest } from "../lib/courseRequest.js";

const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27900%27%20height=%27600%27%20viewBox=%270%200%20900%20600%27%3E%3Crect%20width=%27900%27%20height=%27600%27%20fill=%27%23000000%27/%3E%3Crect%20x=%271%27%20y=%271%27%20width=%27898%27%20height=%27598%27%20rx=%2732%27%20fill=%27%230d0d0d%27%20stroke=%27%23C58B2A%27%20stroke-opacity=%27.35%27/%3E%3Ctext%20x=%27450%27%20y=%27312%27%20text-anchor=%27middle%27%20fill=%27%23C58B2A%27%20font-family=%27Arial%27%20font-size=%2748%27%20font-weight=%27800%27%3ESkillomate%3C/text%3E%3C/svg%3E";
const AUTO_NEXT_KEY = "edunexAutoNextVideo";
const APP_FULLSCREEN_CLASS = "is-app-fullscreen";
const BODY_FULLSCREEN_CLASS = "has-edunex-player-fullscreen";
const BODY_MOBILE_REEL_CLASS = "has-edunex-mobile-reel";
const MAX_SWIPE_LESSON_JUMP = 8;
const LECTURES_PER_SHEET_PAGE = 20;

function nativeFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function playerOverlayHost() {
  return nativeFullscreenElement() || document.querySelector("#playerFrame.is-app-fullscreen");
}

function PlayerOverlayPortal({ children }) {
  const host = playerOverlayHost();
  return host ? createPortal(children, host) : children;
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
  if (window.EduNex?.clearAuth) {
    window.EduNex.clearAuth();
    return;
  }
  ["edunexAccessToken", "edunexRefreshToken", "edunexUser"].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
  ["edunexWishlistLocal", "edunexHasCourseAccess", "edunexSignupProfile"].forEach((key) => localStorage.removeItem(key));
  const progressKeys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("edunexCourseProgress:")) progressKeys.push(key);
  }
  progressKeys.forEach((key) => localStorage.removeItem(key));
}

function paymentUrlForCourse(courseId) {
  const paymentUrl = new URL("/payment", window.location.origin);
  paymentUrl.searchParams.set("plan", "monthly");
  if (courseId) paymentUrl.searchParams.set("courseId", courseId);
  paymentUrl.searchParams.set("next", window.location.pathname + window.location.search);
  return paymentUrl.pathname + paymentUrl.search;
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
    if (/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return parsed.href;
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

function fallbackImage(label = "Skillomate") {
  const clean = String(label || "Skillomate").replace(/[&<>"']/g, "").slice(0, 32);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><rect width="900" height="600" fill="#050710"/><rect x="1" y="1" width="898" height="598" rx="32" fill="#0d0d0d" stroke="#C58B2A" stroke-opacity=".35"/><text x="450" y="300" text-anchor="middle" fill="#C58B2A" font-family="Arial" font-size="42" font-weight="800">${clean}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function courseProgress(course) {
  try {
    const saved = JSON.parse(localStorage.getItem(progressCacheKey(course._id)) || "{}");
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

function noteValue(lesson, course) {
  return lesson?.notesUrl || lesson?.notesURL || lesson?.notesLink || lesson?.notes
    || course?.notesUrl || course?.notesURL || course?.notesLink || course?.courseNotesUrl || course?.notes || course?.courseNotes || "";
}

function isLikelyUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim()) || /^\/[^/]/.test(String(value || "").trim());
}

function lessonIdentifier(lesson, index = 0) {
  return String(lesson?._id || lesson?.id || lesson?.videoId || lesson?.bunnyVideoId || lesson?.bunnyGuid || lesson?.youtubeId || index);
}

function firstIncompleteLessonIndex(course, learningStatus, cachedProgress = {}) {
  const videos = course?.videos || [];
  const progressRows = Array.isArray(learningStatus?.lessons) ? learningStatus.lessons : [];
  if (progressRows.length) {
    const completeIds = new Set(progressRows.filter((row) => row?.complete).map((row) => String(row.id || row.videoId || "")));
    const nextIndex = videos.findIndex((video, index) => !completeIds.has(lessonIdentifier(video, index)));
    return nextIndex >= 0 ? nextIndex : Math.max(videos.length - 1, 0);
  }
  const cachedIndex = Number(cachedProgress?.lessonIndex);
  return Number.isFinite(cachedIndex) ? Math.max(0, Math.min(cachedIndex, Math.max(videos.length - 1, 0))) : 0;
}

function completedLessonIds(learningStatus, cachedProgress = {}) {
  const rows = Array.isArray(learningStatus?.lessons) ? learningStatus.lessons : [];
  if (rows.length) return new Set(rows.filter((row) => row?.complete).map((row) => String(row.id || row.videoId || "")));
  return new Set(Array.isArray(cachedProgress?.completedVideoIds) ? cachedProgress.completedVideoIds.map(String) : []);
}

function ReelIcon({ name }) {
  const paths = {
    back: <path d="M19 12H5m6-6-6 6 6 6" />,
    notes: <><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></>,
    report: <><path d="M6 3v18" /><path d="M6 4h11l-2 4 2 4H6" /></>,
    ai: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></>,
    lectures: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  };
  return <svg className="reel-control-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function nextPlaybackRate(rate) {
  const rates = [1, 1.5, 2, 0.5];
  const current = Number(rate) || 1;
  const index = rates.findIndex((value) => value === current);
  return rates[(index + 1) % rates.length];
}

function lessonJumpFromHorizontalSwipe(distance, elapsed, frameWidth) {
  const absDistance = Math.abs(Number(distance) || 0);
  if (!absDistance) return 0;
  const width = Math.max(Number(frameWidth) || 0, 1);
  const velocity = absDistance / Math.max(Number(elapsed) || 1, 1);
  const distanceStep = Math.max(1, Math.round(absDistance / Math.max(72, width * 0.24)));
  const velocityBonus = velocity >= 1.65 ? 3 : velocity >= 1.05 ? 2 : velocity >= 0.58 ? 1 : 0;
  return Math.min(MAX_SWIPE_LESSON_JUMP, distanceStep + velocityBonus);
}

function VideoControls({ playing, volume, muted, rate, currentTime, duration, onToggle, onSeek, onVolume, onRate, onFullscreen, onAi, onScreenTap, onScreenSwipe, mobileViewMode, onToggleMobileView }) {
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
          {onToggleMobileView ? <button className="video-control-btn video-fullscreen-control" type="button" data-action="view-mode" aria-label={mobileViewMode === "immersive" ? "Minimize player" : "Open fullscreen player"} onClick={onToggleMobileView}><i className={`fas ${mobileViewMode === "immersive" ? "fa-compress" : "fa-expand"}`} aria-hidden="true"></i></button> : <button className="video-control-btn video-fullscreen-control" type="button" data-action="fullscreen" aria-label="Enter fullscreen" onClick={onFullscreen}><i className="fas fa-expand" aria-hidden="true"></i></button>}
        </div>
      </div>
    </>
  );
}

function Player({ course, lesson: savedLesson, lessonIndex, autoNext, autoplay = false, onEnded, onNavigateLesson, forceEmbed = false, mobileViewMode = null, onToggleMobileView }) {
  const playback = usePlaybackAccess(course._id, savedLesson);
  const lesson = playback.lesson;
  const videoRef = useRef(null);
  const iframeRef = useRef(null);
  const embeddedPlayerRef = useRef(null);
  const shellRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(() => Math.max(0, Math.min(1, Number(localStorage.getItem("edunexVideoVolume") || 1))));
  const [muted, setMuted] = useState(() => localStorage.getItem("edunexVideoMuted") === "true");
  const [rate, setRate] = useState(1);
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const videoId = String(lesson._id || lesson.id || lesson.bunnyVideoId || lesson.bunnyGuid || lesson.youtubeId || lesson.videoId || lessonIndex);
  const learning = useLearningProgress(course._id, videoId, time, playing);
  const resumed = useRef(false);
  const playerStateRef = useRef({ autoNext, muted, onEnded, rate, volume });
  const playingRef = useRef(false);
  const screenTapRef = useRef({ side: "", at: 0 });
  const screenToggleTimerRef = useRef(null);
  const screenHintTimerRef = useRef(null);

  const url = embedUrl(lesson);
  const directUrl = forceEmbed ? "" : lesson.provider === "aws_cloudfront" ? (lesson.hlsUrl || "") : directVideoUrl(lesson) || bunnyStreamUrl(lesson);
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

  useEffect(() => {
    if (!autoplay) return undefined;
    const start = () => {
      const video = videoRef.current;
      if (video) {
        video.play().catch(() => {
          video.muted = true;
          setMuted(true);
          localStorage.setItem("edunexVideoMuted", "true");
          video.play().catch(() => {});
        });
        return;
      }
      try { embeddedPlayerRef.current?.play?.(); } catch (_) {}
      postToEmbed({ event: "command", func: "playVideo", args: [] });
      postToEmbed({ event: "command", func: "play", args: [] });
      postToEmbed({ method: "play" });
    };
    const timer = window.setTimeout(start, 120);
    const video = videoRef.current;
    video?.addEventListener("canplay", start, { once: true });
    return () => {
      window.clearTimeout(timer);
      video?.removeEventListener("canplay", start);
    };
  }, [autoplay, directUrl, postToEmbed]);

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

  useEffect(() => {
    if (resumed.current || learning.resume === null || !time.duration) return;
    resumed.current = true;
    if (learning.resume > 0 && learning.resume < time.duration - 2) seekBy(learning.resume - time.current);
  }, [learning.resume, time.duration, time.current, seekBy]);

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
  }, [autoNext, muted, onEnded, rate, syncPlaying, volume, directUrl]);

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
      const restore = time.current;
      const ready = () => { if (restore > 0) video.currentTime = restore; if (playingRef.current) video.play().catch(() => {}); };
      video.addEventListener("loadedmetadata", ready);
      video.src = directUrl;
      return () => video.removeEventListener("loadedmetadata", ready);
    }
    let cancelled = false;
    let hlsInstance = null;
    loadHlsJs()
      .then((Hls) => {
        if (cancelled || !Hls?.isSupported?.()) return;
        hlsInstance = new Hls({ enableWorker: true });
        hlsInstance.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) playback.setError('Video playback failed. Check access, the CloudFront object path and CORS configuration, then retry.'); });
        const restore = time.current;
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => { if (restore > 0) video.currentTime = restore; if (playingRef.current) video.play().catch(() => {}); });
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
      mobileViewMode={mobileViewMode}
      onToggleMobileView={onToggleMobileView}
    />
  );

  if (savedLesson.provider === 'aws_cloudfront' && (!directUrl || playback.error)) return <div className="player-placeholder"><div><strong>{playback.error || 'Authorizing video playback…'}</strong>{playback.error?<button onClick={playback.retry}>Retry playback</button>:null}</div></div>;
  if (directUrl) {
    return (
      <div className="custom-video-player" data-custom-player="true" tabIndex={-1} ref={shellRef}>
        <video onError={() => { if(savedLesson.provider === "aws_cloudfront") playback.setError("Video playback failed. Check the video path, access and CloudFront CORS, then retry."); }} ref={videoRef} src={needsHlsRuntime ? undefined : directUrl} poster={lessonImage(course, lesson)} playsInline preload="metadata"></video>
        {controls}
        <span role="status" style={{position:"absolute",top:8,left:8,zIndex:4,fontSize:11,background:"#111c",color:"#fff",padding:6,maxWidth:"90%"}}>{learning.notice}</span>
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
        <span role="status" style={{position:"absolute",top:8,left:8,zIndex:4,fontSize:11,background:"#111c",color:"#fff",padding:6,maxWidth:"90%"}}>{learning.notice}</span>
      </div>
    );
  }

  return (
    <div className="player-placeholder">
      <div><strong>Video source coming soon</strong><span>This lesson is in the playlist, but no playable source is attached yet.</span></div>
    </div>
  );
}

function NotesModal({ course, lesson, lessonIndex, onClose }) {
  const value = String(noteValue(lesson, course)).trim();
  const title = lesson?.title ? `Lecture ${lessonIndex + 1}: ${lesson.title} notes` : (course?.title ? `${course.title} notes` : "Course notes");
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
          {value ? <div>{value.split("\n").map((line, index) => <span key={`${line}-${index}`}>{line}<br /></span>)}</div> : <div className="notes-empty">No notes are attached to this lecture yet.</div>}
        </div>
      </div>
    </div>
  );
}

function LectureSheet({ course, activeIndex, completedIds, onClose, onSelect }) {
  const lessons = course?.videos || [];
  const [rangeIndex, setRangeIndex] = useState(Math.floor(activeIndex / LECTURES_PER_SHEET_PAGE));
  const ranges = Array.from({ length: Math.max(1, Math.ceil(lessons.length / LECTURES_PER_SHEET_PAGE)) }, (_, index) => ({
    start: index * LECTURES_PER_SHEET_PAGE,
    end: Math.min((index + 1) * LECTURES_PER_SHEET_PAGE, lessons.length),
  }));
  const activeRange = ranges[Math.min(rangeIndex, ranges.length - 1)] || { start: 0, end: lessons.length };

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="reel-lecture-backdrop" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="reel-lecture-sheet" role="dialog" aria-modal="true" aria-labelledby="reelLecturesTitle">
        <div className="reel-sheet-grabber" aria-hidden="true"></div>
        <header className="reel-sheet-header">
          <div>
            <h2 id="reelLecturesTitle">Lectures</h2>
            <p>{course?.title || "Course playlist"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close lectures"><span aria-hidden="true">×</span></button>
        </header>
        {ranges.length > 1 ? (
          <div className="reel-sheet-ranges" role="tablist" aria-label="Lecture ranges">
            {ranges.map((range, index) => (
              <button type="button" role="tab" aria-selected={rangeIndex === index} className={rangeIndex === index ? "is-active" : ""} onClick={() => setRangeIndex(index)} key={`${range.start}-${range.end}`}>
                {range.start + 1}–{range.end}
              </button>
            ))}
          </div>
        ) : null}
        <div className="reel-lecture-grid">
          {lessons.slice(activeRange.start, activeRange.end).map((item, offset) => {
            const index = activeRange.start + offset;
            const isActive = index === activeIndex;
            const isComplete = completedIds.has(lessonIdentifier(item, index));
            return (
              <button
                type="button"
                className={`${isActive ? "is-active" : ""}${isComplete ? " is-complete" : ""}`}
                disabled={!available(item)}
                aria-current={isActive ? "true" : undefined}
                aria-label={`Lecture ${index + 1}: ${item.title || "Untitled lecture"}${isComplete ? ", completed" : ""}`}
                onClick={() => onSelect(index)}
                key={lessonIdentifier(item, index)}
              >
                <span className="reel-lecture-thumb">
                  <img
                    src={lessonImage(course, item)}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = fallbackImage(item.title || `Lecture ${index + 1}`);
                    }}
                  />
                  {isActive ? <span className="reel-lecture-state" aria-hidden="true">•••</span> : isComplete ? <span className="reel-lecture-state" aria-hidden="true">✓</span> : null}
                </span>
                <span className="reel-lecture-number">{index + 1}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function VideosPage() {
  const playerFrameRef = useRef(null);
  const lessonSwipeRef = useRef({ active: false, pointerId: null, startX: 0, startY: 0, lastX: 0, lastY: 0, startedAt: 0, horizontal: false, vertical: false, suppressClickUntil: 0 });
  const query = queryParams();
  const selectedCourseId = query.get("courseId") || query.get("course") || query.get("id");
  const selectedVideoParam = query.get("video") ?? query.get("videoId") ?? query.get("lesson");
  const hasExplicitVideo = selectedVideoParam !== null && selectedVideoParam !== "";
  const selectedVideoIndex = Number(selectedVideoParam);
  const [courses, setCourses] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState(null);
  const [fallbackLesson,setFallbackLesson] = useState(null);
  const [autoplayLesson,setAutoplayLesson] = useState(false);
  const [playlistOpen,setPlaylistOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(hasExplicitVideo && Number.isFinite(selectedVideoIndex) ? selectedVideoIndex : 0);
  const [status, setStatus] = useState("Preparing course...");
  const [error, setError] = useState("");
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [lectureSheetOpen, setLectureSheetOpen] = useState(false);
  const [learningStatus, setLearningStatus] = useState(null);
  const [mobilePlayerViewport, setMobilePlayerViewport] = useState(() => Boolean(window.matchMedia?.("(max-width: 820px), (max-width: 1180px) and (pointer: coarse)")?.matches));
  const [mobilePlayerMinimized, setMobilePlayerMinimized] = useState(false);
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

  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 820px), (max-width: 1180px) and (pointer: coarse)");
    const syncMobileReel = () => {
      const isMobile = Boolean(media?.matches);
      setMobilePlayerViewport(isMobile);
      if (!isMobile) setMobilePlayerMinimized(false);
      document.body.classList.toggle(BODY_MOBILE_REEL_CLASS, Boolean(selectedCourseId && isMobile && !mobilePlayerMinimized));
    };
    syncMobileReel();
    if (media?.addEventListener) media.addEventListener("change", syncMobileReel);
    else media?.addListener?.(syncMobileReel);
    return () => {
      if (media?.removeEventListener) media.removeEventListener("change", syncMobileReel);
      else media?.removeListener?.(syncMobileReel);
      document.body.classList.remove(BODY_MOBILE_REEL_CLASS);
    };
  }, [selectedCourseId, mobilePlayerMinimized]);


  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setError("");
    setSubscriptionRequired(false);
    setCourse(null);
    setLearningStatus(null);
    setStatus("Preparing course...");
    (async () => {
      if (!selectedCourseId) {
        window.location.replace("/courses.html");
        return;
      }
      try {
        if (!getToken()) {
          window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return;
        }
        // Start downloading the player runtime while the authorized playlist loads.
        loadHlsJs().catch(() => {});
        const playbackTarget = hasExplicitVideo ? selectedVideoParam : "0";
        const learningRequest = window.EduNex?.authRequest
          ? window.EduNex.authRequest(`/api/learning/${encodeURIComponent(selectedCourseId)}`).catch(() => null)
          : Promise.resolve(null);
        const [{ response, data }, nextLearningStatus] = await Promise.all([
          courseRequest(`/api/courses/${encodeURIComponent(selectedCourseId)}/lessons?playback=${encodeURIComponent(playbackTarget)}`, {
            headers: { Authorization: `Bearer ${getToken()}` }, signal: controller.signal,
          }),
          learningRequest,
        ]);
        if (response.status === 401) {
          clearAuthStorage();
          window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return;
        }
        if (cancelled) return;
        if (response.status === 403) {
          if (["no_subscription", "subscription_expired"].includes(data?.error)) {
            setSubscriptionRequired(true);
            setStatus("Subscription required");
            return;
          }
          throw new Error("You do not have access to this course. Please contact support.");
        }
        if (!response.ok) throw new Error(response.status === 404
          ? "This course could not be found." : "Could not load the course playlist. Please retry.");
        const nextCourse = normalizeCourse(data);
        if (cancelled) return;
        let cachedProgress = {};
        try {
          cachedProgress = JSON.parse(localStorage.getItem(progressCacheKey(nextCourse._id)) || "{}");
        } catch (_) {
          cachedProgress = {};
        }
        const requestedIndex = Number(selectedVideoParam);
        const requestedById = hasExplicitVideo && !Number.isFinite(requestedIndex) ? nextCourse.videos.findIndex((video) => {
          const ids = [video?._id, video?.id, video?.videoId, video?.bunnyVideoId, video?.youtubeId].map((value) => String(value || ""));
          return ids.includes(String(selectedVideoParam));
        }) : -1;
        const rawIndex = hasExplicitVideo
          ? (requestedById >= 0 ? requestedById : (Number.isFinite(requestedIndex) ? requestedIndex : 0))
          : firstIncompleteLessonIndex(nextCourse, nextLearningStatus, cachedProgress);
        const nextIndex = Math.max(0, Math.min(rawIndex, Math.max(nextCourse.videos.length - 1, 0)));
        setCourse(nextCourse);
        setCourses([nextCourse]);
        setLearningStatus(nextLearningStatus);
        setActiveIndex(nextIndex);
        setAutoplayLesson(true);
        setStatus(nextCourse.videos.length ? "Course ready" : "No lessons yet");
      } catch (failure) {
        if (!cancelled) {
          setError(failure.message || "Could not load the course. Please retry.");
          setStatus("Course unavailable");
        }
      }
    })();
    return () => { cancelled = true; controller.abort(); };
    // The initial index is clamped after loading; navigating lessons must not reload the course.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId, loadAttempt]);

  useEffect(() => {
    if (!course) return;
    const lessons = course.videos || [];
    const key = progressCacheKey(course._id);
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(key) || "{}");
    } catch (_) {
      saved = {};
    }
    const resumeIndex = learningStatus
      ? firstIncompleteLessonIndex(course, learningStatus, saved)
      : (Number.isFinite(Number(saved.lessonIndex)) ? Number(saved.lessonIndex) : activeIndex);
    const completedIds = learningStatus
      ? Array.from(completedLessonIds(learningStatus, saved))
      : (Array.isArray(saved.completedVideoIds) ? saved.completedVideoIds : []);
    localStorage.setItem(key, JSON.stringify({
      ...saved,
      viewed: true,
      lastViewedAt: new Date().toISOString(),
      lessonIndex: resumeIndex,
      lastOpenedLessonIndex: activeIndex,
      lastWatchedVideoId: lessonIdentifier(course.videos?.[activeIndex], activeIndex),
      completedVideoIds: completedIds,
      completed: learningStatus?.completedLessons ?? saved.completed ?? 0,
      percent: learningStatus?.progressPercent ?? saved.percent ?? 0,
    }));
    const urlState = new URL(window.location.href);
    urlState.searchParams.set("courseId", course._id);
    urlState.searchParams.set("video", activeIndex);
    history.replaceState(null, "", urlState.pathname + urlState.search);
  }, [activeIndex, course, learningStatus]);

  useEffect(() => {
    if (!course) return undefined;
    const updateLearningStatus = (event) => {
      if (String(event.detail?.courseId || "") === String(course._id)) setLearningStatus(event.detail);
    };
    window.addEventListener("learning-progress", updateLearningStatus);
    return () => window.removeEventListener("learning-progress", updateLearningStatus);
  }, [course]);

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

  useEffect(() => {
    if (!playlistOpen) return undefined;
    const closePlaylistDrawer = (event) => {
      if (event.key === "Escape") setPlaylistOpen(false);
    };
    const scrollFrame = window.requestAnimationFrame(() => {
      document.querySelector("#course-playlist .lesson-item.is-active")?.scrollIntoView?.({
        behavior: "smooth",
        block: "center",
      });
    });
    document.addEventListener("keydown", closePlaylistDrawer);
    return () => {
      window.cancelAnimationFrame(scrollFrame);
      document.removeEventListener("keydown", closePlaylistDrawer);
    };
  }, [playlistOpen, activeIndex]);

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
  let cachedProgress = {};
  try {
    cachedProgress = course ? JSON.parse(localStorage.getItem(progressCacheKey(course._id)) || "{}") : {};
  } catch (_) {
    cachedProgress = {};
  }
  const completedIds = completedLessonIds(learningStatus, cachedProgress);
  const lessonExamplePrompt = String(
    lesson.examplePrompt || lesson.examplePromptText || lesson.examplePromptUrl || lesson.promptUrl || "",
  ).trim();

  const changeLessonByNavigation = useCallback((delta) => {
    setAutoplayLesson(true);
    setActiveIndex((index) => adjacent(lessons,index,delta));
  }, [lessons]);

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
    const ignoreSwipeTarget = (target) => Boolean(target?.closest?.(".sm-controls, .sm-settings, .sm-big-play, .custom-video-controls, .video-ai-screen-btn, .reel-chrome button, .reel-chrome a, input, select, textarea, [contenteditable='true']"));
    const canChangeLesson = (delta) => delta > 0 ? activeIndex < lessons.length - 1 : delta < 0 && activeIndex > 0;
    const canTrackPlayerSwipe = () => isPlayerFullscreen(frame) || window.matchMedia?.("(max-width: 820px), (pointer: coarse)")?.matches;
    const isMobileReel = () => document.body.classList.contains(BODY_MOBILE_REEL_CLASS);
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
      const verticalNavigation = fullscreen || isMobileReel();
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (!verticalNavigation && !swipe.horizontal && absY > 10 && absY > absX * 1.08) {
        resetSwipe();
        return;
      }
      if (!swipe.horizontal && absX > 10 && absX > absY * 1.1) {
        swipe.horizontal = true;
      }
      if (!swipe.vertical && verticalNavigation && absY > 10 && absY > absX * 1.1) {
        swipe.vertical = true;
      }
      if (swipe.horizontal && canChangeLesson(deltaX < 0 ? 1 : -1)) event.preventDefault();
      if (verticalNavigation && swipe.vertical && canChangeLesson(deltaY < 0 ? 1 : -1)) event.preventDefault();
    };
    const finishSwipe = (clientX, clientY, event) => {
      if (!swipe.active) return;
      const deltaX = clientX - swipe.startX;
      const deltaY = clientY - swipe.startY;
      const elapsed = Math.max(performance.now() - swipe.startedAt, 1);
      const horizontalDistanceThreshold = Math.min(72, Math.max(28, frame.clientWidth * 0.08));
      const verticalDistanceThreshold = Math.min(96, Math.max(44, frame.clientHeight * 0.06));
      const horizontalSwipe = swipe.horizontal && Math.abs(deltaX) > Math.abs(deltaY) * 1.1;
      const verticalSwipe = swipe.vertical && Math.abs(deltaY) > Math.abs(deltaX) * 1.1;
      const intentionalHorizontalSwipe = Math.abs(deltaX) >= horizontalDistanceThreshold || (Math.abs(deltaX) >= 24 && Math.abs(deltaX) / elapsed >= 0.22);
      const intentionalVerticalSwipe = Math.abs(deltaY) >= verticalDistanceThreshold || (Math.abs(deltaY) >= 34 && Math.abs(deltaY) / elapsed >= 0.28);
      const horizontalDirection = deltaX < 0 ? 1 : -1;
      const verticalDirection = deltaY < 0 ? 1 : -1;
      const horizontalDelta = horizontalDirection * lessonJumpFromHorizontalSwipe(deltaX, elapsed, frame.clientWidth);

      if (canTrackPlayerSwipe() && horizontalSwipe && intentionalHorizontalSwipe && canChangeLesson(horizontalDelta)) {
        event.preventDefault();
        swipe.suppressClickUntil = Date.now() + 500;
        changeLessonByNavigation(horizontalDelta);
      } else if ((isPlayerFullscreen(frame) || isMobileReel()) && verticalSwipe && intentionalVerticalSwipe && canChangeLesson(verticalDirection)) {
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
      if ((!isPlayerFullscreen(frame) && !isMobileReel()) || ignoreSwipeTarget(event.target) || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
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
      if (!isPlayerFullscreen(frame) || event.target?.closest?.(".sm-player")) return;
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
    document.body.classList.remove(BODY_MOBILE_REEL_CLASS);
  }, []);

  const openNotes = () => {
    const value = String(noteValue(lesson, course)).trim();
    if (value && isLikelyUrl(value)) {
      window.location.href = value;
      return;
    }
    setNotesOpen(true);
  };

  const handleReelBack = useCallback((event) => {
    const frame = playerFrameRef.current;
    if (mobilePlayerViewport || !isPlayerFullscreen(frame)) return;

    event.preventDefault();
    event.stopPropagation();
    if (frame.classList.contains(APP_FULLSCREEN_CLASS)) {
      setAppFullscreen(frame, false);
      return;
    }

    const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
    if (exitFullscreen) Promise.resolve(exitFullscreen.call(document)).catch(() => {});
  }, [mobilePlayerViewport]);

  const selectLecture = (index) => {
    const item = lessons[index];
    if (!item || !available(item)) return;
    setAutoplayLesson(true);
    setActiveIndex(index);
    setLectureSheetOpen(false);
  };

  const openProblemReport = () => {
    window.dispatchEvent(new CustomEvent("skillomate:open-problem-report", {
      detail: { courseId: course?._id, videoId: lessonIdentifier(lesson, activeIndex) },
    }));
  };

  const openPlayerAi = () => {
    const container = playerFrameRef.current || document.body;
    if (window.NexAIWidget?.open) {
      window.NexAIWidget.open(container);
      return;
    }
    document.getElementById("nai-float-btn")?.click();
  };

  const toggleMobilePlayerView = () => {
    setMobilePlayerMinimized((minimized) => {
      const next = !minimized;
      if (next) {
        window.requestAnimationFrame(() => {
          playerFrameRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        });
      }
      return next;
    });
  };

  const advanceNext = useCallback(() => {
    setAutoplayLesson(true);
    setActiveIndex((index) => adjacent(lessons,index,1));
  }, [lessons]);

  const renderCourseTile = (item, isContinue) => {
    const progress = courseProgress(item);
    const nextLesson = item.videos?.[progress.index] || item.videos?.[0] || {};
    const href = `/videos.html?courseId=${encodeURIComponent(item._id)}&video=${progress.index}`;
    const lessonCount = item.videos?.length || 0;
    const badge = isContinue && progress.percent > 0 ? "Continue" : lessonCount ? `${lessonCount} videos` : "Course";
    return (
      <a className="course-tile" href={href} data-course-id={item._id} key={`${item._id}-${isContinue ? "continue" : "all"}`}>
        <div className="tile-media">
          <img src={courseImage(item)} alt={item.title || "Skillomate course"} onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = fallbackImage(event.currentTarget.alt || "Skillomate");
          }} />
          <span className="tile-badge">{badge}</span>
        </div>
        <div className="tile-body">
          <h3>{item.title || "Untitled course"}</h3>
          <p>{isContinue ? `Next: ${nextLesson.title || "Start course"}` : (plainCourseDescription(item.description) || "Open this course to watch the full playlist.")}</p>
          <div className="tile-meta">
            <span>{lessonCount || "No"} lessons</span>
            <span>{item.averageRating ? `${Number(item.averageRating).toFixed(1)} rating` : "Skillomate course"}</span>
          </div>
          <div className="tile-progress" style={{ "--progress": `${progress.percent}%` }}><span></span></div>
        </div>
      </a>
    );
  };

  if (subscriptionRequired) return (
    <main className="skillomate-recovery" aria-labelledby="course-access-title">
      <section className="skillomate-recovery-card" role="region" aria-label="Subscription required">
        <h1 id="course-access-title">Subscribe to continue</h1>
        <p>This course requires Skillomate Premium. Subscribe or renew your membership to start learning.</p>
        <div className="skillomate-recovery-actions">
          <a className="skillomate-recovery-primary" href={paymentUrlForCourse(selectedCourseId)}>View subscription plans</a>
          <a href="/courses">Back to courses</a>
        </div>
      </section>
    </main>
  );

  return (
    <div className="react-page-root" data-page="videos.html">
      <main id="libraryView" hidden={Boolean(selectedCourseId)}>
        <section className="library-hero library-shell">
          <div>
            <p className="library-kicker">Skillomate Library</p>
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
            <span className="status-line" id="loadStatus">{courses.length ? "Synced with Skillomate courses" : "Loading library..."}</span>
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
            <button className="watch-tool-btn playlist-drawer-trigger" type="button" aria-expanded={playlistOpen} aria-controls="course-playlist" onClick={() => setPlaylistOpen((open) => !open)}><i className="fas fa-list" aria-hidden="true"></i> Lectures</button>
          </div>
        </div>
        <section className={`watch-layout${playlistOpen?"":" sm-playlist-closed"}`}>
          <div className="player-wrap">
            <div
              className="player-frame mobile-reel-player"
              id="playerFrame"
              ref={playerFrameRef}
              tabIndex={-1}
              aria-label="Course video player. Swipe up or down on mobile to change lectures."
              onClickCapture={(event) => {
                if (Date.now() >= lessonSwipeRef.current.suppressClickUntil) return;
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {error ? (
                <div className="player-placeholder"><div><strong>Could not open this course</strong><span>{error}</span><button type="button" className="toolbar-button" onClick={() => setLoadAttempt(attempt => attempt + 1)}>Retry loading course</button></div></div>
              ) : course ? (
                !available(lesson) ? <div className="player-placeholder">This lesson is locked.</div> : usesCustomPlayer(lesson) && fallbackLesson !== `${course._id}-${lesson._id}` ? <CourseMediaPlayer onFallback={lesson.provider !== 'aws_cloudfront' && isBunnyEmbedUrl(embedUrl(lesson)) ? ()=>setFallbackLesson(`${course._id}-${lesson._id}`) : undefined} autoplay={autoplayLesson} course={course} lesson={lesson} lessonIndex={activeIndex} autoNext={autoNext} onEnded={advanceNext} onNavigateLesson={changeLessonByNavigation} mobileViewMode={mobilePlayerViewport ? (mobilePlayerMinimized ? "landscape" : "immersive") : null} onToggleMobileView={mobilePlayerViewport ? toggleMobilePlayerView : undefined} key={`${course._id}-${lesson._id}`}/> : <Player
                  forceEmbed={fallbackLesson === `${course._id}-${lesson._id}`}
                  course={course}
                  lesson={lesson}
                  lessonIndex={activeIndex}
                  autoNext={autoNext}
                  autoplay={autoplayLesson}
                  onEnded={advanceNext}
                  onNavigateLesson={changeLessonByNavigation}
                  mobileViewMode={mobilePlayerViewport ? (mobilePlayerMinimized ? "landscape" : "immersive") : null}
                  onToggleMobileView={mobilePlayerViewport ? toggleMobilePlayerView : undefined}
                  key={`${course._id}-${activeIndex}`}
                />
              ) : (
                <div className="player-placeholder"><div><strong>Preparing course</strong><span>Loading your Skillomate course playlist...</span></div></div>
              )}
              {selectedCourseId ? (
                <div className="reel-chrome" aria-label="Lecture controls">
                  <div className="reel-topbar">
                    <div className="reel-topbar-start">
                      <a className="reel-icon-button" href="/courses.html" aria-label="Back to courses or minimize fullscreen player" onClick={handleReelBack}><ReelIcon name="back" /></a>
                      <strong>{course ? `Lecture ${activeIndex + 1}/${Math.max(lessons.length, 1)}` : status}</strong>
                    </div>
                    {course && !error ? <div className="reel-topbar-actions">
                      <button className="reel-icon-button" type="button" onClick={openNotes} aria-label="Open lecture notes"><ReelIcon name="notes" /><span>Notes</span></button>
                      <button className="reel-icon-button reel-report-button" type="button" onClick={openProblemReport} aria-label="Report a problem"><ReelIcon name="report" /><span>Report</span></button>
                    </div> : null}
                  </div>
                  {course && !error ? <div className="reel-side-actions">
                    <button className="reel-side-button" type="button" onClick={openPlayerAi} aria-label="Open AI chat for this lecture"><ReelIcon name="ai" /><span>AI chat</span></button>
                    <button className="reel-side-button" type="button" onClick={() => setLectureSheetOpen(true)} aria-label="Open all lectures"><ReelIcon name="lectures" /><span>Lectures</span></button>
                  </div> : null}
                  {course && !error ? <div className="reel-lesson-copy">
                    <strong>{lesson.title || `Lecture ${activeIndex + 1}`}</strong>
                    <span>{lesson.description || course.title || "Skillomate course"}</span>
                  </div> : null}
                </div>
              ) : null}
            </div>
            {course ? <CertificationProgress key={course._id} courseId={course._id} /> : null}
            <div className="lesson-info">
              <h1 id="lessonTitle">{error ? "Course unavailable" : (lesson.title || course?.title || "Select a lesson")}</h1>
              <p id="lessonDescription">{error || plainCourseDescription(lesson.description || course?.description) || "Choose a video from the playlist to begin watching."}</p>
              {lessonExamplePrompt ? (
                <details className="example-prompt-drawer" key={`${course?._id || "course"}-${activeIndex}-example-prompt`}>
                  <summary>Example prompt</summary>
                  <div className="example-prompt-content">{lessonExamplePrompt}</div>
                </details>
              ) : null}
              <div className="lesson-meta" id="lessonMeta">
                {course ? <span>{course.title || "Skillomate course"}</span> : null}
                {course ? <span>Lesson {activeIndex + 1} of {Math.max(lessons.length, 1)}</span> : null}
                {course ? <span>{formatDuration(lesson.duration)}</span> : null}
              </div>
            </div>
          </div>
          {playlistOpen ? <button className="playlist-drawer-backdrop" type="button" aria-label="Dismiss lecture drawer" onClick={() => setPlaylistOpen(false)}></button> : null}
          <aside className="lesson-sidebar playlist-drawer" role="dialog" aria-modal="true" aria-label="Course lectures" id="course-playlist" hidden={!playlistOpen}>
            <div className="sidebar-head">
              <div className="sidebar-top-row">
                <h2 id="sidebarCourseTitle">{course?.title || "Course playlist"}</h2>
                <div className="playlist-drawer-controls">
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
                  <button className="playlist-drawer-close" type="button" aria-label="Close course lectures" onClick={() => setPlaylistOpen(false)}><span aria-hidden="true">×</span></button>
                </div>
              </div>
              <p id="sidebarCourseMeta">{course ? `${lessons.length} videos in this course` : "Videos will appear here."}</p>
            </div>
            <div className="lesson-list" id="lessonList">
              {error ? <div className="empty-state">{error}</div> : null}
              {!error && course && !lessons.length ? <div className="empty-state">This course does not have videos attached yet.</div> : null}
              {!error && lessons.map((item, index) => (
                <button className={`lesson-item${index === activeIndex ? " is-active" : ""}`} type="button" data-index={index} key={item._id || item.id || `${item.title}-${index}`} disabled={!available(item)} aria-current={index===activeIndex?"true":undefined} onClick={() => {if(available(item)){setAutoplayLesson(true);setActiveIndex(index);setPlaylistOpen(false);}}}>
                  <span className="lesson-thumb">
                    <img src={lessonImage(course, item)} alt={item.title || course.title || "Skillomate lesson"} onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = fallbackImage(event.currentTarget.alt || "Skillomate");
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

      {notesOpen ? <PlayerOverlayPortal><NotesModal course={course} lesson={lesson} lessonIndex={activeIndex} onClose={() => setNotesOpen(false)} /></PlayerOverlayPortal> : null}
      {lectureSheetOpen && course ? (
        <PlayerOverlayPortal>
          <LectureSheet
            course={course}
            activeIndex={activeIndex}
            completedIds={completedIds}
            onClose={() => setLectureSheetOpen(false)}
            onSelect={selectLecture}
          />
        </PlayerOverlayPortal>
      ) : null}
    </div>
  );
}
