function activeCourseEntitlement(user, courseId, now = Date.now()) {
  const id = String(courseId || '');
  if (!id) return null;
  const entitlement = (user?.courseEntitlements || []).find((item) => String(item?.course || item?.courseId) === id);
  if (entitlement) {
    const type = String(entitlement.accessType || 'permanent');
    const expiry = entitlement.expiresAt ? new Date(entitlement.expiresAt).getTime() : null;
    if (type === 'permanent' || (Number.isFinite(expiry) && expiry > now)) return entitlement;
    return null;
  }
  // Existing purchasedCourses records predate expiring entitlements and remain permanent.
  return (user?.purchasedCourses || []).some((item) => String(item) === id)
    ? { course: id, accessType: 'permanent', expiresAt: null }
    : null;
}

function activeCourseEntitlements(user, now = Date.now()) {
  const entitlements = new Map();
  (user?.courseEntitlements || []).forEach((item) => {
    const courseId = String(item?.course || item?.courseId || '');
    if (!courseId) return;
    const active = activeCourseEntitlement(user, courseId, now);
    if (active) entitlements.set(courseId, active);
  });
  (user?.purchasedCourses || []).forEach((item) => {
    const courseId = String(item?._id || item || '');
    if (!courseId || entitlements.has(courseId)) return;
    const active = activeCourseEntitlement(user, courseId, now);
    if (active) entitlements.set(courseId, active);
  });
  return [...entitlements.entries()].map(([courseId, item]) => ({
    courseId,
    accessType: item.accessType || 'permanent',
    expiresAt: item.expiresAt || null,
  }));
}

module.exports = { activeCourseEntitlement, activeCourseEntitlements };
