const range = (start, end) => Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);

const TOPIC_STYLES = [
  { icon: "bulb", color: "#E6B96B" },
  { icon: "analytics", color: "#27C6A4" },
  { icon: "git-network", color: "#D94F85" },
  { icon: "fitness", color: "#8D6BE8" },
  { icon: "speedometer", color: "#22BCA1" },
  { icon: "shield-checkmark", color: "#E6B96B" },
];

function topicKey(title) {
  return String(title || "topic")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "topic";
}

function topicPresentation(title, index) {
  const normalized = String(title || "").toLowerCase();
  if (/photo|image|visual|design|camera/.test(normalized)) return { icon: "image", color: "#27C6A4" };
  if (/video|reel|film|animation/.test(normalized)) return { icon: "videocam", color: "#D94F85" };
  if (/prompt|writing|language|chat/.test(normalized)) return { icon: "chatbubble-ellipses", color: "#8D6BE8" };
  if (/money|earn|moneti|business|sale/.test(normalized)) return { icon: "cash", color: "#E6B96B" };
  if (/ethic|safe|deploy|security/.test(normalized)) return { icon: "shield-checkmark", color: "#E6B96B" };
  if (/data|analytic|metric|evaluat/.test(normalized)) return { icon: "analytics", color: "#27C6A4" };
  if (/model|architect|network/.test(normalized)) return { icon: "git-network", color: "#D94F85" };
  if (/train|practice|workout/.test(normalized)) return { icon: "fitness", color: "#8D6BE8" };
  return TOPIC_STYLES[index % TOPIC_STYLES.length];
}

// These presentation groups resolve against the real course's ordered lessons at runtime.
// They never create or duplicate lesson records.
export const HOME_TOPIC_DEFINITIONS = [
  { key: "character", title: "Character Building", icon: "person", color: "#E6B96B", lessonNumbers: range(1, 7) },
  { key: "photos", title: "AI Photos", icon: "image", color: "#27C6A4", lessonNumbers: range(8, 15) },
  { key: "videos", title: "AI Videos", icon: "videocam", color: "#D94F85", lessonNumbers: range(16, 21) },
  { key: "prompting", title: "Prompt Engineering", icon: "chatbubble-ellipses", color: "#8D6BE8", lessonNumbers: range(22, 26) },
  { key: "content", title: "Content Creation", icon: "phone-portrait", color: "#22BCA1", lessonNumbers: range(27, 31) },
  { key: "monetization", title: "Monetization", icon: "cash", color: "#E6B96B", lessonNumbers: range(32, 35) },
];

export const HOME_ROADMAP_DEFINITIONS = [
  { key: "foundation", title: "Foundation", lessonNumbers: range(1, 5) },
  { key: "character", title: "Build Your Character", lessonNumbers: range(6, 12) },
  { key: "photos", title: "Create AI Photos", lessonNumbers: range(13, 19) },
  { key: "videos", title: "Create AI Videos", lessonNumbers: range(20, 27) },
  { key: "growth", title: "Grow & Earn", lessonNumbers: range(28, 35) },
];

export const HOME_RECOMMENDED_LESSON_NUMBERS = [1, 6, 14, 20, 28, 35];

export const HOME_QUICK_LEARN_DEFINITIONS = [
  { key: "prompts", title: "Better Prompts", lessonNumber: 22 },
  { key: "consistency", title: "Same Face Every Time", lessonNumber: 6 },
  { key: "skin", title: "Real Skin Details", lessonNumber: 14 },
  { key: "reels", title: "Viral Reels Tips", lessonNumber: 28 },
];

export const HOME_PROJECT_DEFINITIONS = [
  { key: "influencer", title: "AI Influencer", icon: "person-circle", lessonNumbers: range(1, 12) },
  { key: "ugc", title: "UGC Ad", icon: "megaphone", lessonNumbers: [24, 25, 27, 29] },
  { key: "product", title: "Product Shoot", icon: "camera", lessonNumbers: [13, 14, 15, 18] },
  { key: "avatar", title: "Talking Avatar", icon: "mic", lessonNumbers: [20, 21, 23, 26] },
  { key: "brand", title: "Brand Content", icon: "color-palette", lessonNumbers: [28, 29, 31, 34, 35] },
];

export const HOME_CHALLENGE_DEFINITIONS = [
  { day: 1, title: "Choose your niche", lessonNumber: 1 },
  { day: 2, title: "Create your character", lessonNumber: 6 },
  { day: 3, title: "Master consistency", lessonNumber: 7 },
  { day: 4, title: "Create AI photos", lessonNumber: 14 },
  { day: 5, title: "Create your first video", lessonNumber: 20 },
  { day: 6, title: "Build your content profile", lessonNumber: 28 },
  { day: 7, title: "Publish and monetize", lessonNumber: 35 },
];

export const HOME_COMING_SOON = [
  { key: "ugc-masterclass", title: "AI UGC Masterclass", thumbnailKey: "ugc" },
  { key: "creator-automation", title: "AI Automation for Creators", thumbnailKey: "automation" },
];

export const HOME_INFLUENCER_CONTENT = {
  heroTagline: "Create. Grow. Monetize.",
  topicDefinitions: HOME_TOPIC_DEFINITIONS,
  roadmapDefinitions: HOME_ROADMAP_DEFINITIONS,
  recommendedLessonNumbers: HOME_RECOMMENDED_LESSON_NUMBERS,
  quickLearnDefinitions: HOME_QUICK_LEARN_DEFINITIONS,
  projectDefinitions: HOME_PROJECT_DEFINITIONS,
  challengeTitle: "Build Your First AI Influencer",
  challengeDefinitions: HOME_CHALLENGE_DEFINITIONS,
};

// Truthful presentation groups for the real 10 Days Of AI Basic course currently
// returned by the local backend. Every item resolves to that course's real lessons.
export const HOME_AI_FOUNDATIONS_CONTENT = {
  heroTagline: "Learn the foundations of artificial intelligence.",
  topicDefinitions: [
    { key: "foundations", title: "AI Foundations", icon: "bulb", color: "#4DA8FF", lessonNumbers: [1] },
    { key: "data-models", title: "Data & ML", icon: "analytics", color: "#27C6A4", lessonNumbers: [2] },
    { key: "architecture", title: "Model Architecture", icon: "git-network", color: "#D94F85", lessonNumbers: [3] },
    { key: "training", title: "Model Training", icon: "fitness", color: "#8D6BE8", lessonNumbers: [4, 5] },
    { key: "evaluation", title: "Evaluation", icon: "speedometer", color: "#22BCA1", lessonNumbers: [6, 7] },
    { key: "responsible-ai", title: "Ethics & Deployment", icon: "shield-checkmark", color: "#FF7043", lessonNumbers: [8, 9, 10] },
  ],
  roadmapDefinitions: [
    { key: "foundation", title: "AI Foundations", lessonNumbers: [1, 2] },
    { key: "architecture", title: "Models & Architecture", lessonNumbers: [3] },
    { key: "training", title: "Train AI Models", lessonNumbers: [4, 5] },
    { key: "evaluation", title: "Evaluate & Improve", lessonNumbers: [6, 7] },
    { key: "responsible", title: "Ethics & Deployment", lessonNumbers: [8, 9, 10] },
  ],
  recommendedLessonNumbers: [1, 3, 6, 8, 9, 10],
  quickLearnDefinitions: [
    { key: "what-is-ai", title: "What is AI?", lessonNumber: 1 },
    { key: "ml-models", title: "Data & ML Models", lessonNumber: 2 },
    { key: "model-improvement", title: "Improve Your Model", lessonNumber: 7 },
    { key: "responsible-ai", title: "Responsible AI", lessonNumber: 8 },
  ],
  projectDefinitions: [
    { key: "understand-ai", title: "Understand AI", icon: "bulb", lessonNumbers: [1, 2] },
    { key: "design-model", title: "Design a Model", icon: "git-network", lessonNumbers: [3] },
    { key: "train-model", title: "Train a Model", icon: "construct", lessonNumbers: [4, 5] },
    { key: "improve-model", title: "Improve a Model", icon: "trending-up", lessonNumbers: [6, 7] },
    { key: "deploy-ai", title: "Deploy Responsibly", icon: "rocket", lessonNumbers: [8, 9, 10] },
  ],
  challengeTitle: "Build Your AI Foundation",
  challengeDefinitions: [
    { day: 1, title: "Understand AI", lessonNumber: 1 },
    { day: 2, title: "Explore data and ML", lessonNumber: 2 },
    { day: 3, title: "Learn model architecture", lessonNumber: 3 },
    { day: 4, title: "Train a model", lessonNumber: 4 },
    { day: 5, title: "Evaluate performance", lessonNumber: 6 },
    { day: 6, title: "Practice responsible AI", lessonNumber: 8 },
    { day: 7, title: "Learn deployment", lessonNumber: 9 },
  ],
};

export function sortLessons(lessons = []) {
  return [...lessons].sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0));
}

export function getLessonUploadTime(lesson) {
  const dateValue = [
    lesson?.uploadedAt,
    lesson?.dateUploaded,
    lesson?.createdAt,
    lesson?.publishedAt,
    lesson?.releasedAt,
    lesson?.updatedAt,
    lesson?.lastChanged,
    lesson?.dateModified,
  ].find(Boolean);
  const dateTime = dateValue ? new Date(dateValue).getTime() : 0;
  if (Number.isFinite(dateTime) && dateTime > 0) return dateTime;

  const id = String(lesson?._id || lesson?.id || "");
  if (/^[a-f0-9]{24}$/i.test(id)) {
    return parseInt(id.slice(0, 8), 16) * 1000;
  }

  return 0;
}

export function sortLessonsByUploadTime(lessons = []) {
  return [...lessons].sort((left, right) => {
    const timeDifference = getLessonUploadTime(right) - getLessonUploadTime(left);
    if (timeDifference) return timeDifference;
    return Number(right?.order || 0) - Number(left?.order || 0);
  });
}

export function resolveLessonNumbers(orderedLessons, lessonNumbers) {
  if (!Array.isArray(orderedLessons) || !Array.isArray(lessonNumbers)) return [];
  return lessonNumbers.map(number => orderedLessons[number - 1]).filter(Boolean);
}

// Uploaded lesson topics are the source of truth. Positional definitions are used
// only for older courses saved before the admin uploader supported a topic field.
export function buildLessonTopics(orderedLessons = [], fallbackDefinitions = []) {
  if (!Array.isArray(orderedLessons) || !orderedLessons.length) return [];

  const groups = [];
  const groupIndex = new Map();
  const ungrouped = [];

  orderedLessons.forEach((lesson) => {
    const uploadedTopic = [lesson?.topic, lesson?.module, lesson?.section]
      .find(value => typeof value === "string" && value.trim());
    if (!uploadedTopic) {
      ungrouped.push(lesson);
      return;
    }

    const title = uploadedTopic.trim();
    const normalizedKey = topicKey(title);
    let index = groupIndex.get(normalizedKey);
    if (index === undefined) {
      index = groups.length;
      groupIndex.set(normalizedKey, index);
      groups.push({ key: normalizedKey, title, lessons: [] });
    }
    groups[index].lessons.push(lesson);
  });

  if (!groups.length && Array.isArray(fallbackDefinitions) && fallbackDefinitions.length) {
    return fallbackDefinitions
      .map(definition => ({
        ...definition,
        lessons: resolveLessonNumbers(orderedLessons, definition.lessonNumbers),
      }))
      .filter(topic => topic.lessons.length > 0);
  }

  if (!groups.length) {
    groups.push({ key: "course-lessons", title: "Course Lessons", lessons: orderedLessons });
  } else if (ungrouped.length) {
    groups.push({ key: "more-lessons", title: "More Lessons", lessons: ungrouped });
  }

  return groups.map((group, index) => ({
    ...topicPresentation(group.title, index),
    ...group,
  }));
}
