# Decisions (Step 9)

Accumulated decisions from Steps 1–8 that may impact downstream consumers (e.g., future goals building on this refactoring).

## Plan Deviation — typebox over custom OutputSchema ⚠️

- **Schema approach changed to typebox.** The original `PLAN.md` specified a hand-rolled `OutputField[]` / `OutputSchema` system. All schemas now use `Type.Object(...)` from `typebox`, types are derived via `Static<typeof schema>`, and validation uses `Value.Check()` from `typebox/value`.
- **Impact:** Any future capability adding frontmatter must define a typebox JSON Schema, not the original custom format. Tests must test against typebox schemas.

## Plan Deviation — GoalState as the single parsing path ⚠️

- **All capability frontmatter access flows through `GoalState.getReviewOutputs()`.** `postValidate` delegates to `GoalState.getReviewOutputs(stepNumber, { errors: true })` rather than calling `extractFrontmatter` directly. The method supports an `{ errors: true }` overload returning `{ data?: T; error?: string }` for validation contexts.
- **Impact:** Future frontmatter access should always go through GoalState methods, not direct `extractFrontmatter` calls.

## Architecture Decisions

- **All capability schemas live in `src/frontmatter-schemas.ts`:** A leaf module importing only from `typebox`. Prevents circular dependencies when `goal-state.ts` needs schema access. Future capability schemas should follow this pattern.
- **Marker creation lives in `postValidate` (before transition routing):** `resolveTransition` reads markers from disk via `GoalState.step.status()`, so they must exist before transition routing runs. This constrains where side effects can live.
- **Review-task does not define `postExecute`:** The hook is wired but unassigned. Available for future capabilities that need post-exit behavior beyond marker creation.
- **`extractGoalName` removed from `validation.ts`:** No longer exported. `state-machine.ts` has its own local implementation (different signature — returns `string | undefined`). Do not re-add to validation.ts.

## Test Migration Pattern

- **Tests are colocated** using the `*.test.ts` convention alongside source files (e.g., `src/frontmatter.test.ts` next to `src/frontmatter.ts`). This is established in `.pio/PROJECT/DEVELOPMENT.md`.
- **Temp directory pattern:** Tests use `fs.mkdtempSync()` under `os.tmpdir()` with real filesystem operations. No mocked filesystems. Clean up in `afterEach`.
