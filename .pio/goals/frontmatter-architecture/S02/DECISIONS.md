# Decisions (Step 2+)

Accumulated decisions from prior steps that may impact downstream implementation.

## Shared Frontmatter Module (`src/frontmatter.ts`)

- **`extractFrontmatter` delimiter logic:** Uses `firstDelimiter = 4` (length of `"---\n"`) to slice content before searching for the closing `\n---\n`. Downstream callers can rely on this exact delimiter pattern.
- **`validateAndCoerce` coercion:** After retrofit to typebox, the function strips extra fields by extracting only `schema.required` keys. This maintains the original behavior of returning only schema-declared fields.
- **Error messages:** typebox `Value.Errors` provides `instancePath` (JSON pointer like `/decision`) and `message` (like "must be string"). The function formats these as `Field 'decision': must be string` for human-readable error output.
- **Arrays rejected by `extractFrontmatter`:** Parsed YAML that is an array returns `null`. Frontmatter is always key-value pairs.

## Plan Deviation — typebox over custom OutputSchema ⚠️

- **Schema approach changed to typebox.** The original PLAN.md specified a hand-rolled `OutputField[]` / `OutputSchema` system in `src/frontmatter.ts`. This was superseded: the project already has `typebox ^1.1.24` (also used by every capability for tool parameters). The new approach uses `Type.Object(...)` for schema definitions and `Static<typeof schema>` for type extraction — single source of truth, no duplication.
- **Step 1 retrofit completed (quick fix after Step 2):** `src/frontmatter.ts` has been retrofitted to accept typebox `TSchema` instead of the custom `OutputSchema`. The `OutputField` and `OutputSchema` types have been removed. `validateAndCoerce` now uses `Value.Check(schema, raw)` for validation and `Value.Errors(schema, raw)` for error details. Coercion strips extra fields by extracting only `schema.required` keys from the raw data. `extractFrontmatter` is unchanged.
- **Impact on downstream steps:** Every capability schema (review, execute-task SUMMARY, etc.) will use typebox schemas. `validateAndCoerce` calls in Step 5's `postValidate` will use typebox validation (`Value.Check(schema, raw)`).

## Architecture Decisions

- **Runtime validation via `typebox/value`:** Use `import * as Value from "typebox/value"` for `Check()` and `Errors()`. No JIT compilation (`Compile` from `typebox/compile`) needed — the schemas are small, runtime compilation adds complexity without measurable benefit.
- **No separate interface:** `ReviewOutputs = Static<typeof REVIEW_OUTPUT_SCHEMA>` — type is derived directly from schema. This pattern must be followed for all capability frontmatter contracts (Step 3+, Step 5+).
