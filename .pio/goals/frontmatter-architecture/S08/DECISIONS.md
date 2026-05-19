# Decisions (Step 8)

Accumulated decisions from Steps 1–7 that may impact downstream steps (9).

## Plan Deviation — typebox over custom OutputSchema ⚠️

- **Schema approach changed to typebox.** The original `PLAN.md` specified a hand-rolled `OutputField[]` / `OutputSchema` system. Schemas use `Type.Object(...)` from `typebox`, and types are derived via `Static<typeof schema>`. Validation uses `Value.Check()` from `typebox/value`.
- **Impact:** All capability schemas and frontmatter validation must use typebox. Step 9 test migration should test against typebox schemas, not the original custom format.

## Plan Deviation — GoalState as the single parsing path ⚠️

- **All capability frontmatter access flows through `GoalState.getReviewOutputs()`.** `postValidate` delegates to `GoalState.getReviewOutputs(stepNumber, { errors: true })` rather than calling `extractFrontmatter` directly. The method supports an `{ errors: true }` overload returning `{ data?: T; error?: string }` for validation contexts.
- **Impact:** Step 9 test migration should include tests for the `{ errors: true }` overload on `getReviewOutputs`.

## Plan Deviation — Most slim-down work completed in Steps 5–6 ⚠️

- **Frontmatter functions and mark-complete tool were already removed from `validation.ts`** during Steps 5–6 when those concerns moved to `session-capability.ts` and `review-task.ts`. Step 8 is primarily a verification and final cleanup step.
- **Impact:** Step 9 should verify no residual imports or references to the old functions exist anywhere in the codebase.

## Architecture Decisions

- **All capability schemas live in `src/frontmatter-schemas.ts`:** A leaf module importing only from `typebox`. Prevents circular dependencies when `goal-state.ts` needs schema access.
- **Marker creation lives in `postValidate` (before transition routing):** `resolveTransition` reads markers from disk via `GoalState.step.status()`, so they must exist before transition routing runs.
- **Review-task does not define `postExecute`:** The hook is wired but unassigned. Available for future capabilities.

## Shared Frontmatter Module (`src/frontmatter.ts`)

- **`extractFrontmatter` delimiter logic:** Uses `firstDelimiter = 4` (length of `"---\n"`) to slice content before searching for closing `\n---\n`. Parsed YAML arrays return `null` — frontmatter is always key-value objects.

## GoalState Interface

- **Union return type over function overloads:** `getReviewOutputs()` returns a union (`ReviewOutputs | null | { data?: ReviewOutputs; error?: string }`). Callers using the errors mode need type assertions to narrow.

## Function Pattern Refactor (Steps 2 + 7)

- **Single public API per capability:** Functions accept `goalDir` directly and create `GoalState` internally. No `_private(state)` / `public(goalDir)` split. Internal helpers are not exported.
