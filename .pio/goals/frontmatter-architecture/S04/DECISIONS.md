# Decisions (Step 4)

Accumulated decisions from Steps 1–3 that may impact downstream implementation.

## Plan Deviation — typebox over custom OutputSchema ⚠️

- **Schema approach changed to typebox.** The original PLAN.md specified a hand-rolled `OutputField[]` / `OutputSchema` system in `src/frontmatter.ts`. This was superseded: the project already has `typebox ^1.1.24` (also used by every capability for tool parameters). Schemas use `Type.Object(...)` and types are derived via `Static<typeof schema>` — single source of truth, no duplication.
- **Impact:** Every capability schema will use typebox schemas. Validation in `postValidate` hooks uses `Value.Check(schema, raw)` from `typebox/value`. The custom `OutputField`/`OutputSchema` types were removed and should not reappear in downstream steps.

## Architecture Decisions

- **Runtime validation via `typebox/value`:** Use `import * as Value from "typebox/value"` for `Check()` and `Errors()`. No JIT compilation needed — schemas are small.
- **All capability schemas live in `src/frontmatter-schemas.ts`:** This leaf module imports only from `typebox`, never from project source. Prevents circular dependencies when `goal-state.ts` needs schema access. Future capability schemas (e.g., execute-task SUMMARY metadata) must also go here — not inline in capability files.
- **GoalState frontmatter methods return `null` on error:** `getReviewOutputs()` and any future frontmatter-reading methods return `null` for missing files, malformed YAML, or validation failures — matching the existing lazy-evaluation pattern. Never throw.

## Shared Frontmatter Module

- **`extractFrontmatter` delimiter logic:** Uses `firstDelimiter = 4` (length of `"---\n"`) to slice content before searching for closing `\n---\n`.
- **Arrays rejected:** Parsed YAML arrays return `null`. Frontmatter is always key-value objects.
