import { useEffect, useMemo } from "react";
import { runLegacyPage } from "./legacyRuntime.js";

const GRID_STYLE = `
  @keyframes grid-dot-blink {
    0%, 100% { opacity: 0; transform: scale(0.6); }
    50%       { opacity: 1; transform: scale(1);   }
  }
  #page-grid-global {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background-image:
      linear-gradient(rgba(0,229,255,.12) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,229,255,.12) 1px, transparent 1px);
    background-size: 60px 60px;
    mask-image: linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, black 0%, black 60%, transparent 100%);
  }
  .grid-dot-global {
    position: fixed;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #00E5FF;
    box-shadow: 0 0 8px 3px rgba(0,229,255,0.8);
    pointer-events: none;
    animation: grid-dot-blink ease-in-out infinite;
    z-index: 0;
  }
`;

function injectGrid() {
  if (document.getElementById("page-grid-global")) return;

  const style = document.createElement("style");
  style.id = "page-grid-global-style";
  style.textContent = GRID_STYLE;
  document.head.appendChild(style);

  const first = document.body.firstChild;

  const grid = document.createElement("div");
  grid.id = "page-grid-global";
  document.body.insertBefore(grid, first);

  const dots = [
    { top: 120, left: 360, dur: 2.4, delay: 0 },
    { top: 240, left: 660, dur: 3.1, delay: 0.8 },
    { top: 300, left: 180, dur: 2.7, delay: 1.5 },
    { top: 60,  left: 780, dur: 3.6, delay: 0.4 },
  ];
  dots.forEach(({ top, left, dur, delay }) => {
    const dot = document.createElement("div");
    dot.className = "grid-dot-global";
    dot.style.cssText = `top:${top}px;left:${left}px;animation-duration:${dur}s;animation-delay:${delay}s;`;
    document.body.insertBefore(dot, first);
  });
}

export function LegacyPage({ page, pageKey }) {
  const styleId = useMemo(() => `legacy-page-style-${pageKey.replace(/[^a-z0-9]/gi, "-")}`, [pageKey]);

  useEffect(() => {
    document.title = page.title || "Skillomate AI";
    document.documentElement.lang = page.lang || "en";

    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = page.styles || "";

    injectGrid();

    const cleanup = runLegacyPage(page);
    return () => {
      cleanup?.();
      style.remove();
    };
  }, [page, pageKey, styleId]);

  return (
    <div
      className="react-page-root"
      data-page={pageKey}
      dangerouslySetInnerHTML={{ __html: page.body }}
    />
  );
}
