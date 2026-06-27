import * as fs from "node:fs";
import * as jsyaml from "js-yaml";
import type { TSchema } from "typebox";
import * as Value from "typebox/value";

// Maximum recursion depth for schema description (prevents runaway output on deeply-nested schemas).
const MAX_DEPTH = 4;

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
export function extractFrontmatter(
  filePath: string,
): Record<string, unknown> | null {
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
    const messages = errors
      .map((e) => {
        const field = e.instancePath
          ? e.instancePath.replace(/^\//, "")
          : "root";
        return `Field '${field}': ${e.message}`;
      })
      .join("; ");
    return { error: messages };
  }

  // Coerce: extract only schema-declared fields (both required and optional).
  // Iterates over `properties` keys — not `required` — so optional fields
  // present in `raw` are preserved. Extra fields not in the schema are stripped.
  const schemaType = (schema as Record<string, unknown>).type;

  if (schemaType === "object") {
    const properties = (schema as Record<string, unknown>).properties as Record<
      string,
      unknown
    >;
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

// ---------------------------------------------------------------------------
// Schema description (human-readable frontmatter format)
// ---------------------------------------------------------------------------

/**
 * Convert a TypeBox `TSchema` into a human-readable multi-line description of
 * the expected frontmatter structure.
 *
 * Covers: required vs optional fields, field types, literal/union constraints,
 * array item types, and nested objects with indentation.
 *
 * Depth is capped at `MAX_DEPTH` levels — deeper nesting shows `...`.
 */
export function formatSchemaDescription(
  schema: TSchema,
  depth: number = 0,
): string {
  if (depth > MAX_DEPTH) {
    return "  ...";
  }

  const node = schema as Record<string, unknown>;

  // Handle object schemas — iterate properties
  if (node.type === "object") {
    const properties = node.properties as Record<string, unknown> | undefined;
    const required = (node.required as string[] | undefined) ?? [];

    if (!properties || Object.keys(properties).length === 0) {
      return "";
    }

    const indent = "  ".repeat(depth + 1);
    const lines: string[] = [];

    for (const [key, value] of Object.entries(properties)) {
      const isRequired = required.includes(key);
      const marker = isRequired ? "(required)" : "(optional)";
      const typeDesc = describeType(value as TSchema, depth + 1);
      lines.push(`${indent}- ${key} ${marker}: ${typeDesc}`);
    }

    return lines.join("\n");
  }

  // Non-object top-level — describe the type directly
  return describeType(schema, depth + 1);
}

/**
 * Describe a single TypeBox type node as a short string.
 * For objects and arrays with items, also appends nested field descriptions.
 */
function describeType(schema: TSchema, depth: number): string {
  const node = schema as Record<string, unknown>;

  // Union of literals (anyOf with all const values)
  if ("anyOf" in node && Array.isArray(node.anyOf)) {
    const options = node.anyOf as TSchema[];
    const allLiterals = options.every(
      (opt) =>
        (opt as Record<string, unknown>).type === "string" &&
        "const" in (opt as Record<string, unknown>),
    );
    if (allLiterals) {
      const values = options
        .map((opt) => `"${(opt as Record<string, unknown>).const}"`)
        .join(" | ");
      return `string (one of: ${values})`;
    }
    // Mixed union — fall back
    return "union";
  }

  // Object
  if (node.type === "object") {
    const properties = node.properties as Record<string, unknown> | undefined;
    const required = (node.required as string[] | undefined) ?? [];

    if (!properties || Object.keys(properties).length === 0) {
      return "object";
    }

    const indent = "  ".repeat(depth + 1);
    const lines: string[] = ["object"];

    if (depth < MAX_DEPTH) {
      for (const [key, value] of Object.entries(properties)) {
        const isRequired = required.includes(key);
        const marker = isRequired ? "(required)" : "(optional)";
        const typeDesc = describeType(value as TSchema, depth + 1);
        lines.push(`${indent}- ${key} ${marker}: ${typeDesc}`);
      }
    } else {
      lines.push(`${indent}...`);
    }

    return lines.join("\n");
  }

  // Array — recurse into items
  if (node.type === "array" && "items" in node) {
    const itemSchema = node.items as TSchema;
    const itemNode = itemSchema as Record<string, unknown>;

    // For arrays of objects, show `array<object>` on the line and nest fields below
    if (itemNode.type === "object") {
      const properties = itemNode.properties as
        | Record<string, unknown>
        | undefined;
      const required = (itemNode.required as string[] | undefined) ?? [];

      if (
        properties &&
        Object.keys(properties).length > 0 &&
        depth < MAX_DEPTH
      ) {
        // Properties of array items are nested one level deeper than the array itself.
        // The array is at depth+1 (child of parent property), so its item properties
        // need depth+2 for the indent and depth+2 for recursive describeType calls.
        const indent = "  ".repeat(depth + 2);
        const lines: string[] = ["array<object>"];
        for (const [key, value] of Object.entries(properties)) {
          const isRequired = required.includes(key);
          const marker = isRequired ? "(required)" : "(optional)";
          const typeDesc = describeType(value as TSchema, depth + 2);
          lines.push(`${indent}- ${key} ${marker}: ${typeDesc}`);
        }
        return lines.join("\n");
      }
    }

    // Simple item type (string, number, etc.)
    const itemType = describeType(itemSchema, depth);
    return `array<${itemType}>`;
  }

  // String with const (literal)
  if (node.type === "string" && "const" in node) {
    return `string = "${node.const}"`;
  }

  // String with pattern
  if (node.type === "string" && "pattern" in node) {
    return `string (pattern: "${node.pattern}")`;
  }

  // Plain string
  if (node.type === "string") {
    return "string";
  }

  // Integer or number with constraints
  if (node.type === "integer" || node.type === "number") {
    const constraints: string[] = [];
    if ("minimum" in node) constraints.push(`min: ${node.minimum}`);
    if ("maximum" in node) constraints.push(`max: ${node.maximum}`);
    const suffix = constraints.length > 0 ? ` (${constraints.join(", ")})` : "";
    return `number${suffix}`;
  }

  // Boolean
  if (node.type === "boolean") {
    return "boolean";
  }

  // Unknown type
  return `unknown (type: ${node.type ?? "null"})`;
}
