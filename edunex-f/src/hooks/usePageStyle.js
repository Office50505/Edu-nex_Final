import { useEffect } from "react";

export function usePageStyle(id, cssText) {
  useEffect(() => {
    if (!cssText) return undefined;

    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = cssText;

    return () => {
      style.remove();
    };
  }, [cssText, id]);
}
