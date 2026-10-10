const SKILLOMATE_APP_LINK_HOSTS = new Set(["skillomate.in", "www.skillomate.in"]);
const VIDEO_PATH = "/videos";

function cleanLinkIdentifier(value) {
  const identifier = String(value || "").trim();
  if (!identifier || identifier.length > 256 || /[\u0000-\u001f\u007f]/.test(identifier)) return "";
  return identifier;
}

function parseSkillomateAppLink(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch (_) {
    return null;
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (
    url.protocol !== "https:"
    || !SKILLOMATE_APP_LINK_HOSTS.has(url.hostname.toLowerCase())
    || path !== VIDEO_PATH
  ) return null;

  const courseId = cleanLinkIdentifier(url.searchParams.get("courseId"));
  if (!courseId) return null;

  const videoId = cleanLinkIdentifier(
    url.searchParams.get("videoId")
    || url.searchParams.get("video")
    || url.searchParams.get("lectureId")
  );

  return {
    type: "video",
    courseId,
    videoId: videoId || null,
  };
}

function buildSkillomateVideoUrl(baseUrl, { courseId, videoId } = {}) {
  const normalizedCourseId = cleanLinkIdentifier(courseId);
  if (!normalizedCourseId) return "";

  let url;
  try {
    url = new URL(VIDEO_PATH, `${String(baseUrl || "https://skillomate.in").replace(/\/+$/, "")}/`);
  } catch (_) {
    url = new URL(`${VIDEO_PATH}`, "https://skillomate.in");
  }
  url.searchParams.set("courseId", normalizedCourseId);

  const normalizedVideoId = cleanLinkIdentifier(videoId);
  if (normalizedVideoId) url.searchParams.set("videoId", normalizedVideoId);
  return url.toString();
}

module.exports = {
  SKILLOMATE_APP_LINK_HOSTS,
  buildSkillomateVideoUrl,
  parseSkillomateAppLink,
};
