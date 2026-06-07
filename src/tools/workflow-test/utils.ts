/** Converts a string to a URL-safe slug. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Capitalizes the first letter of each word, lowercasing the rest. */
export function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Truncates a string to maxLength characters, appending "..." if truncated. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + "...";
}

/** Formats an array of strings as a bulleted list string. */
export function formatList(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  return items.map((item) => `- ${item}\n`).join("");
}
