/**
 * Convert plain text or HTML to TipTap-compatible HTML paragraphs.
 *
 * - Plain text: normalizes \r\n, wraps each line in <p>.
 *   Empty lines become <p></p> (NOT <p><br></p> which TipTap
 *   interprets as a hardBreak, doubling the blank line height).
 * - HTML: passes through, but fixes legacy <p><br></p> patterns.
 */
export function toEditorHtml(text: string): string {
  if (!text) return "";
  // Already HTML (contains common tags)
  if (
    /<(p|div|br|span|h[1-6]|ul|ol|li|strong|em|a|blockquote)\b/i.test(text)
  ) {
    // Fix legacy: <p> containing only <br> was parsed as hardBreak by TipTap,
    // rendering 2 lines instead of 1. Convert to empty <p> so TipTap treats
    // it as a proper empty paragraph.
    return text.replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, "<p></p>");
  }
  // Plain text — normalize line endings, wrap each line in <p>.
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => `<p>${line}</p>`)
    .join("");
}
