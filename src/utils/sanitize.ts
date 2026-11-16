/**
 * Plain-text sanitization pipeline enforcing the Anti-Slop principle.
 * Strips HTML, script tags, Markdown, decorative bullets (•, ●), and normalizes em/en-dashes.
 */
export function sanitizePlainText(input: unknown): string {
  if (typeof input !== "string") return "";

  let sanitized = input;

  // 1. Strip <script> and <style> tags and their contents completely
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // 2. Strip all remaining HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, "");

  // 3. Strip Markdown formatting
  sanitized = sanitized
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2")   // italic
    .replace(/\[(.*?)\]\(.*?\)/g, "$1") // links
    .replace(/^#+\s+/gm, "")            // headings
    .replace(/^>\s+/gm, "")             // blockquotes
    .replace(/`{1,3}(.*?)`{1,3}/g, "$1"); // inline & block code

  // 4. Remove decorative bullets and symbols (•, ●, ⁃, ▪, ■, etc.)
  sanitized = sanitized.replace(/[\u2022\u25CF\u2043\u00B7\u25AA\u25A0]/g, "");

  // 5. Normalize em dashes (— \u2014) and en dashes (– \u2013) to hyphen (-)
  sanitized = sanitized.replace(/[\u2014\u2013\u2015]/g, "-");

  // 6. Clean up leading decorative separators
  sanitized = sanitized.replace(/^[\s\-:•●]+/, "");

  // 7. Collapse all excessive consecutive whitespace (including newlines) and trim edges
  sanitized = sanitized.replace(/\s+/g, " ").trim();

  return sanitized;
}

export function validateAntiSlop(input: string): boolean {
  // Reject decorative bullets
  if (/[\u2022\u25CF]/.test(input)) {
    return false;
  }
  return true;
}
