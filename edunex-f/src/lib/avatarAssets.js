export const WEB_PROFILE_AVATARS = [
  "assets/avatars/male1-v1.webp",
  "assets/avatars/male2-v1.webp",
  "assets/avatars/male3-v1.webp",
  "assets/avatars/male4-v1.webp",
  "assets/avatars/male5-v1.webp",
  "assets/avatars/male6-v1.webp",
  "assets/avatars/female1-v1.webp",
  "assets/avatars/female2-v1.webp",
  "assets/avatars/female3-v1.webp",
  "assets/avatars/female4-v1.webp",
  "assets/avatars/female5-v1.webp",
  "assets/avatars/female6-v1.webp",
];

export const APP_PROFILE_AVATARS = Array.from(
  { length: 15 },
  (_, index) => `assets/avatars/a${index + 1}.jpeg`,
);

export const PROFILE_AVATARS = [...WEB_PROFILE_AVATARS, ...APP_PROFILE_AVATARS];

const APP_AVATAR_ALIASES = Object.freeze({
  f1: "a1",
  f2: "a4",
  f3: "a5",
  f4: "a6",
  f5: "a7",
  f6: "a13",
  m1: "a2",
  m2: "a3",
  m3: "a8",
  m4: "a9",
  m5: "a10",
  m6: "a11",
});

function appAvatarPath(value) {
  const token = String(value || "").trim().toLowerCase();
  const canonical = APP_AVATAR_ALIASES[token] || token;
  return /^a(?:1[0-5]|[1-9])$/.test(canonical)
    ? `assets/avatars/${canonical}.jpeg`
    : "";
}

export function normalizeProfileAvatarPath(value, origin = "https://skillomate.in") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const directAppAvatar = appAvatarPath(raw);
  if (directAppAvatar) return directAppAvatar;

  try {
    const parsed = new URL(raw, origin);
    const path = parsed.pathname.replace(/^\/+/, "");
    const pathAppAvatar = appAvatarPath(path);
    if (pathAppAvatar) return pathAppAvatar;
    const assetIndex = path.lastIndexOf("assets/");
    const normalized = assetIndex >= 0 ? path.slice(assetIndex) : raw;
    return normalized.replace(
      /^assets\/(male[1-6]|female[1-6])\.jpeg$/i,
      (_, name) => `assets/avatars/${name.toLowerCase()}-v1.webp`,
    );
  } catch (_) {
    return raw;
  }
}

export function profileAvatarSrc(value) {
  const normalized = normalizeProfileAvatarPath(value);
  return normalized.startsWith("assets/") ? `/${normalized}` : normalized;
}
