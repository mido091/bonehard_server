const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "u",
  "ul",
]);

const escapeAttribute = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const isSafeUrl = (value) => /^(https?:|mailto:|tel:)/i.test(String(value || "").trim());

const sanitizeAttributes = (tagName, rawAttributes = "") => {
  if (tagName !== "a") return "";

  const hrefMatch = rawAttributes.match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const href = hrefMatch?.[2] || hrefMatch?.[3] || hrefMatch?.[4] || "";
  if (!isSafeUrl(href)) return "";

  return ` href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer"`;
};

export const sanitizeRichText = (value) => {
  if (!value) return null;

  return String(value)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|link|meta|base|form|input|button)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button)[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/\sstyle\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "")
    .replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (match, closingSlash, rawTagName, rawAttributes) => {
      const tagName = rawTagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tagName)) return "";
      if (closingSlash) return `</${tagName}>`;
      return `<${tagName}${sanitizeAttributes(tagName, rawAttributes)}>`;
    })
    .trim() || null;
};
