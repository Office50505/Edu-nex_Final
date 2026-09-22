import { useEffect } from "react";

export function resetViewportLocks() {
  const html = document.documentElement;
  const body = document.body;
  const hasViewportLock = body.classList.contains("has-viewport-lock");
  const hasLegacyLockStyles = html.style.overflow === "hidden"
    && body.style.overflow === "hidden"
    && body.style.position === "fixed"
    && body.style.width === "100%";

  if (hasViewportLock || hasLegacyLockStyles) {
    html.style.removeProperty("overflow");
    html.style.removeProperty("overscroll-behavior");
    body.style.removeProperty("overflow");
    body.style.removeProperty("overscroll-behavior");
    body.style.removeProperty("position");
    body.style.removeProperty("top");
    body.style.removeProperty("left");
    body.style.removeProperty("right");
    body.style.removeProperty("width");
    body.style.removeProperty("padding-right");
  }
  body.classList.remove("has-viewport-lock");
}

export function useViewportLock(_active) {
  useEffect(() => {
    resetViewportLocks();
  }, [_active]);
}
