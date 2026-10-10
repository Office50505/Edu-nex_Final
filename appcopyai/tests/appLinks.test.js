const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSkillomateVideoUrl, parseSkillomateAppLink } = require('../services/appLinks');

test('builds a shareable HTTPS lesson link with course and video identifiers', () => {
  assert.equal(
    buildSkillomateVideoUrl('https://skillomate.in', { courseId: 'course 1', videoId: 'lesson/2' }),
    'https://skillomate.in/videos?courseId=course+1&videoId=lesson%2F2',
  );
});

test('parses current and legacy Skillomate video links', () => {
  assert.deepEqual(parseSkillomateAppLink('https://skillomate.in/videos?courseId=course-1&videoId=lesson-2'), {
    type: 'video', courseId: 'course-1', videoId: 'lesson-2',
  });
  assert.deepEqual(parseSkillomateAppLink('https://www.skillomate.in/videos/?courseId=course-1&video=lesson-2'), {
    type: 'video', courseId: 'course-1', videoId: 'lesson-2',
  });
  assert.deepEqual(parseSkillomateAppLink('https://skillomate.in/videos?courseId=course-1'), {
    type: 'video', courseId: 'course-1', videoId: null,
  });
});

test('rejects untrusted, insecure, unrelated and incomplete links', () => {
  for (const value of [
    'http://skillomate.in/videos?courseId=course-1',
    'https://skillomate.in.evil.example/videos?courseId=course-1',
    'https://skillomate.in/pricing?courseId=course-1',
    'https://skillomate.in/videos',
    'not-a-url',
  ]) assert.equal(parseSkillomateAppLink(value), null, value);
});
