# Task: Create shared frontmatter parsing module (`src/frontmatter.ts`)

Create a new generic module for YAML extraction from files and schema-based validation/coercion, with no capability-specific logic.

## Context

Currently, review-specific frontmatter parsing lives in `src/guards/validation.ts` (~500 lines). Functions like `parseReviewFrontmatter`, `validateReviewFrontmatter`, and `toReviewFrontmatter` are hardcoded to understand review decisions and issue counts. This creates tight coupling: the guard module imports `js-yaml`, knows about review types, and cannot serve other capabilities. Step 1 extracts the mechanical work into a generic reusable module that any capability can use with its own schema definition.

## What to Build

A new file `src/frontmatter.ts` exporting two public functions and two shared types:

### Code Components

#### `extractFrontmatter(filePath: string): Record<string, unknown> | null`

Reads a file from disk, locates the YAML frontmatter block delimited by `---` at the top of the file, parses it with `js-yaml`, and returns the parsed object as `Record<string, unknown>`. Returns `null` in all error cases:

- File does not exist (readFileSync throws)
- File content does not start with `---\n` (no frontmatter)
- Closing `\n---\n` delimiter is not found
- YAML between delimiters is malformed (`js-yaml.load` throws)
- Parsed YAML value is `null`, `undefined`, or not a plain object

Follow the extraction logic from the existing `parseReviewFrontmatter` in `src/guards/validation.ts` (lines 62–108): open delimiter at position 0 with `---\n`, search for `\n---\n` closing delimiter, extract YAML between them, parse with `js-yaml.load()`. The key difference is the return type — this returns the raw `Record<string, unknown>` without any capability-specific field checking.

#### `validateAndCoerce<T extends Record<string, unknown>>(raw: Record<string, unknown>, schema: OutputSchema): CoerceResult<T>`

Validates a raw parsed object against an `OutputSchema` and coerces to a typed result. On success returns `{ data: T }`. On failure returns `{ error: string }` with a human-readable error description. Validation rules per field:

1. **Presence check:** All fields declared in the schema are required. Return error if any field key is missing from `raw`.
2. **Type check:** Value type must match the field's `type`:
   - `"string"` — value must be a JavaScript string (`typeof val === "string"`)
   - `"integer"` — value must be an integer (`typeof val === "number" && Number.isInteger(val)`)
   - `"enum"` — value must be a string matching one of the `values[]` entries
3. **Constraint check (optional):** Additional constraints applied after type passes:
   - `min?: number` — for `"integer"` fields, value must be >= `min`. For `"string"` fields this constraint does not apply.

Stop at the first validation failure and return that error — no need to collect all errors. Error messages should identify the field name and what went wrong (e.g., `"Field 'decision' must be one of: APPROVED, REJECTED. Found: 'PENDING'"`).

#### Shared Types

```typescript
interface OutputField {
  name: string;
  type: "string" | "integer" | "enum";
  values?: string[];  // for enum type — allowed literal values
  min?: number;        // for integer type — minimum value (inclusive)
}

interface OutputSchema {
  fields: OutputField[];
}

type CoerceResult<T extends Record<string, unknown>> =
  | { data: T; error?: never }
  | { data?: never; error: string };
```

Export all types (`OutputField`, `OutputSchema`, `CoerceResult`) so capabilities can reference them when defining schemas.

### Approach and Decisions

- Use `node:fs` (ESM import) for file reading, consistent with the codebase convention (`src/guards/validation.ts` uses `import * as fs from "node:fs"`).
- Import `js-yaml` directly — it's already a dependency in `package.json` under `"dependencies"`.
- The module is pure utility — no module-level state, no side effects beyond file reads.
- Follow the existing test pattern: colocated `.test.ts`, Vitest with globals, real temp directories (`fs.mkdtempSync` + `os.tmpdir()`).

## Dependencies

None. This is Step 1 of the plan. No earlier steps are required.

## Files Affected

- `src/frontmatter.ts` — created: YAML extraction + schema-based validation/coercion (new file)
- `src/frontmatter.test.ts` — created: unit tests for both public functions (new file)

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] `extractFrontmatter` returns parsed `Record<string, unknown>` for valid `---...---` YAML blocks
- [ ] `extractFrontmatter` returns `null` for: missing file, no delimiters, malformed YAML, non-object YAML
- [ ] `validateAndCoerce` returns `{ data }` with correctly typed fields on valid input matching the schema
- [ ] `validateAndCoerce` returns `{ error }` string for: missing required fields, wrong types (string/integer/enum), out-of-range integer values (below min), invalid enum values
- [ ] Extra fields in raw data that are not in the schema are ignored (no error)
- [ ] Existing test suite passes with no regressions (`npx vitest run`)

## Risks and Edge Cases

- **YAML edge cases:** Empty YAML between delimiters (`---\n---\nbody`) parses to `null` in js-yaml. The function should return `null` for this case since `null` is not a plain object.
- **Integer validation:** JavaScript numbers like `1.5` pass `typeof === "number"` but fail `Number.isInteger`. Ensure the type check catches floats.
- **Schema with no fields:** An empty `fields: []` schema should always succeed — there are no requirements to violate.
- **Boolean values from YAML:** js-yaml parses `true`/`false` as JavaScript booleans, not strings. If a schema expects `"string"` type but the value is a boolean, it should fail type checking.
