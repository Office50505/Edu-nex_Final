import { route } from "./routes.js";

export function courseIdentifier(course) {
  return String(course?._id || course?.id || "");
}

export function courseVideoHref(course, lessonIndex = 0) {
  const id = courseIdentifier(course);
  const video = Math.max(0, Number(lessonIndex) || 0);
  return id
    ? route(`videos.html?courseId=${encodeURIComponent(id)}&video=${video}`)
    : route("courses.html");
}

export function courseCheckoutHref(course, lessonIndex = 0) {
  const id = courseIdentifier(course);
  if (!id) return route("payment.html");

  const next = courseVideoHref(course, lessonIndex);
  return route(`payment.html?courseId=${encodeURIComponent(id)}&next=${encodeURIComponent(next)}`);
}

export function courseEntryHref(course, { hasAccess = false, lessonIndex = 0 } = {}) {
  return hasAccess
    ? courseVideoHref(course, lessonIndex)
    : courseCheckoutHref(course, lessonIndex);
}
