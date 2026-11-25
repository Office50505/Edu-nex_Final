const ROOT_TAB_COUNT = 4;

function clampRootTabProgress(value, tabCount = 4) {
  "worklet";
  return Math.max(0, Math.min(Math.max(0, tabCount - 1), Number(value) || 0));
}

function mapPagerProgressToNavSlot(progress) {
  "worklet";
  const value = clampRootTabProgress(progress);
  if (value <= 1) return value;
  if (value <= 2) return 1 + ((value - 1) * 2);
  return 3 + (value - 2);
}

function mapNavSlotToPagerProgress(navSlot) {
  "worklet";
  const value = Math.max(0, Math.min(4, Number(navSlot) || 0));
  if (value <= 1) return value;
  if (value <= 3) return 1 + ((value - 1) / 2);
  return 2 + (value - 3);
}

function isPagerProgressSampleValid({ position, offset, origin, destination = -1, tabCount = 4 }) {
  "worklet";
  if (!Number.isFinite(position) || !Number.isFinite(offset)) return false;
  const sample = clampRootTabProgress(position + offset, tabCount);
  const lower = destination >= 0 ? Math.min(origin, destination) - 0.04 : origin - 1.04;
  const upper = destination >= 0 ? Math.max(origin, destination) + 0.04 : origin + 1.04;
  const impossibleHomeReset = position === 0 && origin > 1 && destination !== 0;
  return !impossibleHomeReset && sample >= lower && sample <= upper;
}

function isPagerSelectionValid({ selectedIndex, origin, pendingTarget = null, tabCount = 4 }) {
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= tabCount) return false;
  if (pendingTarget != null) return selectedIndex === pendingTarget;
  if (Math.abs(selectedIndex - origin) > 1) return false;
  return !(selectedIndex === 0 && origin > 1);
}

module.exports = {
  ROOT_TAB_COUNT,
  clampRootTabProgress,
  isPagerProgressSampleValid,
  isPagerSelectionValid,
  mapNavSlotToPagerProgress,
  mapPagerProgressToNavSlot,
};
