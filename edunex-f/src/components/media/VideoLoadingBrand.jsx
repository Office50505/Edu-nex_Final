const VIDEO_LOADING_LOGO = "/assets/skillomate-video-loader.png";

export function VideoLoadingBrand({ label = "Loading video…" }) {
  return (
    <div className="video-loading-brand" role="status" aria-live="polite" aria-label={label}>
      <span className="video-loading-brand-mark" aria-hidden="true">
        <img src={VIDEO_LOADING_LOGO} alt="" width="256" height="256" decoding="async" fetchPriority="high" />
      </span>
      <span className="video-loading-brand-label">{label}</span>
    </div>
  );
}
