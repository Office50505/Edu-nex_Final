const test = require("node:test");
const assert = require("node:assert/strict");

const {
  clampRootTabProgress,
  isPagerProgressSampleValid,
  isPagerSelectionValid,
  mapNavSlotToPagerProgress,
  mapPagerProgressToNavSlot,
} = require("../rootTabMotion");

test("pager progress maps around the Search action without desynchronizing root tabs", () => {
  assert.equal(mapPagerProgressToNavSlot(0), 0);
  assert.equal(mapPagerProgressToNavSlot(1), 1);
  assert.equal(mapPagerProgressToNavSlot(1.5), 2);
  assert.equal(mapPagerProgressToNavSlot(2), 3);
  assert.equal(mapPagerProgressToNavSlot(3), 4);
});

test("progress is clamped to real root pages", () => {
  assert.equal(clampRootTabProgress(-5), 0);
  assert.equal(clampRootTabProgress(2.25), 2.25);
  assert.equal(clampRootTabProgress(99), 3);
});

test("hold-drag nav slots map through the Search action without selecting it", () => {
  assert.equal(mapNavSlotToPagerProgress(0), 0);
  assert.equal(mapNavSlotToPagerProgress(1), 1);
  assert.equal(mapNavSlotToPagerProgress(2), 1.5);
  assert.equal(mapNavSlotToPagerProgress(3), 2);
  assert.equal(mapNavSlotToPagerProgress(4), 3);
});

test("interrupted iOS home-reset samples are rejected", () => {
  assert.equal(isPagerProgressSampleValid({ position: 0, offset: 0, origin: 2, destination: 3 }), false);
  assert.equal(isPagerProgressSampleValid({ position: 2, offset: 0.45, origin: 2, destination: 3 }), true);
  assert.equal(isPagerProgressSampleValid({ position: 1, offset: 0.8, origin: 2, destination: -1 }), true);
});

test("stale selections cannot beat the newest command", () => {
  assert.equal(isPagerSelectionValid({ selectedIndex: 1, origin: 0, pendingTarget: 3 }), false);
  assert.equal(isPagerSelectionValid({ selectedIndex: 3, origin: 0, pendingTarget: 3 }), true);
  assert.equal(isPagerSelectionValid({ selectedIndex: 0, origin: 2 }), false);
  assert.equal(isPagerSelectionValid({ selectedIndex: 1, origin: 2 }), true);
});

test("UI-thread worklets do not depend on module-scope tab constants", () => {
  assert.doesNotMatch(clampRootTabProgress.toString(), /ROOT_TAB_COUNT/);
  assert.doesNotMatch(isPagerProgressSampleValid.toString(), /ROOT_TAB_COUNT/);
  assert.doesNotMatch(mapNavSlotToPagerProgress.toString(), /ROOT_TAB_COUNT/);
});
