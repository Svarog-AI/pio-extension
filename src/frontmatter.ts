import * as fs from "node:fs";
import * as jsyaml from "js-yaml";
import * as Value from "typebox/value";
import type { TSchema } from "typebox";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Result of validating and coercing raw frontmatter data.
 * On success: `{ data: T }`. On failure: `{ error: string }`.
 */
export type CoerceResult<T> =
  | { data: T; error?: never }
  | { data?: never; error: string };

// ---------------------------------------------------------------------------
// YAML extraction
// ---------------------------------------------------------------------------

/**
 * Read a file from disk, locate the YAML frontmatter block delimited by `---`
 * at the top of the file, parse it with `js-yaml`, and return the parsed object
 * as `Record<string, unknown>`.
 *
 * Returns `null` in all error cases:
 * - File does not exist
 * - File content does not start with `---\n`
 * - Closing `\n---\n` delimiter is not found
 * - YAML between delimiters is malformed
 * - Parsed YAML value is `null`, `undefined`, or not a plain object
 */
export function extractFrontmatter(filePath: string): Record<string, unknown> | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  // Content must start with ---\n (frontmatter at the very beginning)
  if (!content.startsWith("---\n")) {
    return null;
  }

  // Find the closing --- delimiter
  const firstDelimiter = 4; // length of "---\n"
  const rest = content.slice(firstDelimiter);
  const secondDelimiterIndex = rest.indexOf("\n---\n");

  if (secondDelimiterIndex === -1) {
    // Closing delimiter not found
    return null;
  }

  const yamlContent = rest.slice(0, secondDelimiterIndex);

  try {
    const parsed = jsyaml.load(yamlContent);

    // null, undefined, or non-object values are not valid frontmatter
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    // YAML parsing failed
    return null;
  }
}

// ---------------------------------------------------------------------------
// Schema-based validation and coercion (typebox)
// ---------------------------------------------------------------------------

/**
 * Validate a raw parsed object against a typebox `TSchema` and coerce to a typed result.
 *
 * On success returns `{ data: T }` containing only the schema-declared fields.
 * On failure returns `{ error: string }` with a human-readable error description
 * derived from typebox `Value.Errors`.
 *
 * Uses `Value.Check(schema, raw)` for validation — typebox enforces:
 * - Required fields (presence)
 * - Type constraints (string, integer, enum via Union/Literal)
 * - Value constraints (minimum, maximum, pattern, etc.)
 *
 * Extra fields in `raw` that are not in the schema are stripped during coercion.
 */
export function validateAndCoerce<T extends Record<string, unknown>>(
  raw: Record<string, unknown>,
  schema: TSchema,
): CoerceResult<T> {
  // Validate with typebox
  if (!Value.Check(schema, raw)) {
    // Collect all errors into a single message including field paths
    const errors = [...Value.Errors(schema, raw)];
    const messages = errors.map((e) => {
      const field = e.instancePath ? e.instancePath.replace(/^\//, "") : "root";
      return `Field '${field}': ${e.message}`;
    }).join("; ");
    return { error: messages };
  }

  // Coerce: extract only schema-declared fields (both required and optional).
  // Iterates over `properties` keys — not `required` — so optional fields
  // present in `raw` are preserved. Extra fields not in the schema are stripped.
  const schemaType = (schema as Record<string, unknown>).type;

  if (schemaType === "object") {
    const properties = (schema as Record<string, unknown>).properties as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const key of Object.keys(properties)) {
      if (key in raw) {
        data[key] = raw[key];
      }
    }
    return { data: data as T };
  }

  // Non-object schema — return raw as-is
  return { data: raw as T };
}
