// Adapt the old QA duration text only inside this isolated launcher.
// Production availability handling and classification stay unchanged.
function qaUnavailable(original, status, message = '') {
  const result = original(status, message);
  return status === 'manual_qa_expired'
    ? { ...result, error: result.error.replace(/60-minute/gu, '30-minute').replace(/60 मिनट/gu, '30 मिनट') }
    : result;
}
module.exports = { qaUnavailable };
