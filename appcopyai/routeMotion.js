function clampBackSwipe(distance, width) {
  const limit = Math.max(1, Number(width) || 1);
  return Math.max(0, Math.min(limit, Number(distance) || 0));
}

function shouldCaptureBackSwipe({ x0, dx, dy, edgeWidth = 28 }) {
  const horizontal = Number(dx) || 0;
  const vertical = Math.abs(Number(dy) || 0);
  return Number(x0) <= edgeWidth
    && horizontal > 8
    && horizontal > vertical * 1.15;
}

function shouldCompleteBackSwipe({ dx, vx, width }) {
  const distance = clampBackSwipe(dx, width);
  const threshold = Math.max(72, (Number(width) || 0) * 0.26);
  return distance >= threshold || (Number(vx) || 0) >= 0.62;
}

function resolveRouteOrigin(origin, width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const x = Number(origin?.x);
  const y = Number(origin?.y);
  return {
    x: Number.isFinite(x) ? Math.max(0, Math.min(safeWidth, x)) : safeWidth / 2,
    y: Number.isFinite(y) ? Math.max(0, Math.min(safeHeight, y)) : safeHeight / 2,
  };
}

module.exports = {
  clampBackSwipe,
  shouldCaptureBackSwipe,
  shouldCompleteBackSwipe,
  resolveRouteOrigin,
};
