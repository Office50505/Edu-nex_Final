// Quoting alone does not prevent spreadsheet formula execution.
export function csvEscape(value) {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text;
  return `"${safe.replace(/"/g, '\"\"')}"`;
}
