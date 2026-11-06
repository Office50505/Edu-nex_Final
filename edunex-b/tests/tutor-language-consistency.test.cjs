const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../services/aiTutorService'), 'utf8');
const languageFunctions = source.slice(source.indexOf('function latestMessageLanguage('), source.indexOf('function maskEmail('));
const c = vm.createContext({}); vm.runInContext(languageFunctions, c);
const { packLanguage } = require('../services/courseKnowledgePacks');

test('English pronouns, video lag and LG do not switch English questions to Hinglish', () => {
  for (const message of ['Help me choose a course', 'Explain prompt engineering to me', 'What does this prompt do?',
    'How do I fix video lag?', 'Can I use an LG phone?', 'Summarize this lesson for me', 'What would this prompt do?', 'Can this fix do that?']) {
    assert.equal(c.responseLanguage(message), 'english', message);
  }
});

test('real Hinglish and Hindi questions retain their language', () => {
  for (const message of ['Mujhe course choose karne mein help karo', 'Ye prompt kaise use karu?', 'Face fix do', 'prompt do', 'video me face change']) {
    assert.equal(c.responseLanguage(message), 'hinglish', message);
  }
  assert.equal(c.responseLanguage('इस पाठ को समझाइए।'), 'hindi');
});

test('explicit language requests override the question language, including common Roman spellings', () => {
  for (const [message, expected] of [['Ye lesson English me samjhao', 'english'], ['Explain this Hindi me', 'hindi'],
    ['Explain this in Roman Hindi', 'hinglish'], ['यह पाठ explain in English', 'english']]) {
    assert.equal(c.responseLanguage(message), expected, message);
  }
});

test('English course questions override Hinglish source defaults and an earlier Hinglish conversation', () => {
  for (const message of ['Explain Lesson 01', 'Help me understand this lesson', 'What does this prompt do?']) {
    assert.equal(packLanguage(message, undefined, 'hinglish'), 'english');
    assert.equal(packLanguage(message, 'hinglish', 'hinglish'), 'english');
  }
});

test('course conversations recognize Hinglish and preserve the language for short follow-ups', () => {
  assert.equal(packLanguage('Ye lesson samjhao', 'english'), 'hinglish');
  assert.equal(packLanguage('prompt do', 'english'), 'hinglish');
  assert.equal(packLanguage('इसे समझाइए', 'english'), 'hindi');
  assert.equal(packLanguage('again', 'hindi'), 'hindi');
  assert.equal(packLanguage('shorter', 'hinglish'), 'hinglish');
  assert.equal(packLanguage('Explain Lesson 01 in Marathi'), 'marathi');
});
