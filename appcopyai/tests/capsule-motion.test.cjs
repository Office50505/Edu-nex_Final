const test = require("node:test");
const assert = require("node:assert/strict");
const { createCapsuleMotion, resistNavSlot, releaseNavSlot } = require("../capsuleMotion");

// Position springs deliberately remain unfinished while the outro runs.
function harness(slot = 0) {
  const pending = new Set();
  const value = initial => ({ value: initial, setValue(next) { this.value = next; } });
  const position = value(slot), expansion = value(0), stretch = value(0);
  const task = (kind, node, config) => ({
    kind, node, config, callback: null,
    start(cb) { this.callback = cb; pending.add(this); },
    stop() { pending.delete(this); this.callback?.({ finished: false }); },
    finish() { pending.delete(this); node.setValue(config.toValue); this.callback?.({ finished: true }); },
  });
  const Animated = {
    spring: (node, config) => task("spring", node, config),
    timing: (node, config) => task("timing", node, config),
    sequence: steps => {
      let index = 0, stopped = false, callback;
      const next = result => {
        if (stopped || !result.finished) { callback?.({ finished: false }); return; }
        if (index === steps.length) { callback?.({ finished: true }); return; }
        steps[index++].start(next);
      };
      return {
        start(cb) { callback = cb; next({ finished: true }); },
        stop() { stopped = true; steps[index - 1]?.stop(); },
      };
    },
  };
  const Easing = { cubic: "cubic", out: x => x, inOut: x => x };
  const previewSlots = [];
  const motion = createCapsuleMotion({ Animated, Easing, position, expansion, stretch, initialSlot: slot,
    onPreviewSlotChange: next => previewSlots.push(next),
  });
  const finish = node => {
    const a = [...pending].find(a => a.node === node);
    assert.ok(a, "expected an active animation");
    a.finish();
    return a;
  };
  return { motion, position, expansion, stretch, pending, finish, previewSlots };
}

test("drag tint follows crossed tabs once per boundary and restores the released selection", () => {
  const h = harness();
  h.motion.press(1);
  h.motion.drag(1.2);
  h.motion.drag(1.7);
  h.motion.drag(2.1);
  h.motion.drag(2.4);
  h.motion.drag(2.8);
  h.motion.release(1);
  assert.deepEqual(h.previewSlots, [1, 2, 3, 1]);
  h.motion.reset(0);
  assert.equal(h.previewSlots.at(-1), 0);
});

test("quick tap intro/outro completes without waiting for the position spring", () => {
  const h = harness();
  h.motion.press(3);
  h.motion.release(3);
  const intro = h.finish(h.expansion);
  assert.equal(h.expansion.value, 1);
  const outro = h.finish(h.expansion);
  assert.equal(h.expansion.value, 0);
  assert.ok(intro.config.duration + outro.config.duration <= 300);
  assert.equal(h.motion.getState().phase, "idle");
  assert.ok([...h.pending].some(a => a.node === h.position));
});

test("new hold cancels old outro and rejects its late completion callback", () => {
  const h = harness();
  h.motion.press(1);
  h.motion.release(1);
  h.finish(h.expansion);
  const oldOutro = [...h.pending].find(a => a.node === h.expansion);
  h.motion.press(4);
  assert.ok(!h.pending.has(oldOutro));
  oldOutro.callback({ finished: true });
  assert.equal(h.motion.getState().phase, "pressed");
  assert.equal(h.motion.getState().target, 4);
  h.finish(h.expansion);
  assert.equal(h.expansion.value, 1);
});

test("drag remains expanded through navigation confirmation and follows the finger", () => {
  const h = harness();
  h.motion.press(1);
  h.motion.drag(1.4, 1);
  h.finish(h.expansion);
  h.motion.drag(2.1, -0.8);
  h.motion.sync(0);
  assert.equal(h.position.value, 2.1);
  assert.equal(h.expansion.value, 1);
  assert.equal(h.motion.getState().phase, "dragging");
  assert.ok(h.stretch.value > 0 && h.stretch.value <= 1);
});

test("confirmation of the same destination cannot interrupt release", () => {
  const h = harness(1);
  h.motion.release(3);
  const before = [...h.pending];
  h.motion.sync(3);
  assert.deepEqual([...h.pending], before);
  h.finish(h.expansion);
  h.finish(h.expansion);
  assert.equal(h.expansion.value, 0);
});

test("reduce motion, search reset and unmount stop pending animations", () => {
  const h = harness();
  h.motion.press(1);
  h.motion.setReducedMotion(true);
  assert.equal(h.pending.size, 0);
  h.motion.press(4);
  h.motion.release(4);
  assert.equal(h.position.value, 4);
  assert.equal(h.expansion.value, 0);
  assert.equal(h.pending.size, 0);
  h.motion.setReducedMotion(false);
  h.motion.press(0);
  h.motion.reset(3);
  assert.equal(h.pending.size, 0);
  assert.equal(h.position.value, 3);
  h.motion.release(1);
  h.motion.dispose();
  assert.equal(h.pending.size, 0);
});

test("edge resistance is bounded and flick projection cannot skip the bar", () => {
  for (let slot = -10; slot <= 14; slot += 0.1) {
    const resisted = resistNavSlot(slot);
    assert.ok(resisted >= -0.061 && resisted <= 4.061);
    for (const velocity of [-10, -1, 0, 1, 10]) {
      const released = releaseNavSlot(resisted, velocity, 76);
      assert.ok(released >= 0 && released <= 4);
    }
  }
  assert.equal(resistNavSlot(2.5), 2.5);
  assert.equal(releaseNavSlot(1.4, 1, 76), 2);
  assert.equal(releaseNavSlot(1.4, -1, 76), 1);
});
