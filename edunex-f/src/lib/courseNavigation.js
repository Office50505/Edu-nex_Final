import { route } from "./routes.js";

export function courseIdentifier(course) {
  return String(course?._id || course?.id || "");
}

export function courseVideoHref(course, lessonIndex = null) {
  const id = courseIdentifier(course);
  if (!id) return route("courses.html");
  const hasLesson = lessonIndex !== null && lessonIndex !== undefined && lessonIndex !== "";
  if (!hasLesson) return route(`videos.html?courseId=${encodeURIComponent(id)}`);
  const video = Math.max(0, Number(lessonIndex) || 0);
  return route(`videos.html?courseId=${encodeURIComponent(id)}&video=${video}`);
}

export function courseCheckoutHref(course, lessonIndex = null) {
  const id = courseIdentifier(course);
  if (!id) return route("payment.html");

  const next = courseVideoHref(course, lessonIndex);
  return route(`payment.html?courseId=${encodeURIComponent(id)}&next=${encodeURIComponent(next)}`);
}

export function courseEntryHref(course, { hasAccess = false, lessonIndex = null } = {}) {
  return hasAccess
    ? courseVideoHref(course, lessonIndex)
    : courseCheckoutHref(course, lessonIndex);
}
