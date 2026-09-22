const STANDARD_EVENTS = new Set(['PageView', 'ViewContent', 'Lead', 'CompleteRegistration', 'InitiateCheckout', 'Purchase', 'Subscribe']);
let activePixelId = '';
let initialized = false;

function safeParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

export function initMetaPixel(config = {}) {
  const pixelId = String(config.pixelId || '').replace(/\D/g, '');
  if (!config.enabled || !pixelId || typeof window === 'undefined') return false;
  if (!window.fbq) {
    const fbq = function fbq() { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  if (!initialized || activePixelId !== pixelId) {
    window.fbq('init', pixelId);
    initialized = true;
    activePixelId = pixelId;
  }
  return true;
}

export function trackMetaPixel(eventName, params = {}, options = {}) {
  if (!initialized || typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  const method = STANDARD_EVENTS.has(eventName) ? 'track' : 'trackCustom';
  window.fbq(method, eventName, safeParams(params), safeParams(options));
}

export function metaEventId(prefix) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
