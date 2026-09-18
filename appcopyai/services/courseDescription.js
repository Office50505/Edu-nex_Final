// Keep description display consistent with the web courseDescription utility.
export function plainCourseDescription(value) {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?$/gm, "$1")
    // Imported descriptions can flatten Markdown headings into one paragraph.
    .replace(/(^|[ \t])#{2,6}[ \t]+(?=\S)/g, "$1")
    .replace(/^ {0,3}>[ \t]?/gm, "")
    .replace(/^ {0,3}(?:[-*_][ \t]*){3,}$/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^*])\*(\S(?:[^*\n]*?\S)?)\*(?!\*)/g, "$1$2")
    .replace(/(^|[\s(])_(\S(?:[^_\n]*?\S)?)_(?=$|[\s).,!?:;])/g, "$1$2")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
