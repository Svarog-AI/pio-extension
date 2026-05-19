# Decisions (Step 3)

Accumulated decisions from prior steps that may impact downstream implementation.

## Plan Deviation — typebox over custom OutputSchema ⚠️

- **Schema approach changed to typebox.** The original PLAN.md specified a hand-rolled `OutputField[]` / `OutputSchema` system in `src/frontmatter.ts`. This was superseded: the project already has `typebox ^1.1.24` (also used by every capability for tool parameters). Schemas use `Type.Object(...)` and types are derived via `Static<typeof schema>` — single source of truth, no duplication.
- **Impact on downstream steps:** Every capability schema will use typebox schemas. `validateAndCoerce` calls (Step 5's `postValidate`, etc.) use typebox validation (`Value.Check(schema, raw)`).
- **Runtime validation via `typebox/value`:** Use `import * as Value from "typebox/value"` for `Check()` and `Errors()`. No JIT compilation needed.

## Shared Frontmatter Module (`src/frontmatter.ts`)

- **`extractFrontmatter` delimiter logic:** Uses `firstDelimiter = 4` (length of `"---\n"`) to slice content before searching for the closing `\n---\n`.
- **Arrays rejected by `extractFrontmatter`:** Parsed YAML that is an array returns `null`. Frontmatter is always key-value pairs.

## Schema Extraction (Step 3 decision)

- **Circular dependency resolution:** `review-task.ts` imports from `goal-state.ts` (`createGoalState`, `type StepStatus`). If `goal-state.ts` imports `REVIEW_OUTPUT_SCHEMA` and `ReviewOutputs` from `review-task.ts`, a direct circular dependency results. To break the cycle, extract the schema + type into a dedicated file `src/frontmatter-schemas.ts`. Both `review-task.ts` and `goal-state.ts` import from this leaf module.
- **Impact on downstream steps:** Any future capability schema (e.g., execute-task SUMMARY metadata) should also live in `frontmatter-schemas.ts` to avoid similar cycles. This file is a pure data definition module — no imports from the rest of the codebase.
