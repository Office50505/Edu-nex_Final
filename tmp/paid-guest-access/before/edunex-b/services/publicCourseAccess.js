const publicCourseProjection = 'title status accessType publicPreviewEnabled ' + [
  '_id', 'title', 'order', 'duration', 'isFree', 'provider', 'sourceType', 'videoUrl', 'embedUrl',
  'bunnyVideoId', 'bunnyLibraryId', 'youtubeId', 'hlsUrl', 'playlistUrl', 'streamUrl',
  'thumbnailUrl', 'thumbnailVerticalUrl', 'topic', 'notes', 'description', 'transcriptUrl', 'notesUrl', 'examplePrompt',
].map(field => `videos.${field}`).join(' ');

// Public previews are a content policy, never an anonymous account or entitlement.
function orderedLessons(course) {
  return [...(course?.videos || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function isPublicLesson(course, video) {
  if (course?.status !== 'published' || !video?._id) return false;
  const lessons = orderedLessons(course);
  if (!lessons.some(item => String(item._id) === String(video._id))) return false;
  return course.accessType === 'free' || video.isFree === true
    || (course.publicPreviewEnabled !== false && String(lessons[0]?._id) === String(video._id));
}

function publicCourseVideos(course, playableInfo) {
  return orderedLessons(course).map((video, index) => isPublicLesson(course, video)
    ? { ...playableInfo(video, index), isFree: true, locked: false, publicPlayback: true }
    : { _id: String(video._id), title: video.title, order: video.order, duration: video.duration,
      thumbnailUrl: video.thumbnailUrl || null, thumbnailVerticalUrl: video.thumbnailVerticalUrl || null,
      locked: true, isFree: false });
}

module.exports = { isPublicLesson, orderedLessons, publicCourseVideos, publicCourseProjection };
