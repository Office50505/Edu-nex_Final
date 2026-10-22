const test = require('node:test');
const assert = require('node:assert/strict');
const { backend } = require('./ai-tutor-fixture.cjs');
const course = { _id: '6d0000000000000000000000', slug: 'ai-product-photoshoot-ads', title: 'AI Product Photoshoot & Ads', status: 'published', videos: [] };
const user = { _id: '6a0000000000000000000001', courseEntitlements: [{ course: course._id, accessType: 'permanent' }] };
for (const [message, pattern] of [
  ['My product is a cotton cord basket. Its shape keeps changing between product photos. How should I check it? Answer in English.', /shape, colour, details, text and logo/],
  ['Mera product cotton cord basket hai. Product photos mein iska shape baar baar badal raha hai. Hinglish mein batao kaise check karun.', /shape, colour, details, text aur logo/],
  ['मेरे प्रोडक्ट की तस्वीरों में आकार बदल रहा है। हिंदी में बताइए कैसे जाँच करूँ।', /आकार, रंग, विवरण, टेक्स्ट और लोगो/],
]) test(`consistency troubleshooting gives concrete reference checks: ${message}`, async () => {
  const api = backend({ courses: [course], user });
  const response = await api.chat({ courseId: course._id, message });
  assert.match(response.answer, pattern);
  assert.equal(api.calls.length, 0);
});

test('expired explicit grant overrides a legacy purchase for protected template access', async () => {
  const expired = { ...user, purchasedCourses: [course._id], courseEntitlements: [{ course: course._id, accessType: 'yearly', expiresAt: new Date(Date.now() - 86400000) }] };
  const api = backend({ courses: [course], user: expired, reply: 'Active course access is required.' });
  const response = await api.chat({ courseId: course._id, message: 'Give the complete approved L02 White Studio.', debugAi: true });
  assert.equal(response.knowledge, 'course-overviews');
  assert.doesNotMatch(response.answer, /Use the uploaded product sheet as the reference/);
  assert.ok(api.calls.every(call => !JSON.stringify(call).includes('Use the uploaded product sheet as the reference')));
});

test('a Product Sheet purpose question explains reuse and consistency', async () => {
  const api = backend({ courses: [course], user });
  const response = await api.chat({ courseId: course._id, message: 'My product is called “नीर पात्र”. Explain the purpose of the Product Sheet in English.' });
  assert.match(response.answer, /reference image/i);
  assert.match(response.answer, /photo or video/i);
  assert.match(response.answer, /identity consistent/i);
  assert.equal(api.calls.length, 0);
});
