import { useEffect, useState } from "react";

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "noir";
}

export function BrandLogo({ className = "" }) {
  const classes = ["brand-logo", className].filter(Boolean).join(" ");
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    const syncTheme = () => setTheme(currentTheme());
    window.addEventListener("edunex:theme-changed", syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("edunex:theme-changed", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  const source = theme === "light"
    ? "/assets/skillomate-logo-light-v1.webp"
    : "/assets/skillomate-logo-dark-v1.webp";

  return (
    <span className={classes}>
      <img className="brand-logo-image" src={source} alt="Skillomate" width="480" height="160" decoding="async" />
    </span>
  );
}
