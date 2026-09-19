const KEY = 'edunexLoginPrefill';

export function nationalPhoneDigits(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function pasteNationalPhone(event, setValue) {
  const pasted = event.clipboardData?.getData('text');
  if (!pasted) return;
  event.preventDefault();
  setValue(nationalPhoneDigits(pasted));
}

export function saveLoginPrefill(phone, storage, now = Date.now(), key = KEY) {
  const digits = String(phone).replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(digits)) return;
  try { storage.setItem(key, JSON.stringify({ phone: digits, expiresAt: now + 300000 })); } catch (_) {}
}
export function readLoginPrefill(storage, now = Date.now(), key = KEY) {
  try {
    const saved = JSON.parse(storage.getItem(key) || 'null');
    if (!saved || saved.expiresAt <= now || !/^\d{10,15}$/.test(saved.phone)) return '';
    return saved.phone.replace(/^91(?=\d{10}$)/, '');
  } catch (_) { return ''; }
}
export function clearLoginPrefill(storage) { try { storage.removeItem(KEY); } catch (_) {} }
export function loginDestination(next, origin) {
  try { const parsed = new URL(next || '/payment.html', origin); return `/login.html?next=${encodeURIComponent(parsed.origin === origin ? parsed.pathname + parsed.search + parsed.hash : '/payment.html')}`; }
  catch (_) { return '/login.html?next=%2Fpayment.html'; }
}

const SIGNUP_KEY = 'edunexSignupPrefill';
export function saveSignupPrefill(phone, storage, now = Date.now()) { saveLoginPrefill(phone, storage, now, SIGNUP_KEY); }
export function readSignupPrefill(storage, now = Date.now()) { return readLoginPrefill(storage, now, SIGNUP_KEY); }
export function clearSignupPrefill(storage) { try { storage.removeItem(SIGNUP_KEY); } catch (_) {} }
export function signupDestination(next, origin) { return loginDestination(next, origin).replace('/login.html?', '/signup.html?'); }
