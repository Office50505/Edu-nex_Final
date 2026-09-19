import { useEffect } from "react";

let activeLocks = 0;
let lockedScrollY = 0;
let previousStyles = null;

function lockViewport() {
  activeLocks += 1;
  if (activeLocks > 1) return;

  const html = document.documentElement;
  const body = document.body;
  lockedScrollY = window.scrollY || html.scrollTop || 0;
  previousStyles = {
    htmlOverflow: html.style.overflow,
    htmlOverscrollBehavior: html.style.overscrollBehavior,
    bodyOverflow: body.style.overflow,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyPaddingRight: body.style.paddingRight,
  };

  const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);
  const bodyPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;

  html.style.overflow = "hidden";
  html.style.overscrollBehavior = "none";
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";
  body.style.position = "fixed";
  body.style.top = `-${lockedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  if (scrollbarWidth > 0) body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
  body.classList.add("has-viewport-lock");
}

function unlockViewport() {
  activeLocks = Math.max(0, activeLocks - 1);
  if (activeLocks > 0 || !previousStyles) return;

  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = previousStyles.htmlOverflow;
  html.style.overscrollBehavior = previousStyles.htmlOverscrollBehavior;
  body.style.overflow = previousStyles.bodyOverflow;
  body.style.overscrollBehavior = previousStyles.bodyOverscrollBehavior;
  body.style.position = previousStyles.bodyPosition;
  body.style.top = previousStyles.bodyTop;
  body.style.left = previousStyles.bodyLeft;
  body.style.right = previousStyles.bodyRight;
  body.style.width = previousStyles.bodyWidth;
  body.style.paddingRight = previousStyles.bodyPaddingRight;
  body.classList.remove("has-viewport-lock");
  previousStyles = null;
  window.scrollTo({ top: lockedScrollY, left: 0, behavior: "auto" });
}

export function useViewportLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    lockViewport();
    return unlockViewport;
  }, [active]);
}
