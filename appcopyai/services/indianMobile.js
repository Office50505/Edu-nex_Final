// Normalize a complete Indian country-code prefix without truncating a number.
// A local ten-digit number beginning with 91 must keep those first two digits.
function normalizeIndianMobileInput(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

module.exports = { normalizeIndianMobileInput };
