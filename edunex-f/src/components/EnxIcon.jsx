const ICON_PATHS = {
  apple: '<path d="M16.5 2.7c-.9.1-2 .7-2.6 1.5-.6.7-1.1 1.7-1 2.7 1 .1 2.1-.5 2.7-1.3.7-.8 1.1-1.8.9-2.9z"></path><path d="M20.2 17.2c-.4.9-.6 1.3-1.1 2.1-.7 1.1-1.7 2.5-3 2.5-1.1 0-1.4-.7-2.9-.7s-1.8.7-2.9.7c-1.3 0-2.3-1.3-3-2.4-2.1-3.1-2.3-6.8-1-8.8.9-1.4 2.3-2.2 3.7-2.2 1.5 0 2.4.8 3.6.8s1.9-.8 3.3-.8c1 0 2.2.6 3.1 1.6-2.7 1.5-2.3 5.3.2 7.2z"></path>',
  arrowRight: '<path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path>',
  award: '<circle cx="12" cy="8" r="5"></circle><path d="M8.5 12.5 7 22l5-3 5 3-1.5-9.5"></path>',
  badge: '<path d="M12 3 8.5 5 4.5 5.5 4 9.5 2 12l2 2.5.5 4 4 .5 3.5 2 3.5-2 4-.5.5-4 2-2.5-2-2.5-.5-4-4-.5z"></path><path d="m9 12 2 2 4-4"></path>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"></path>',
  bookOpen: '<path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path>',
  checkCircle: '<circle cx="12" cy="12" r="9"></circle><path d="m8 12 2.5 2.5L16 9"></path>',
  code: '<path d="m16 18 6-6-6-6"></path><path d="m8 6-6 6 6 6"></path>',
  compass: '<circle cx="12" cy="12" r="10"></circle><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"></path>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"></path>',
  flag: '<path d="M5 22V4"></path><path d="M5 5c4-3 7 3 14 0v10c-7 3-10-3-14 0"></path>',
  home: '<path d="m3 10 9-7 9 7"></path><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"></path>',
  info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 8h.01"></path>',
  key: '<path d="M21 2l-2 2"></path><path d="m15.5 7.5 3-3"></path><circle cx="7.5" cy="16.5" r="5.5"></circle><path d="m12 12 7-7"></path>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="m16 17 5-5-5-5"></path><path d="M21 12H9"></path>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path>',
  map: '<path d="M14.5 4.5 9.5 2l-6 3v15l6-3 5 2.5 6-3v-15z"></path><path d="M9.5 2v15"></path><path d="M14.5 4.5v15"></path>',
  menu: '<path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"></rect><path d="M11 18h2"></path>',
  play: '<circle cx="12" cy="12" r="10"></circle><path d="m10 8 6 4-6 4z"></path>',
  playStore: '<path d="M5 3.6v16.8c0 .8.9 1.3 1.6.9l9.2-5.3 2.6-1.5c.7-.4.7-1.4 0-1.8l-2.6-1.5-9.2-5.3C5.9 2.3 5 2.8 5 3.6z"></path><path d="m6 4 9.8 12"></path><path d="M6 20 15.8 8"></path>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1V2z"></path><path d="M8 7h8"></path><path d="M8 12h8"></path><path d="M8 17h5"></path>',
  plus: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
  close: '<path d="m6 6 12 12"></path><path d="M18 6 6 18"></path>',
  search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2z"></path>',
  sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.42 1.42"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.42"></path>',
  sparkles: '<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"></path><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"></path><path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8z"></path>',
  target: '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>',
  user: '<path d="M19 21a7 7 0 0 0-14 0"></path><circle cx="12" cy="8" r="4"></circle>',
  video: '<path d="m16 13 5 3V8l-5 3"></path><rect x="3" y="6" width="13" height="12" rx="2"></rect>',
  arrowUp: '<path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path>',
};

export function EnxIcon({ name, className = "", decorative = true }) {
  return (
    <span
      className={`enx-icon ${className}`.trim()}
      data-enx-icon={name}
      aria-hidden={decorative ? "true" : undefined}
    >
      <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || ICON_PATHS.sparkles }} />
    </span>
  );
}
