export function clock(seconds) {
  const n = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return n >= 3600 ? `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2,'0')}:${String(n % 60).padStart(2,'0')}` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2,'0')}`;
}
export function seekTarget(value, duration) { return Math.min(Math.max(0, Number.isFinite(duration) ? duration : 0), Math.max(0, Number.isFinite(value) ? value : 0)); }
export function available(lesson) { return !!lesson && !lesson.locked && !lesson.isLocked && lesson.canAccess !== false; }
export function adjacent(lessons, index, delta) { const next = index + delta; return next >= 0 && next < lessons.length && available(lessons[next]) ? next : index; }

export function nativeLessonSource(lesson) {
  if (!lesson || lesson.provider === 'aws_cloudfront' || lesson.provider === 'youtube' || lesson.youtubeId) return '';
  const value = lesson.hlsUrl || lesson.playlistUrl || lesson.streamUrl || lesson.videoUrl || '';
  return /^https:\/\//i.test(value) && /\.(m3u8(?:%20)*|mp4|webm|ogg|mov|m4v)(?:[?#]|$)/i.test(value) ? value : '';
}
export function usesCustomPlayer(lesson) { return lesson?.provider === 'aws_cloudfront' || !!nativeLessonSource(lesson); }
