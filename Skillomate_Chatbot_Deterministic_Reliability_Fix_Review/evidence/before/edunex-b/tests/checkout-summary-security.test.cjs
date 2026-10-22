const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const serverFiles = [
  'edunex-b/server.js',
  'appcopyai/backend/server.js',
  'razorpay-app/backend/server.js',
];

function checkoutSummaryRoute(source) {
  const startMarker = "app.get('/api/courses/checkout-summary'";
  const endMarker = "app.get('/api/courses'";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(start, -1, 'checkout-summary route must exist');
  assert.notEqual(end, -1, 'courses route must follow checkout-summary route');
  return source.slice(start, end);
}

for (const relativeFile of serverFiles) {
  test(`${relativeFile} checkout summary never exposes lesson records`, () => {
    const source = fs.readFileSync(path.join(repositoryRoot, relativeFile), 'utf8');
    const route = checkoutSummaryRoute(source);

    assert.match(route, /videoCount:\s*\{\s*\$size:/, 'checkout needs only the lesson count');
    assert.doesNotMatch(route, /videos:\s*\{\s*\$slice:/, 'raw lesson records must stay private');
    assert.doesNotMatch(route, /videoUrl|embedUrl|bunnyVideoId|transcriptUrl|notesUrl/);
    assert.match(route, /course:v\d+:/, 'course cache key must be explicitly versioned');
    assert.match(route, /featured:v\d+/, 'featured cache key must be explicitly versioned');
  });
}
