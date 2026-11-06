const pdfParse = require('pdf-parse');

const MAX_EXTRACTED_TEXT = 20000;
const chunks = [];

process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', async () => {
  try {
    const result = await pdfParse(Buffer.concat(chunks));
    const fullText = String(result?.text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!fullText) {
      process.stdout.write(JSON.stringify({ error: 'No selectable text was found. This PDF appears to contain scanned images and needs OCR.', statusCode: 422 }));
      process.exitCode = 1;
      return;
    }
    const text = fullText.slice(0, MAX_EXTRACTED_TEXT).trim();
    process.stdout.write(JSON.stringify({
      text,
      truncated: fullText.length > text.length,
      characterCount: text.length,
      pageCount: Number(result?.numpages || 0),
    }));
  } catch (error) {
    process.stderr.write(String(error?.stack || error));
    process.stdout.write(JSON.stringify({ error: 'Could not extract text from this PDF.', statusCode: 422 }));
    process.exitCode = 1;
  }
});
