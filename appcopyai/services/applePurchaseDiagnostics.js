// Never serialize a purchase or a raw native error: either may contain receipts,
// account identifiers, URLs or tokens. Only retain bounded diagnostic fields.
function safeText(value) {
  if (typeof value !== "string") return null;
  if (/token|receipt|password|signedTransaction|appAccountToken|authorization/i.test(value)) {
    return "[sensitive message omitted]";
  }
  return value.slice(0, 2048)
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\b(?:bearer\s+\S+|(?:password|token|receipt|signedTransaction|appAccountToken)\s*[=:]\s*\S+)/gi, "[credential]")
    .replace(/\b[a-z0-9_-]{8}-[a-z0-9_-]{4}-[a-z0-9_-]{4}-[a-z0-9_-]{4}-[a-z0-9_-]{12}\b/gi, "[identifier]")
    .replace(/[a-z0-9_+\/=.-]{48,}/gi, "[opaque data]")
    .replace(/\+?\d[\d ()-]{8,}\d/g, "[number]")
    .slice(0, 512);
}

function safeCode(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  return typeof value === "string" && /^[a-z0-9_.-]{1,80}$/i.test(value) ? value : null;
}

function errorFields(error, depth = 0) {
  if (!error || depth > 2) return null;
  if (typeof error === "string") {
    try { return errorFields(JSON.parse(error), depth); }
    catch { return { message: safeText(error) }; }
  }
  return {
    code: safeCode(error.code),
    domain: safeCode(error.domain),
    message: safeText(error.message || error.localizedDescription),
    debugMessage: safeText(error.debugMessage),
    underlyingError: errorFields(error.underlyingError || error.userInfo?.NSUnderlyingError, depth + 1),
  };
}

function recordApplePurchaseError(stage, error, logger = console.warn) {
  const diagnostic = {
    stage: ["purchase_listener", "purchase_request", "store_connection", "verify_or_finish", "transaction_recovery"].includes(stage) ? stage : "unknown",
    timestamp: new Date().toISOString(),
    error: errorFields(error),
  };
  try { logger("[Skillomate Apple IAP]", JSON.stringify(diagnostic)); }
  catch { /* Diagnostic output must never interrupt purchase handling. */ }
  return diagnostic;
}

module.exports = { recordApplePurchaseError };
