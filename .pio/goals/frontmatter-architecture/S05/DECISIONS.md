# Decisions (Step 5)

Accumulated decisions from Steps 1–4 that may impact downstream implementation.

## Plan Deviation — typebox over custom OutputSchema ⚠️

- **Schema approach changed to typebox.** The original PLAN.md specified a hand-rolled `OutputField[]` / `OutputSchema` system in `src/frontmatter.ts`. This was superseded: the project already has `typebox ^1.1.24`. Schemas use `Type.Object(...)` and types are derived via `Static<typeof schema>` — single source of truth, no duplication.
- **Impact:** Every capability schema uses typebox schemas. Validation in `postValidate` hooks uses `Value.Check(schema, raw)` from `typebox/value`.

## Architecture Decisions

- **All capability schemas live in `src/frontmatter-schemas.ts`:** This leaf module imports only from `typebox`, never from project source. Prevents circular dependencies when `goal-state.ts` needs schema access. Future capability schemas must also go here.
- **Runtime validation via `typebox/value`:** Use `import * as Value from "typebox/value"` for `Check()` and `Errors()`. No JIT compilation needed.

## Shared Frontmatter Module (`src/frontmatter.ts`)

- **`extractFrontmatter` delimiter logic:** Uses `firstDelimiter = 4` (length of `"---\n"`) to slice content before searching for closing `\n---\n`.
- **Arrays rejected:** Parsed YAML arrays return `null`. Frontmatter is always key-value objects.

## GoalState as the single parsing path (Step 5 decision) ⚠️

- **All capability frontmatter access flows through `GoalState.getReviewOutputs()`.** Originally, `postValidate` would call `extractFrontmatter` + `validateAndCoerce` directly, duplicating the logic already inside `getReviewOutputs()`. To eliminate this duplication, `getReviewOutputs()` gained an overload with `{ errors: true }` that returns `{ data?: T; error?: string }` — detailed errors for validation contexts, while the default call remains backward-compatible (`T | null`).
- **Impact on Step 6 (session-capability.ts):** When `pio_mark_complete` calls `postValidate`, the orchestrator doesn't need to know about frontmatter parsing. Capabilities that need validation with error messages use the errors overload. Capabilities that just need data use the default.

## Lifecycle Hook Ordering

- **Marker creation lives in `postValidate`:** Frontmatter must be valid before creating markers. If validation fails, neither markers nor transitions happen — no stale state cleanup needed. Also, `resolveTransition` reads markers from disk (via `GoalState.step.status()`), so they must exist before transition routing runs.
- **Execution order: postValidate → transition routing → task enqueuing → postExecute.** PostValidate can fail to keep the agent in session. PostExecute runs only after validation passes and transitions are resolved.
- **Review-task does not define `postExecute`:** The hook is wired but unassigned. Available for future capabilities that need post-exit behavior beyond marker creation and generic cleanup.

## Lifecycle Hooks (Step 4)

- **Naming convention:** `PostValidateCallback`, `PostExecuteCallback` — follows existing `PrepareSessionCallback` pattern. Both types exported from `types.ts`.
- **`PostValidateCallback` is synchronous** (returns `{ success: boolean; message?: string }`) — validation should be fast I/O or pure logic.
- **`PostExecuteCallback` may be async** (`void | Promise<void>`) — may need to perform I/O like writing marker files.
