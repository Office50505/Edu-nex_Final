const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clampBackSwipe,
  shouldCaptureBackSwipe,
  shouldCompleteBackSwipe,
  resolveRouteOrigin,
} = require("../routeMotion");

test("back swipe starts only from the leading edge and rejects vertical scrolling", () => {
  assert.equal(shouldCaptureBackSwipe({ x0: 12, dx: 20, dy: 3 }), true);
  assert.equal(shouldCaptureBackSwipe({ x0: 60, dx: 30, dy: 0 }), false);
  assert.equal(shouldCaptureBackSwipe({ x0: 12, dx: 7, dy: 0 }), false);
  assert.equal(shouldCaptureBackSwipe({ x0: 12, dx: 18, dy: 22 }), false);
  assert.equal(shouldCaptureBackSwipe({ x0: 12, dx: -30, dy: 0 }), false);
});

test("back swipe completes by distance or forward velocity", () => {
  assert.equal(shouldCompleteBackSwipe({ dx: 110, vx: 0.1, width: 390 }), true);
  assert.equal(shouldCompleteBackSwipe({ dx: 28, vx: 0.8, width: 390 }), true);
  assert.equal(shouldCompleteBackSwipe({ dx: 55, vx: 0.2, width: 390 }), false);
});

test("back swipe distance cannot leave the route bounds", () => {
  assert.equal(clampBackSwipe(-20, 390), 0);
  assert.equal(clampBackSwipe(120, 390), 120);
  assert.equal(clampBackSwipe(900, 390), 390);
});

test("genie route origin uses the pressed point and never defaults to the bottom", () => {
  assert.deepEqual(resolveRouteOrigin({ x: 84, y: 312 }, 390, 844), { x: 84, y: 312 });
  assert.deepEqual(resolveRouteOrigin(null, 390, 844), { x: 195, y: 422 });
  assert.deepEqual(resolveRouteOrigin({ x: -20, y: 1000 }, 390, 844), { x: 0, y: 844 });
});
