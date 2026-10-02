const test = require('node:test');
const assert = require('node:assert/strict');
const { retrieveKnowledge, hasLessonAccess } = require('../services/tutorKnowledge');
const { aiFilmmakingDirectReply } = require('../services/aiTutorService');
const course = { _id: '6a9e67c46bcb631b8118d341', slug: 'ai-influencer-course', title: 'AI Influencer Course', description: 'Create consistent AI characters and videos.', videos: [{ title: 'Prompting', description: 'Write clear prompts.', examplePrompt: 'PAID_EXAMPLE_SENTINEL' }] };
const filmmakingCourse = { _id: '6abe5bb2bced21d7211be185', slug: 'ai-filmmaking-course', title: 'AI Filmmaking Course', description: 'Create AI short films with story, shots, voice, and editing.', videos: [{ title: 'Tools Setup', description: 'Set up Google Flow, ChatGPT, ElevenLabs, and CapCut.' }] };
const otherCourse = { _id: '6c0000000000000000000000', slug: 'other-course', title: 'Other Course', description: 'CROSS_COURSE_SENTINEL teaches unrelated material.', videos: [{ title: 'Other Lesson', description: 'CROSS_COURSE_LESSON_SENTINEL' }] };
const retrieve = (message, options = {}) => retrieveKnowledge({ courses: [course], message, includeMaterials: true, ...options });
const retrieveFilmmaking = (message, options = {}) => retrieveKnowledge({ courses: [filmmakingCourse], message, includeMaterials: true, ...options });

for (const [question, expected] of [
  ['My character face changes between clips. How do I keep the same identity?', /same face|locked|reference/i],
  ['Mera chehra har video mein badal jaata hai', /face|reference|still/i],
  ['My voice sounds robotic. How do I fix the audio?', /voice|ElevenLabs|recording/i],
  ['How can I make skin look realistic instead of plastic?', /pores|skin|realism/i],
]) test(`retrieves supporting course material: ${question}`, () => {
  const result = retrieve(question);
  assert.ok(result.sources.some(source => source.kind === 'course-material'));
  assert.match(result.excerpts, expected);
  assert.ok(result.sources.length <= 6);
  assert.ok(result.sources.every(source => source.url.startsWith('/course-details.html?id=')));
});

test('a short follow-up retrieves the preceding topic', () => {
  const result = retrieve('elaborate', { history: [{ role: 'user', content: 'My character face changes between clips' }, { role: 'assistant', content: 'Use one locked reference still for identity consistency.' }] });
  assert.match(result.excerpts, /face|reference/i);
  assert.ok(result.sources.length > 0);
});

test('paid documents and example prompts are not retrieved without lesson access', () => {
  const result = retrieve('Prompting face locked still', { includeMaterials: false });
  assert.ok(result.sources.every(source => source.kind !== 'course-material'));
  assert.doesNotMatch(result.excerpts, /PAID_EXAMPLE_SENTINEL/);
  assert.equal(result.materialsAvailable, false);
});

test('documents cannot be retrieved under another course or unpublished course', () => {
  assert.equal(retrieve('face', { courses: [] }).sources.length, 0);
  const result = retrieve('face', { courses: [{ ...course, slug: 'python' }] });
  assert.ok(result.sources.every(source => source.kind !== 'course-material'));
});

test('active course retrieval does not mix another course unless comparison is explicit', () => {
  const scoped = retrieveKnowledge({
    courses: [course, otherCourse],
    message: 'CROSS_COURSE_SENTINEL',
    includeMaterials: true,
    activeCourse: course,
  });
  assert.equal(scoped.courseScoped, true);
  assert.doesNotMatch(scoped.excerpts, /CROSS_COURSE_SENTINEL|CROSS_COURSE_LESSON_SENTINEL/);
  assert.ok(scoped.sources.every(source => source.courseId === String(course._id)));

  const comparison = retrieveKnowledge({
    courses: [course, otherCourse],
    message: 'Compare this course with CROSS_COURSE_SENTINEL',
    includeMaterials: true,
    activeCourse: course,
  });
  assert.equal(comparison.courseScoped, false);
  assert.match(comparison.excerpts, /CROSS_COURSE_SENTINEL/);
});

test('retrieves AI Filmmaking material only for the filmmaking course slug', () => {
  const result = retrieveFilmmaking('Which tools are taught in the AI filmmaking course? Should I use Seedance or MiniMax?');
  assert.ok(result.sources.some(source => source.kind === 'course-material'));
  assert.match(result.excerpts, /Google Flow|ElevenLabs|CapCut/i);
  assert.match(result.excerpts, /Seedance|MiniMax/i);
  assert.equal(result.materialsAvailable, true);

  const wrongCourse = retrieveKnowledge({
    courses: [{ ...filmmakingCourse, slug: 'python' }],
    message: 'Which tools are taught in the AI filmmaking course?',
    includeMaterials: true,
  });
  assert.doesNotMatch(wrongCourse.excerpts, /AI Filmmaking — Chatbot Training Knowledge Base|Tools taught in THIS course/i);
});

test('AI Filmmaking direct replies preserve approved prompts and map-only lesson guardrails', () => {
  const knowledge = { courseSlugs: ['ai-filmmaking-course'] };

  const prompt = aiFilmmakingDirectReply({ message: 'Presenter 9:16 studio prompt do', courseId: 'ai-filmmaking-course', knowledge });
  assert.match(prompt, /Reference-to-video/);
  assert.match(prompt, /same face, same outfit/);
  assert.match(prompt, /9:16 vertical/);
  assert.match(prompt, /NO background music, NO soundtrack/);
  assert.match(prompt, /She says: "\[LINE\]"/);

  const deskPrompt = aiFilmmakingDirectReply({ message: '16:9 practical presenter ka full approved prompt chahiye, short version nahi', courseId: 'ai-filmmaking-course', knowledge });
  assert.match(deskPrompt, /Reference-to-video/);
  assert.match(deskPrompt, /Steady 16:9/);
  assert.match(deskPrompt, /clean white studio desk/);
  assert.match(deskPrompt, /silver laptop/);
  assert.match(deskPrompt, /FAST continuous natural Hindi lip-sync/);
  assert.match(deskPrompt, /NO background music, NO soundtrack/);
  assert.match(deskPrompt, /She says: "\[LINE\]"/);
  assert.doesNotMatch(deskPrompt, /wide horizontal composition/i);

  const faceLine = aiFilmmakingDirectReply({ message: 'last frame aur character sheet dono use karne wala exact line do', courseId: 'ai-filmmaking-course', knowledge });
  assert.match(faceLine, /USE THIS IMAGE \[saved last frame\] AS THE FIRST FRAME/);
  assert.match(faceLine, /CHARACTER SHEET \[character reference sheet\]/);
  assert.match(faceLine, /\[character description\]\. \[location\]\. \[shot action\]\./);
  assert.match(faceLine, /Realistic, cinematic, 9:16, no on-screen text, no watermark, NO background music\./);
  assert.doesNotMatch(faceLine, /Last frame ke do course uses/i);

  const morph = aiFilmmakingDirectReply({ message: 'Video morph aur warp ho raha hai', courseId: 'ai-filmmaking-course', knowledge });
  assert.match(morph, /one simple action/i);
  assert.match(morph, /no morphing, no warping, no flicker, no artifacts, no distortion, no extra limbs/i);

  const faceConsistency = aiFilmmakingDirectReply({
    message: 'face keeps changing every clip what should i do',
    courseId: 'ai-filmmaking-course',
    knowledge: { activeCourse: { slug: 'ai-filmmaking-course', title: 'AI Filmmaking Course' }, courseSlugs: ['ai-filmmaking-course', 'ai-influencer-course'] },
  });
  assert.match(faceConsistency, /character reference sheet/i);
  assert.match(faceConsistency, /same face, same outfit/i);
  assert.match(faceConsistency, /saved last frame as the next Start frame/i);
  assert.match(faceConsistency, /Ingredients mode/i);
  assert.match(faceConsistency, /USE THIS IMAGE \[saved last frame\] AS THE FIRST FRAME/);
  assert.doesNotMatch(faceConsistency, /AI Influencer|Original Reference Photo|newly generated image/i);

  const unscopedFaceConsistency = aiFilmmakingDirectReply({
    message: 'face keeps changing every clip what should i do',
    courseId: '',
    knowledge: { courseSlugs: ['ai-filmmaking-course', 'ai-influencer-course'] },
  });
  assert.equal(unscopedFaceConsistency, '');

  const englishMorph = aiFilmmakingDirectReply({ message: 'My video is morphing and warping. How do I fix it?', courseId: 'ai-filmmaking-course', knowledge });
  assert.match(englishMorph, /Primary fix for morphing\/warping/i);
  assert.match(englishMorph, /keep one simple action/i);
  assert.doesNotMatch(englishMorph, /\bka\b|\bkaro\b|\bhai\b/i);

  const motionText = aiFilmmakingDirectReply({ message: 'Motion graphics me text glitch ho raha hai', courseId: 'ai-filmmaking-course', knowledge });
  assert.match(motionText, /icons-only/i);
  assert.match(motionText, /liquid-glass|glassmorphism/i);
  assert.match(motionText, /CapCut/i);
  assert.doesNotMatch(motionText, /correct anatomy|same face/i);

  const music = aiFilmmakingDirectReply({ message: 'Flow prompt me background music bhi generate kara do', courseId: 'ai-filmmaking-course', knowledge });
  assert.match(music, /NO background music/);
  assert.match(music, /editing/i);

  const aspect = aiFilmmakingDirectReply({ message: 'Flow me landscape banana hai but output vertical feel de raha hai', courseId: 'ai-filmmaking-course', knowledge });
  assert.match(aspect, /16:9 aspect ratio manually select/i);
  assert.match(aspect, /prompt text.*change nahi hota/i);
  assert.match(aspect, /wide horizontal composition, fills entire frame edge to edge, NO blurred side panels/i);

  const hindiVoice = aiFilmmakingDirectReply({ message: 'Hindi dialogue natural nahi lag raha, kya video muted bana sakta hu?', courseId: 'ai-filmmaking-course', knowledge });
  assert.match(hindiVoice, /muted/i);
  assert.match(hindiVoice, /ElevenLabs/i);
  assert.match(hindiVoice, /Devanagari/i);
  assert.match(hindiVoice, /Speed approx 0\.9/i);
  assert.match(hindiVoice, /add\/sync/i);

  const lesson12 = aiFilmmakingDirectReply({ message: 'Lesson 12 ke 7 B-roll rules batao', courseId: 'ai-filmmaking-course', knowledge });
  assert.match(lesson12, /Lesson 12 exists/);
  assert.match(lesson12, /B-roll & Cutaways/);
  assert.match(lesson12, /detailed.*available nahi|detailed.*not available|available nahi.*detail/i);
  assert.doesNotMatch(lesson12, /course mein total 8 lessons/i);

  const lesson15 = aiFilmmakingDirectReply({ message: 'Lesson 15 me clients se kitna charge karna sikhaya hai?', courseId: 'ai-filmmaking-course', knowledge });
  assert.match(lesson15, /Lesson 15 exists/);
  assert.match(lesson15, /Publish \+ Clients\/Paisa/);
  assert.match(lesson15, /pricing.*available nahi|pricing.*not available|available nahi.*pricing/i);
  assert.doesNotMatch(lesson15, /₹5000|₹10000|₹20000/);
});

test('AI Filmmaking direct replies resolve short follow-ups from recent history', () => {
  const knowledge = { courseSlugs: ['ai-filmmaking-course'] };
  const storyHistory = [
    { role: 'user', content: 'Story structure batao' },
    { role: 'assistant', content: 'Story structure is Hook, Build, Twist, End.' },
  ];
  const prompt = aiFilmmakingDirectReply({ message: 'iska exact prompt?', courseId: 'ai-filmmaking-course', knowledge, history: storyHistory });
  assert.match(prompt, /HOOK/);
  assert.match(prompt, /BUILD/);
  assert.match(prompt, /TWIST/);
  assert.match(prompt, /END/);

  const lesson12History = [
    { role: 'user', content: 'Lesson 12 kya hai?' },
    { role: 'assistant', content: 'Lesson 12 exists in the AI Filmmaking course map: B-roll & Cutaways. Detailed content is not available.' },
  ];
  const rules = aiFilmmakingDirectReply({ message: '7 rules batao', courseId: 'ai-filmmaking-course', knowledge, history: lesson12History });
  assert.match(rules, /Lesson 12 exists/);
  assert.match(rules, /B-roll & Cutaways/);
  assert.match(rules, /available nahi|not available/i);
  assert.match(rules, /invent nahi/i);

  const faceHistory = [
    { role: 'user', content: 'Face fix kaise karu?' },
    { role: 'assistant', content: 'Use the reference image and face-fix workflow for consistency.' },
  ];
  const lastFrame = aiFilmmakingDirectReply({ message: 'last frame bhi use karna hai', courseId: 'ai-filmmaking-course', knowledge, history: faceHistory });
  assert.match(lastFrame, /Start frame/);
  assert.match(lastFrame, /Ingredients mode/);
  assert.match(lastFrame, /saved last frame \+ character sheet/);

  const characterSheetHistory = [
    ...faceHistory,
    { role: 'user', content: 'last frame bhi use karna hai' },
    { role: 'assistant', content: lastFrame },
  ];
  const characterSheet = aiFilmmakingDirectReply({ message: 'aur character sheet bhi', courseId: 'ai-filmmaking-course', knowledge, history: characterSheetHistory });
  assert.match(characterSheet, /Ingredients mode/);
  assert.match(characterSheet, /saved last frame \+ character sheet/);
  assert.match(characterSheet, /FACE CONSISTENT/);
});

test('active and trial access expire and cancelled access is denied', () => {
  const now = Date.now();
  assert.equal(hasLessonAccess(null, now), false);
  assert.equal(hasLessonAccess({ status: 'active', currentPeriodEnd: new Date(now + 1000) }, now), true);
  assert.equal(hasLessonAccess({ status: 'trial', trialExpiresAt: new Date(now + 1000) }, now), true);
  assert.equal(hasLessonAccess({ status: 'active', currentPeriodEnd: new Date(now - 1000) }, now), false);
  assert.equal(hasLessonAccess({ status: 'cancelled', currentPeriodEnd: new Date(now + 1000) }, now), false);
});

test('vague video questions prioritize the selected lesson notes and matching course script', () => {
  const activeLesson = { _id: 'intro', title: 'Introduction', notes: 'SELECTED_NOTES: introduce the AI influencer workflow.' };
  const activeCourse = { ...course, videos: [activeLesson] };
  const result = retrieveKnowledge({ courses: [activeCourse], message: 'is video mein kya hai', includeMaterials: true, activeLesson, activeCourse });
  assert.match(result.excerpts, /SELECTED_NOTES/);
  assert.ok(result.sources.some(source => source.kind === 'course-material' && /Introduction/i.test(source.section)));
});
