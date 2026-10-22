const path = require('node:path');
const { spawn } = require('node:child_process');

const MAX_EXTRACTED_TEXT = 20000;
let extractionQueue = Promise.resolve();

function normalizeExtractedText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function runPdfTextExtraction(buffer, timeoutMs) {
  return new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, [path.join(__dirname, 'pdfTextWorker.js')], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    let diagnostic = '';
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      worker.kill();
      finish(reject, Object.assign(new Error('PDF text extraction timed out.'), { statusCode: 408 }));
    }, timeoutMs);
    worker.stdout.setEncoding('utf8');
    worker.stderr.setEncoding('utf8');
    worker.stdout.on('data', chunk => { output += chunk; });
    worker.stderr.on('data', chunk => { diagnostic += chunk; });
    worker.on('error', error => finish(reject, Object.assign(new Error('Could not start PDF text extraction.'), { statusCode: 500, cause: error })));
    worker.on('close', code => {
      try {
        const result = JSON.parse(output || '{}');
        if (code !== 0 || result.error) {
          const message = result.error || 'Could not extract text from this PDF.';
          return finish(reject, Object.assign(new Error(message), { statusCode: result.statusCode || 422, cause: diagnostic || undefined }));
        }
        finish(resolve, result);
      } catch (error) {
        finish(reject, Object.assign(new Error('Could not extract text from this PDF.'), { statusCode: 422, cause: diagnostic || error }));
      }
    });
    worker.stdin.end(buffer);
  });
}

function extractPdfText(buffer, { timeoutMs = 15000 } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5 || buffer.subarray(0, 5).toString() !== '%PDF-') {
    return Promise.reject(Object.assign(new Error('Choose a valid PDF file.'), { statusCode: 400 }));
  }

  // pdf-parse/pdf.js keeps process-level state and can fail when two documents
  // are parsed simultaneously. Queue the small admin uploads to keep extraction
  // deterministic while still allowing the rest of the API to serve requests.
  const task = extractionQueue.then(() => runPdfTextExtraction(buffer, timeoutMs));
  extractionQueue = task.catch(() => undefined);
  return task;
}

module.exports = { MAX_EXTRACTED_TEXT, extractPdfText, normalizeExtractedText };
