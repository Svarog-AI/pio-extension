# Decisions (Step 7)

Accumulated decisions from Steps 1–6 that may impact downstream steps (8, 9).

## Plan Deviation — typebox over custom OutputSchema ⚠️

- **Schema approach changed to typebox.** The original `PLAN.md` specified a hand-rolled `OutputField[]` / `OutputSchema` system. This was superseded: schemas use `Type.Object(...)` from `typebox`, and types are derived via `Static<typeof schema>`. Validation uses `Value.Check()` from `typebox/value`.
- **Impact:** All capability schemas and frontmatter validation must use typebox. No custom schema format exists in the codebase.

## Plan Deviation — GoalState as the single parsing path ⚠️

- **All capability frontmatter access flows through `GoalState.getReviewOutputs()`.** `postValidate` delegates to `GoalState.getReviewOutputs(stepNumber, { errors: true })` rather than calling `extractFrontmatter` directly. The method supports an `{ errors: true }` overload returning `{ data?: T; error?: string }` for validation contexts.
- **Impact:** Downstream steps that touch frontmatter access should go through GoalState methods, not direct parser calls.

## Architecture Decisions

- **All capability schemas live in `src/frontmatter-schemas.ts`:** A leaf module importing only from `typebox`. Prevents circular dependencies when `goal-state.ts` needs schema access. Future capability schemas must also go here.
- **Marker creation lives in `postValidate` (before transition routing):** `resolveTransition` reads markers from disk via `GoalState.step.status()`, so they must exist before transition routing runs.
- **Review-task does not define `postExecute`:** The hook is wired but unassigned. Available for future capabilities.

## Shared Frontmatter Module (`src/frontmatter.ts`)

- **`extractFrontmatter` delimiter logic:** Uses `firstDelimiter = 4` (length of `"---\n"`) to slice content before searching for closing `\n---\n`. Parsed YAML arrays return `null` — frontmatter is always key-value objects.

## GoalState Interface

- **Union return type over function overloads:** `getReviewOutputs()` returns a union (`ReviewOutputs | null | { data?: ReviewOutputs; error?: string }`). Callers using the errors mode need type assertions to narrow.

## Function Pattern Refactor (Step 2 + Step 7)

- **Single public API per capability:** Functions accept `goalDir` directly and create `GoalState` internally. No `_private(state)` / `public(goalDir)` split. Internal helpers may exist but are not exported and don't use underscore prefixes.
- **Impact on Step 8 (slim down validation.ts):** Ensure no lingering references to the old `_private`/`public` pattern in any module touched by the slim-down.
