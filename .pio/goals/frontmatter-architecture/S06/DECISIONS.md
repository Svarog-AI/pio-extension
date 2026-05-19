# Decisions (Step 6)

Accumulated decisions from Steps 1–5 that may impact downstream implementation.

## Plan Deviation — typebox over custom OutputSchema ⚠️

- **Schema approach changed to typebox.** The original PLAN.md specified a hand-rolled `OutputField[]` / `OutputSchema` system in `src/frontmatter.ts`. This was superseded: the project already has `typebox ^1.1.24`. Schemas use `Type.Object(...)` and types are derived via `Static<typeof schema>` — single source of truth, no duplication.
- **Impact:** Every capability schema uses typebox schemas. Validation in `postValidate` hooks uses `Value.Check(schema, raw)` from `typebox/value`.

## Plan Deviation — GoalState as the single parsing path ⚠️

- **All capability frontmatter access flows through `GoalState.getReviewOutputs()`.** `postValidate` delegates to `GoalState.getReviewOutputs(stepNumber, { errors: true })` rather than calling `extractFrontmatter` + `validateAndCoerce` directly. The method gained an `{ errors: true }` overload returning `{ data?: T; error?: string }` for validation contexts.
- **Impact on downstream steps:** Step 6's mark-complete orchestrator calls `config.postValidate`, which internally uses GoalState. No additional parsing logic needed in session-capability.ts.

## Architecture Decisions

- **All capability schemas live in `src/frontmatter-schemas.ts`:** This leaf module imports only from `typebox`, never from project source. Prevents circular dependencies when `goal-state.ts` needs schema access. Future capability schemas must also go here.
- **Runtime validation via `typebox/value`:** Use `import * as Value from "typebox/value"` for `Check()` and `Errors()`.

## Shared Frontmatter Module (`src/frontmatter.ts`)

- **`extractFrontmatter` delimiter logic:** Uses `firstDelimiter = 4` (length of `"---\n"`) to slice content before searching for closing `\n---\n`.
- **Arrays rejected:** Parsed YAML arrays return `null`. Frontmatter is always key-value objects.

## Lifecycle Hook Ordering

- **Marker creation lives in `postValidate`:** Frontmatter must be valid before creating markers. If validation fails, neither markers nor transitions happen — no stale state cleanup needed. Also, `resolveTransition` reads markers from disk (via `GoalState.step.status()`), so they must exist before transition routing runs.
- **Execution order: postValidate → transition routing → task enqueuing → postExecute.** PostValidate can fail to keep the agent in session. PostExecute runs only after validation passes and transitions are resolved.
- **Review-task does not define `postExecute`:** The hook is wired but unassigned. Available for future capabilities that need post-exit behavior beyond marker creation and generic cleanup.

## GoalState Interface Decision

- **Union return type over function overloads:** TypeScript interfaces don't support function overloads on property-style members. `getReviewOutputs()` returns a union type (`ReviewOutputs | null | { data?: ReviewOutputs; error?: string }`). Callers using the errors mode need a type assertion to narrow the return type.

## Lifecycle Hooks (Step 4)

- **Naming convention:** `PostValidateCallback`, `PostExecuteCallback` — follows existing `PrepareSessionCallback` pattern. Both types exported from `types.ts`.
- **`PostValidateCallback` is synchronous** (returns `{ success: boolean; message?: string }`) — validation should be fast I/O or pure logic.
- **`PostExecuteCallback` may be async** (`void | Promise<void>`) — may need to perform I/O like writing marker files.
