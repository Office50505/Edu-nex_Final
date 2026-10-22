const { publicPlayableVideoInfo } = require('./mobileCompatibilityService');

// Do not fetch embedded image data as part of a playlist. An image is loaded
// separately, once, instead of duplicating its base64 bytes for every lesson.
const playlistProjection = [
  'title', 'description', 'status', 'thumbnail.mimeType', 'thumbnailHorizontal.mimeType', 'thumbnailVertical.mimeType', 'thumbnailUrl', 'thumbnailVerticalUrl', 'notesUrl',
  ...['_id', 'title', 'topic', 'description', 'notes', 'provider', 'sourceType', 'videoUrl',
    'embedUrl', 'bunnyVideoId', 'bunnyLibraryId', 'youtubeId', 'hlsUrl', 'playlistUrl',
    'streamUrl', 'thumbnailUrl', 'thumbnailVerticalUrl', 'thumbnail.mimeType',
    'transcriptUrl', 'notesUrl', 'notes', 'examplePrompt', 'duration', 'order'].map(field => `videos.${field}`),
].join(' ');

function playlistPayload(course, resolveBunnyHls) {
  const imagePath = `/api/courses/${encodeURIComponent(String(course._id))}/thumbnail`;
  const horizontal = (course.thumbnailHorizontal?.mimeType || course.thumbnail?.mimeType) ? imagePath : course.thumbnailUrl || imagePath;
  const vertical = course.thumbnailVertical?.mimeType ? `${imagePath}?orientation=vertical` : course.thumbnailVerticalUrl || `${imagePath}?orientation=vertical`;
  return {
    _id: course._id, title: course.title, description: course.description,
    status: course.status, notesUrl: course.notesUrl,
    thumbnailUrl: horizontal, thumbnailVerticalUrl: vertical,
    videos: (course.videos || []).map((video, index) => ({
      ...publicPlayableVideoInfo(video, index),
      notes: video.notes || '',
      ...(resolveBunnyHls && require('./videoSources').inferProvider(video) !== 'aws_cloudfront'
        ? { hlsUrl: resolveBunnyHls(video) } : {}),
      thumbnailUrl: video.thumbnailUrl || (video.thumbnail?.mimeType
        ? `/api/courses/${encodeURIComponent(String(course._id))}/videos/${encodeURIComponent(String(video._id))}/thumbnail`
        : horizontal),
      thumbnailVerticalUrl: video.thumbnailVerticalUrl || video.thumbnailUrl || vertical,
    })),
  };
}
module.exports = { playlistProjection, playlistPayload };
