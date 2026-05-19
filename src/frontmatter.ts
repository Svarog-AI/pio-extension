import * as fs from "node:fs";
import * as jsyaml from "js-yaml";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Describes a single field in an output frontmatter schema.
 * Used to validate and coerce raw YAML data into typed capability outputs.
 */
export interface OutputField {
  name: string;
  type: "string" | "integer" | "enum";
  values?: string[];  // for enum type — allowed literal values
  min?: number;        // for integer type — minimum value (inclusive)
}

/**
 * Schema defining the expected frontmatter fields for a capability output.
 */
export interface OutputSchema {
  fields: OutputField[];
}

/**
 * Result of validating and coercing raw frontmatter data.
 * On success: `{ data: T }`. On failure: `{ error: string }`.
 */
export type CoerceResult<T extends Record<string, unknown>> =
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
// Schema-based validation and coercion
// ---------------------------------------------------------------------------

/**
 * Validate a raw parsed object against an `OutputSchema` and coerce to a typed result.
 *
 * On success returns `{ data: T }` containing only the schema-declared fields.
 * On failure returns `{ error: string }` with a human-readable error description.
 *
 * Validation rules per field:
 * 1. **Presence:** All schema fields are required.
 * 2. **Type:** Value type must match `string`, `integer`, or `enum`.
 * 3. **Constraints:** `min` applied to `integer` fields.
 *
 * Extra fields in `raw` that are not in the schema are ignored.
 * Stops at the first validation failure.
 */
export function validateAndCoerce<T extends Record<string, unknown>>(
  raw: Record<string, unknown>,
  schema: OutputSchema,
): CoerceResult<T> {
  const data = {} as T;

  for (const field of schema.fields) {
    // 1. Presence check
    if (!(field.name in raw) || raw[field.name] === undefined) {
      return { error: `Missing required field: '${field.name}'` };
    }

    const value = raw[field.name];

    // 2. Type check
    switch (field.type) {
      case "string": {
        if (typeof value !== "string") {
          return { error: `Field '${field.name}' must be a string. Found: ${JSON.stringify(value)}` };
        }
        break;
      }

      case "integer": {
        if (typeof value !== "number" || !Number.isInteger(value)) {
          return { error: `Field '${field.name}' must be an integer. Found: ${JSON.stringify(value)}` };
        }

        // 3. Constraint check — min
        if (field.min !== undefined && value < field.min) {
          return { error: `Field '${field.name}' must be >= ${field.min}. Found: ${value}` };
        }
        break;
      }

      case "enum": {
        if (typeof value !== "string" || !field.values?.includes(value)) {
          const allowed = field.values?.join(", ") ?? "(none)";
          return { error: `Field '${field.name}' must be one of: ${allowed}. Found: '${value}'` };
        }
        break;
      }
    }

    // Coerce: add validated field to output
    (data as Record<string, unknown>)[field.name] = value;
  }

  return { data };
}
