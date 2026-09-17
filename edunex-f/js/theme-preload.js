(function () {
  'use strict';

  var theme = 'noir';
  try {
    theme = localStorage.getItem('enx-theme') || 'noir';
  } catch (_) {
    // Storage can be unavailable in strict private-browsing contexts.
  }

  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var isLight = theme === 'light' || (theme === 'system' && !prefersDark);
  var root = document.documentElement;
  var colors = isLight
    ? { bg: '#FAF7F1', text: '#332820', text2: '#756A60', nav: '#FBF8F2', border: '#E2D6C6' }
    : { bg: '#000000', text: '#ffffff', text2: '#9ca3af', nav: 'rgba(0,0,0,0.92)', border: 'rgba(255,255,255,0.07)' };

  root.dataset.theme = isLight ? 'light' : 'noir';
  root.classList.toggle('dark', !isLight);
  root.style.colorScheme = isLight ? 'light' : 'dark';
  root.style.background = colors.bg;
  root.style.setProperty('--bg', colors.bg);
  root.style.setProperty('--text', colors.text);
  root.style.setProperty('--text2', colors.text2);
  root.style.setProperty('--nav-bg', colors.nav);
  root.style.setProperty('--border', colors.border);

  var themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', isLight ? '#FBF8F2' : '#000000');

  var criticalStyle = document.createElement('style');
  criticalStyle.textContent = 'html,body,#root{background:var(--bg,#000);color:var(--text,#fff)}';
  document.head.appendChild(criticalStyle);
})();
