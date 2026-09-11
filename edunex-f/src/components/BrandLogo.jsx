export function BrandLogo({ className = "" }) {
  const classes = ["brand-logo", className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      <img className="brand-logo-image brand-logo-image-light" src="/assets/skillomate-logo.png" alt="Skillomate" />
      <img className="brand-logo-image brand-logo-image-dark" src="/assets/skillomate-logo-dark.png" alt="" aria-hidden="true" />
    </span>
  );
}
