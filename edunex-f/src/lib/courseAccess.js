export function normalizeAccessPhase(data, localAccess = false) {
  const status = String(data?.status || data?.subscriptionStatus || data?.subscriptionDocStatus || "").trim().toLowerCase();
  const grace = Boolean(data?.grace || String(data?.entitlementState || "").toUpperCase() === "GRACE_PERIOD");
  const paid = ["active", "subscribed"].includes(status) || grace;
  const trialExpiry = data?.trialExpiresAt ? new Date(data.trialExpiresAt).getTime() : 0;
  const activeTrial = ["trial", "1rs trial"].includes(status) && (!trialExpiry || trialExpiry > Date.now()) && !paid;
  if (paid || (localAccess && !activeTrial)) return "full";
  if (activeTrial) return "trial";
  return localAccess ? "full" : "none";
}

export function courseId(course) {
  return String(course?._id || course?.id || "");
}

export function isPrimaryTrialCourse(course) {
  const text = `${course?.title || ""} ${course?.slug || ""}`.toLowerCase();
  return /\bai\s+influenc(?:er|e)\b/.test(text);
}

export function primaryTrialCourseId(courses = []) {
  return courseId(courses.find(isPrimaryTrialCourse) || courses[0]);
}

export function canOpenCourseForAccess(course, { accessPhase, courseAccessIds, trialCourseId }) {
  const id = courseId(course);
  return accessPhase === "full"
    || courseAccessIds?.has(id)
    || (accessPhase === "trial" && id === trialCourseId);
}
