const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = fs.readFileSync(path.join(__dirname, '../routes/problemReports.js'), 'utf8');
const modelSource = fs.readFileSync(path.join(__dirname, '../models/ProblemReport.js'), 'utf8');

test('problem reports have separate learner and admin endpoints', () => {
  assert.match(routeSource, /router\.post\('\/problem-reports', optionalUser/);
  assert.match(routeSource, /router\.get\('\/admin\/problem-reports', protectAdmin/);
  assert.match(routeSource, /router\.patch\('\/admin\/problem-reports\/:id', protectAdmin/);
});

test('report storage excludes secret fields and limits user-controlled text', () => {
  assert.match(modelSource, /maxlength: 3000/);
  assert.match(modelSource, /enum: \['new', 'in_progress', 'resolved', 'closed'\]/);
  assert.doesNotMatch(modelSource, /password|cardNumber|cvv|accessToken|refreshToken/i);
});

test('generated references are stable and human readable', () => {
  assert.match(routeSource, /RPT-\$\{date\}-\$\{String\(report\._id\)\.slice\(-8\)\.toUpperCase\(\)\}/);
});
