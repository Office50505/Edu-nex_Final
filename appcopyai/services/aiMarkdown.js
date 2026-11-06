// A small text-only Markdown subset. Never interpret model output as HTML.
function inlineMarkdown(text, inherited = {}) {
  const runs = [];
  const pattern = /\\([\\`*_#>\-])|`([^`\n]+)`|(\*\*\*|___|\*\*|__)(?=\S)(.+?)\3(?![*_])|(\*|_)(?=\S)([^\n]+?)\5|\[([^\]\n]+)\]\([^\s)]+\)/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset) runs.push({ text: text.slice(offset, match.index), ...inherited });
    const marker = match[3] || match[5];
    // Underscores inside names such as user_id are ordinary text.
    const inWord = marker?.includes('_') && (
      /[\w]/.test(text[match.index - 1] || '')
      || /[\w]/.test(text[match.index + match[0].length] || '')
    );
    if (inWord) runs.push({ text: match[0], ...inherited });
    else if (match[1]) runs.push({ text: match[1], ...inherited });
    else if (match[2]) runs.push({ text: match[2], ...inherited, code: true });
    else if (match[3]) runs.push(...inlineMarkdown(match[4], {
      ...inherited, bold: true, ...(match[3].length === 3 ? { italic: true } : {}),
    }));
    else if (match[5]) runs.push(...inlineMarkdown(match[6], { ...inherited, italic: true }));
    else runs.push(...inlineMarkdown(match[7], inherited));
    offset = match.index + match[0].length;
  }
  if (offset < text.length) runs.push({ text: text.slice(offset), ...inherited });
  return runs;
}

function parseAiMarkdown(content) {
  const lines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n');
  const result = [];
  let fence = null;
  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch && !fence) {
      fence = fenceMatch[1];
      continue;
    }
    if (fence && fenceMatch && fenceMatch[1][0] === fence[0]
      && fenceMatch[1].length >= fence.length && !fenceMatch[2].trim()) {
      fence = null;
      continue;
    }
    if (fence) {
      result.push({ code: true, runs: [{ text: line, code: true }] });
      continue;
    }
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/);
    const quote = line.match(/^\s{0,3}>\s?(.*)$/);
    const body = heading ? heading[1] : quote ? quote[1] : line;
    const bullet = body.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = body.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const prefix = bullet ? '• ' : numbered ? `${numbered[1]}. ` : '';
    const text = bullet ? bullet[1] : numbered ? numbered[2] : body;
    result.push({ heading: Boolean(heading), runs: [
      ...(prefix ? [{ text: prefix }] : []),
      ...inlineMarkdown(text, heading ? { bold: true } : {}),
    ] });
  }
  return result;
}

module.exports = { parseAiMarkdown };
