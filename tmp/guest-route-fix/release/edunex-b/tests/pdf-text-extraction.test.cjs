const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MAX_EXTRACTED_TEXT, extractPdfText, normalizeExtractedText } = require('../services/pdfTextExtraction');

test('PDF text normalization preserves paragraphs and removes layout whitespace', () => {
  assert.equal(normalizeExtractedText('  Heading  \r\n\r\n\r\nFirst line   \nSecond line  '), 'Heading\n\nFirst line\nSecond line');
  assert.equal(MAX_EXTRACTED_TEXT, 20000);
});

test('PDF extraction rejects non-PDF data before starting the extractor', async () => {
  await assert.rejects(extractPdfText(Buffer.from('not a pdf')), error => error.statusCode === 400 && /valid PDF/.test(error.message));
});

test('PDF extraction reads selectable text from a real PDF', async () => {
  const pdf = fs.readFileSync(path.join(__dirname, '..', 'AI_Chat_Training_KnowledgeBase.pdf'));
  const result = await extractPdfText(pdf);

  assert.ok(result.pageCount > 0);
  assert.ok(result.characterCount > 100);
  assert.match(result.text, /AI CHAT/i);
});
