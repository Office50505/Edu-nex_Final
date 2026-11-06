// Interpret learner workflow questions, never assistant prose or safety decisions.
const { checkAiInput } = require('./aiCompliance');
const SLUGS = new Set(['ai-filmmaking-course', 'ai-filmmaking', 'ai_filmmaking']);

function lessonNumber(text) {
  const match = String(text || '').match(/\b(?:lesson|lecture|lacture|leacture|lec|l)\s*0?(\d{1,2})\b|\b0?(\d{1,2})\s*(?:lesson|lecture|lacture|leacture|lec)\b/i);
  return match ? Number(match[1] || match[2]) : null;
}

function workflowParts(value) {
  const text = String(value || '').toLowerCase();
  const video = /\b(?:flow|veo|video|clip|clips|shot|shots|scene|scenes)\b/.test(text);
  return {
    reference: /\b(?:image|images|photo|reference|character\s*sheet)\b/.test(text)
      && /\b(?:chat\s*g\.?\s*p\.?\s*t|chatgpt|pehle|pahle|first|before|mangu|mang[uoa]|banau|banao|banwa|prepare|generate|attach|chahiye)\b/.test(text),
    duration: video && /\b\d+\s*(?:sec(?:ond)?s?|s)\b|\b(?:duration|length|longer|lamba|lambi|shorter)\b/.test(text),
    splitting: video && /\b(?:split|splitting|parts?|pieces|chunks?|tukd[aeo]n?|tod|divide|chhote|chote|break\s*(?:it\s*)?(?:up|down|into))\b/.test(text),
    continuity: video && /\b(?:connect|connecting|jod|jodu|jode|jodna|jodein|continuity|continue|continuation|seamless|last\s*frame|start\s*frame)\b/.test(text),
  };
}

function isClarification(text) {
  return /^(?:nahi\b|nahin\b|no\b|haan\b|yes\b)|\b(?:mera\s+matlab|i\s+mean|original\s+question|same\s+question|pehle\s+wala\s+sawal|dono|both|samjhao|clarif\w*)\b/i.test(text)
    || /^(?:ai\s*film(?:making|\s*making)?|(?:lesson|lecture|lacture)\s*\d+)[.!\s]*$/i.test(text);
}

function filmmakingWorkflowRequest(message, history = [], activeCourse = null) {
  if (!SLUGS.has(activeCourse?.slug)) return null;
  const current = String(message || '');
  // Keep exact-template requests and actual safety questions on their existing routes.
  if (!checkAiInput(current).ok || /\b(?:safety|safe|safer|unsafe|rewrite|reframe|compliant|violation|violations|blocked|rejected|policy|filter|filters|bypass|explicit|nude|sexual)\b/i.test(current)
    || /\b(?:exact|approved|copy[-\s]*paste|full\s+template)\b/i.test(current)) return null;
  const parts = workflowParts(current);
  let originalQuestion = '';
  const currentLesson = lessonNumber(current);
  const topicChange = /\b(?:ab|now|instead|new\s+topic)\b/i.test(current)
    || (currentLesson && ![5, 6].includes(currentLesson));
  if (isClarification(current) && !topicChange) {
    const users = history.filter(item => item?.role === 'user').slice(-6).reverse();
    for (const item of users) {
      // A clarification must not rehabilitate an earlier unsafe request.
      if (!checkAiInput(item.content).ok) break;
      const prior = workflowParts(item.content);
      if (Object.values(prior).some(Boolean)) {
        originalQuestion = item.content;
        for (const key of Object.keys(parts)) parts[key] ||= prior[key];
        if (!isClarification(item.content)) break;
        continue;
      }
      // Stop at a topic change rather than searching an entire conversation.
      if (!isClarification(item.content)) break;
    }
  }
  if (!Object.values(parts).some(Boolean)) return null;
  return { ...parts, lessonNumber: lessonNumber(current) || lessonNumber(originalQuestion), originalQuestion,
    retrievalQuery: [originalQuestion, current, 'Lesson 6 generate first shot connect shots',
      parts.reference ? 'Lesson 5 character sheet prompt ChatGPT Flow reference' : '',
      parts.duration || parts.splitting ? 'one simple action per clip shorter shot prompts' : '',
      'last frame Start End Ingredients character sheet'].filter(Boolean).join('\n') };
}

function filmmakingWorkflowReply({ message, knowledge, language }) {
  const request = knowledge?.filmmakingWorkflow;
  if (!request || !knowledge.materialsAvailable || !SLUGS.has(knowledge.activeCourse?.slug)) return '';
  // Devanagari explanations remain on the existing language-aware generation path.
  if (language === 'hindi' || /[\u0900-\u097F]/u.test(message)) return '';
  // Only answer from actually retrieved, authorized source records. Fail back to
  // generation if the required course evidence is missing or changes.
  const records = (knowledge.records || []).filter(record => record.kind === 'course-material'
    && record.courseId === knowledge.activeCourse.id && record.sourceDocument === 'training.txt');
  const lesson = number => records.filter(record => record.lessonNumber === number).map(record => record.content).join('\n');
  const firstShot = lesson(6);
  if (!/Reference-to-video/.test(firstShot) || !/last frame.*Start/i.test(firstShot)) return '';
  if (request.reference && !/character sheet.*prompt|CHARACTER SHEET PROMPT/i.test(lesson(5))) return '';
  if ((request.duration || request.splitting) && !records.some(record => /ONE simple action per clip/i.test(record.content))) return '';
  const english = language ? language === 'english'
    : !/\b(?:me|mein|se|aur|ko|bolu|kya|kaise|pahle|pehle|ma?angu|hota|nahi|matlab|tukdo|karu|banao|hai|chahiye|samjhao|haan|dono)\b/i.test(message);
  const lines = [];
  if (request.reference) lines.push(english
    ? 'First ask ChatGPT for the character reference sheet prompt and the shot prompts (Lesson 5). Generate the character sheet in Flow and lock the best reference. You do not need a new ChatGPT image for every clip. In Lesson 6, attach that locked reference in Flow’s Reference-to-video mode, paste the first shot prompt, and generate.'
    : 'Pehle ChatGPT se character reference sheet ka prompt aur shot prompts lo (Lesson 5). Character sheet ki image Flow me generate karke best reference lock karo; har clip ke liye ChatGPT se nayi image lena zaroori nahi. Lecture 6 me Flow ke Reference-to-video mode me wahi locked reference attach karo, Shot 1 ka prompt paste karo aur generate karo.');
  if (request.duration || request.splitting) lines.push(english
    ? 'Yes—ask ChatGPT to divide the action into shorter, connected shot prompts that fit the duration available in your Flow interface. Generate each part separately; keep one simple action per clip and repeat the same character and location. This is a practical adaptation of the course’s per-shot workflow, not a promise that Flow will generate a particular duration in one clip.'
    : 'Haan—ChatGPT ko bolo ki action ko chhote, connected shot prompts me baante, har part tumhare Flow me available clip duration ke andar ho. Har part alag generate karo; ek clip me ek simple action aur same character + location rakho. Ye course ke per-shot workflow ka practical use hai; lamba video ek hi generation me force karna zaroori nahi.');
  // Splitting needs a connection step even when continuity was not named.
  if (request.continuity || request.duration || request.splitting) lines.push(english
    ? 'To connect the clips (Lesson 6), save the best clip’s last frame, select Start/End for the next generation, use that image as the Start frame, and paste the next shot prompt. If the face is unclear, use Ingredients with both the saved frame and the character sheet to preserve the face. Keep the same outfit and location across parts.'
    : 'Clips connect karne ke liye (Lecture 6), best clip ka last frame save karo. Next generation me Start/End select karke us image ko Start frame banao aur agla shot prompt paste karo. Chehra clear na ho to Ingredients me saved last frame + character sheet dono attach karo. Parts me same face, outfit aur location rakho.');
  return lines.join('\n\n');
}

module.exports = { filmmakingWorkflowRequest, filmmakingWorkflowReply, filmmakingLessonNumber: lessonNumber };
