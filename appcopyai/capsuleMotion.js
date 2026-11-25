// One owner for the lens lifecycle. Animation handles, including pending outros,
// are cancelled as a unit when a newer touch takes ownership.
function createCapsuleMotion({ Animated, Easing, position, expansion, stretch, initialSlot = 0, onPreviewSlotChange = () => {} }) {
  let phase = "idle";
  let target = initialSlot;
  let epoch = 0;
  let reduced = false;
  let disposed = false;
  let previewSlot = initialSlot;
  const preview = slot => {
    const next = Math.max(0, Math.min(4, Math.round(slot)));
    if (next === previewSlot) return;
    previewSlot = next;
    onPreviewSlotChange(next);
  };
  const running = new Map();
  const native = { useNativeDriver: true, isInteraction: false };
  const stop = key => {
    const animation = running.get(key);
    running.delete(key);
    animation?.stop();
  };
  const interrupt = () => {
    epoch += 1;
    [...running.keys()].forEach(stop);
  };
  const run = (key, animation, complete) => {
    stop(key);
    const token = epoch;
    running.set(key, animation);
    animation.start(result => {
      if (disposed || token !== epoch || running.get(key) !== animation) return;
      running.delete(key);
      if (result.finished) complete?.();
    });
  };
  const spring = (value, toValue, extra = {}) => Animated.spring(value, {
    ...native, toValue, damping: 25, stiffness: 340, mass: 0.65,
    restDisplacementThreshold: 0.001, restSpeedThreshold: 0.01,
    overshootClamping: true, ...extra,
  });
  const move = slot => {
    target = slot;
    preview(slot);
    if (reduced) position.setValue(slot);
    else run("position", spring(position, slot));
  };
  const reset = slot => {
    interrupt();
    phase = "idle";
    target = slot;
    preview(slot);
    position.setValue(slot);
    expansion.setValue(0);
    stretch.setValue(0);
  };
  return {
    press(slot) {
      if (disposed) return;
      interrupt();
      phase = "pressed";
      move(slot);
      stretch.setValue(0);
      if (!reduced) run("expansion", spring(expansion, 1, { damping: 21, stiffness: 380, mass: 0.55 }));
    },
    drag(slot, velocity = 0) {
      if (disposed) return;
      if (phase !== "dragging") {
        interrupt();
        phase = "dragging";
        if (!reduced) run("expansion", spring(expansion, 1));
      }
      target = slot;
      preview(slot);
      position.setValue(slot);
      stretch.setValue(reduced ? 0 : Math.min(1, Math.abs(velocity) / 1.5));
    },
    release(slot) {
      if (disposed || (phase === "releasing" && target === slot)) return;
      interrupt();
      if (reduced) { reset(slot); return; }
      phase = "releasing";
      move(slot);
      run("stretch", spring(stretch, 0));
      // A quick tap still opens the lens. The outro is bounded from touch-up;
      // it never waits for the position spring's long settling tail.
      run("expansion", Animated.sequence([
        Animated.timing(expansion, { ...native, toValue: 1, duration: 80, easing: Easing.out(Easing.cubic) }),
        Animated.timing(expansion, { ...native, toValue: 0, duration: 180, easing: Easing.inOut(Easing.cubic) }),
      ]), () => { phase = "idle"; });
    },
    sync(slot) {
      if (disposed || phase === "pressed" || phase === "dragging" || target === slot) return;
      interrupt();
      phase = "idle";
      expansion.setValue(0);
      stretch.setValue(0);
      move(slot);
    },
    setReducedMotion(value) {
      reduced = Boolean(value);
      if (reduced) reset(target);
    },
    reset,
    dispose() { disposed = true; interrupt(); },
    getState: () => ({ phase, target }),
  };
}

function resistNavSlot(slot, last = 4) {
  const bounded = Math.max(0, Math.min(last, slot));
  const overflow = slot - bounded;
  return bounded + (overflow / (1 + Math.abs(overflow) * 5)) * 0.3;
}

function releaseNavSlot(slot, velocity = 0, itemWidth = 1) {
  // At most a quarter of one tab of momentum; a flick cannot skip the bar.
  const projection = Math.max(-0.25, Math.min(0.25, velocity * 60 / Math.max(1, itemWidth)));
  return Math.max(0, Math.min(4, Math.round(slot + projection)));
}

module.exports = { createCapsuleMotion, resistNavSlot, releaseNavSlot };
