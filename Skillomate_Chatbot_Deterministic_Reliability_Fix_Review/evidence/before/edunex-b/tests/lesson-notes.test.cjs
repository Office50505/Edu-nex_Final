const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { MAX_LESSON_NOTES_LENGTH, normalizeLessonNotes } = require('../services/lessonNotes');

test('lesson notes are normalized and bounded', () => {
  assert.equal(normalizeLessonNotes('  first\r\nsecond  '), 'first\nsecond');
  assert.equal(normalizeLessonNotes(null), '');
  assert.equal(normalizeLessonNotes('x'.repeat(MAX_LESSON_NOTES_LENGTH)).length, MAX_LESSON_NOTES_LENGTH);
  assert.throws(() => normalizeLessonNotes('x'.repeat(MAX_LESSON_NOTES_LENGTH + 1)), /cannot exceed 20,000 characters/);
});

test('admin lesson notes route is protected and uses an atomic positional update', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(source, /app\.patch\('\/api\/admin\/courses\/:courseId\/videos\/:videoId\/notes', protectAdmin/);
  assert.match(source, /'videos\.\$\.notes': notes/);
  assert.match(source, /clearPublicCourseCaches\(\)/);
});

test('mobile course projection includes saved per-lesson notes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'mobileCompatibilityService.js'), 'utf8');
  assert.match(source, /LIGHT_COURSE_FIELDS = .*videos\.notes/);
});
