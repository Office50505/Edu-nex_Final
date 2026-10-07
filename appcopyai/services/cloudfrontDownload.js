function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function downloadGrantPath(courseId, videoId) {
  return `/api/courses/${encodeURIComponent(courseId)}/videos/${encodeURIComponent(videoId)}/download-grant`;
}

function canFallbackToCloudFrontHlsDownload(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || "").toLowerCase();
  return (
    status === 425
    || status >= 500
    || message.includes("conversion")
    || message.includes("ffmpeg")
    || message.includes("prepared")
    || message.includes("temporarily unavailable")
  );
}

async function requestPreparedCloudfrontDownload({
  session,
  courseId,
  videoId,
  maxStatusAttempts = 120,
  pollDelayMs = 1000,
  waitFn = wait,
}) {
  const grantPath = downloadGrantPath(courseId, videoId);
  const grant = await session.requestJson(grantPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prepared: true }),
  });
  if (!grant?.downloadUrl) throw new Error("The download authorization response was invalid.");
  if (!grant.statusUrl) return grant;

  try {
    for (let attempt = 0; attempt < maxStatusAttempts; attempt += 1) {
      const status = await session.requestJson(grant.statusUrl);
      if (status?.status === "ready") return grant;
      if (status?.status === "error") throw new Error(status.error || "Video could not be prepared for offline download.");
      await waitFn(pollDelayMs);
    }
    throw new Error("Video is still being prepared. Please retry shortly.");
  } catch (error) {
    const message = String(error?.message || error || "").toLowerCase();
    const preparationWasLost = Number(error?.status || 0) === 404 && message.includes("preparation");
    if (!preparationWasLost) throw error;

    // Prepared jobs live in one backend process. If a load balancer sends the
    // status poll to another process, use a single-request download so the
    // conversion and response stay on the same server instance.
    const directGrant = await session.requestJson(grantPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prepared: false }),
    });
    const directDownloadUrl = directGrant?.directDownloadUrl || directGrant?.downloadUrl;
    if (!directDownloadUrl) throw new Error("The direct download authorization response was invalid.");
    return { ...directGrant, downloadUrl: directDownloadUrl, statusUrl: "" };
  }
}

module.exports = { canFallbackToCloudFrontHlsDownload, requestPreparedCloudfrontDownload };
