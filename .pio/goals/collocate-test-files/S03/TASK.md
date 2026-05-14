# Task: Update configuration and verify full test suite

Update vitest and TypeScript configuration to reflect the new collocated test layout, delete all remaining original test files from `__tests__/`, and run the full test suite to confirm zero regressions.

## Context

Steps 1 and 2 have relocated all 14 test files from `__tests__/` to live beside their source modules under `src/`. All 10 collocated `.test.ts` files exist and pass individually. However, configuration files still reference the old `__tests__/` directory, and 9 original test files remain in `__tests__/` (5 were deleted early during Step 2). This step finalizes the migration by updating config, cleaning up leftovers, and running end-to-end verification.

## What to Build

No new code is introduced. This step performs three configuration/ cleanup operations:

1. **Remove `__tests__/` references from `vitest.config.ts`:** The `include` array currently contains both legacy (`"__tests__/**/*.test.ts"`, `"__tests__/*.test.ts"`) and new (`"src/**/*.test.ts"`) patterns. Remove the two `__tests__/` entries so only `"src/**/*.test.ts"` remains.

2. **Remove `__tests__/` reference from `tsconfig.json`:** The `include` array is `["src/**/*.ts", "__tests__/**/*.ts"]`. Remove `"__tests__/**/*.ts"` so it reads `["src/**/*.ts"]`.

3. **Delete all remaining original test files from `__tests__/`:** After Steps 1 and 2, the following 9 files still exist in `__tests__/`:
   - `capability-config.test.ts`
   - `evolve-plan.test.ts`
   - `execute-task-initial-message.test.ts`
   - `fs-utils.test.ts`
   - `review-code-config.test.ts`
   - `session-capability.test.ts`
   - `smoke.test.ts`
   - `step-discovery.test.ts`
   - `types.test.ts`

   (The other 5 — `queues.test.ts`, `transition.test.ts`, `next-task.test.ts`, `validation.test.ts`, `turn-guard.test.ts` — were already deleted during Step 2.)

### Code Components

Not applicable — this step involves configuration edits and file deletion only.

### Approach and Decisions

- Edit `vitest.config.ts` to change the `include` array from `["__tests__/**/*.test.ts", "__tests__/*.test.ts", "src/**/*.test.ts"]` to `["src/**/*.test.ts"]`.
- Edit `tsconfig.json` to change the `include` array from `["src/**/*.ts", "__tests__/**/*.ts"]` to `["src/**/*.ts"]`.
- Delete all 9 remaining `.test.ts` files from `__tests__/`. Do NOT delete the directory itself — that is Step 4. Leave `__tests__/` as an empty directory.
- After all changes, run `npm run check` (TypeScript type check) and `npm run test` (full vitest suite) to verify correctness.

## Dependencies

- **Step 1:** Must be completed — provides the merged collocated test files (`capability-config.test.ts`, `fs-utils.test.ts`, `execute-task.test.ts`, `review-code.test.ts`, `evolve-plan.test.ts`).
- **Step 2:** Must be completed — provides the simple-move collocated test files (`queues.test.ts`, `transitions.test.ts`, `session-capability.test.ts`, `validation.test.ts`, `turn-guard.test.ts`).

## Files Affected

- `vitest.config.ts` — modified: remove `__tests__/` patterns from `include`
- `tsconfig.json` — modified: remove `"__tests__/**/*.ts"` from `include`
- `__tests__/capability-config.test.ts` — deleted
- `__tests__/evolve-plan.test.ts` — deleted
- `__tests__/execute-task-initial-message.test.ts` — deleted
- `__tests__/fs-utils.test.ts` — deleted
- `__tests__/review-code-config.test.ts` — deleted
- `__tests__/session-capability.test.ts` — deleted
- `__tests__/smoke.test.ts` — deleted
- `__tests__/step-discovery.test.ts` — deleted
- `__tests__/types.test.ts` — deleted

## Acceptance Criteria

- [ ] `vitest.config.ts` includes `"src/**/*.test.ts"` and no longer references `__tests__/`
- [ ] `tsconfig.json` `include` is `["src/**/*.ts"]` (no `__tests__` reference)
- [ ] `npm run check` reports no type errors
- [ ] `npm run test` passes with all tests discovered and passing under `src/`

## Risks and Edge Cases

- **vitest double-discovery:** If `__tests__/` patterns are removed before all files are deleted, vitest could still find the old files. The safe order is: delete files first, then update config, then run tests. However, since both old and new test files define the same `describe` blocks, running them together would produce duplicate test names — confirm this by checking `npm run test` output for any "test already exists" warnings before and after the change.
- **tsconfig includes test files:** `tsconfig.json` currently includes `__tests__/**/*.ts`, meaning TypeScript type-checks the old test files too. Removing this entry should not cause errors since the collocated tests under `src/` are already covered by `"src/**/*.ts"`.
- **Step 2 deleted files early:** Step 2's review noted that 5 files (`queues.test.ts`, `transition.test.ts`, `next-task.test.ts`, `validation.test.ts`, `turn-guard.test.ts`) were deleted during Step 2 instead of being preserved. Account for this — only 9 files remain, not the original 14.
