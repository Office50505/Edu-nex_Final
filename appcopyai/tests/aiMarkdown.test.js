const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAiMarkdown } = require('../services/aiMarkdown');

const plain = lines => lines.map(line => line.runs.map(run => run.text).join('')).join('\n');

test('the observed AI response renders bold labels and italic examples without delimiters', () => {
  const result = parseAiMarkdown('1. **Who**: Define the subject.\n    *   *Example: a young Indian woman*\n\n**Why it matters:** Be specific.');
  assert.equal(plain(result), '1. Who: Define the subject.\n• Example: a young Indian woman\n\nWhy it matters: Be specific.');
  assert.ok(result[0].runs.some(run => run.text === 'Who' && run.bold));
  assert.ok(result[1].runs.some(run => run.text.startsWith('Example:') && run.italic));
});

test('underscore emphasis and nested emphasis retain their styles', () => {
  const result = parseAiMarkdown('__Bold__ and _italic_ and ***both*** and **bold with *emphasis***');
  assert.equal(plain(result), 'Bold and italic and both and bold with emphasis');
  const runs = result[0].runs;
  assert.ok(runs.some(run => run.text === 'Bold' && run.bold));
  assert.ok(runs.some(run => run.text === 'italic' && run.italic));
  assert.ok(runs.some(run => run.text === 'both' && run.bold && run.italic));
});

test('headings, quotes and ordered or unordered lists remain readable', () => {
  const result = parseAiMarkdown('## Study plan\r\n> Try these:\r\n- First\r\n2) Second');
  assert.equal(plain(result), 'Study plan\nTry these:\n• First\n2. Second');
  assert.ok(result[0].runs.every(run => run.bold));
});

test('code fences preserve literal syntax, indentation and identifiers', () => {
  const result = parseAiMarkdown('```python\n  user_id = "**literal**"\n# code heading\n```\nDone');
  assert.equal(plain(result), '  user_id = "**literal**"\n# code heading\nDone');
  assert.equal(result[0].runs[0].code, true);
  assert.equal(result[1].runs[0].code, true);
  assert.equal(result[2].code, undefined);
});

test('inline code and escaped Markdown remain literal', () => {
  const result = parseAiMarkdown('Use `user_id` and `**literal**`; \\*literal\\*; project_file_name and user__id__value.');
  assert.equal(plain(result), 'Use user_id and **literal**; *literal*; project_file_name and user__id__value.');
  assert.ok(result[0].runs.some(run => run.text === '**literal**' && run.code));
});

test('link labels remain readable and unclosed code blocks remain literal', () => {
  assert.equal(plain(parseAiMarkdown('[Course notes](https://example.com/notes)')), 'Course notes');
  assert.equal(plain(parseAiMarkdown('~~~js\nconst value = "*example*";')), 'const value = "*example*";');
});

test('empty input, Unicode and literal multiplication are preserved', () => {
  assert.equal(plain(parseAiMarkdown(null)), '');
  const input = 'सीखें AI 🤖\n2 * 3 = 6\nAn unfinished **word';
  assert.equal(plain(parseAiMarkdown(input)), input);
});
