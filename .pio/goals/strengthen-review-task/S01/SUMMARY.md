# Summary: Rename `review-code` → `review-task` everywhere

## Status
COMPLETED

## Files Created
- (none — all files were renamed, not created)

## Files Renamed
- `src/capabilities/review-code.ts` → `src/capabilities/review-task.ts`
- `src/prompts/review-code.md` → `src/prompts/review-task.md` (content unchanged)
- `src/capabilities/review-code.test.ts` → `src/capabilities/review-task.test.ts`

## Files Modified
- `src/capabilities/review-task.ts` — Updated all identifiers: `setupReviewCode` → `setupReviewTask`, `handleReviewCode` → `handleReviewTask`, `pio_review_code` → `pio_review_task`, `pio-review-code` → `pio-review-task`, capability name string `"review-code"` → `"review-task"`, prompt `"review-code.md"` → `"review-task.md"`, error messages, and command registration
- `src/capabilities/review-task.test.ts` — Updated import paths from `./review-code` to `./review-task`
- `src/state-machine.ts` — Renamed `transitionReviewCode` → `transitionReviewTask`, updated `resolveTransition` switch case, updated `transitionExecuteTask` target capability, updated JSDoc comments
- `src/guards/validation.ts` — Changed `capabilityForAutomation === "review-code"` → `"review-task"`
- `src/index.ts` — Updated import path and function call from `setupReviewCode` to `setupReviewTask`
- `src/skills/pio/SKILL.md` — Updated workflow lifecycle description, cycle description, and command table references
- `src/state-machine.test.ts` — Updated all capability name strings, describe block labels, and test assertions
- `src/guards/validation.test.ts` — Updated describe block label
- `src/capability-config.test.ts` — Updated capability name strings in test params, assertions, and describe blocks
- `src/model-config.test.ts` — Updated capability name string in test assertion and describe block
- `src/goal-state.test.ts` — Updated capability name string in test fixture data

## Files Deleted
- (none — files were renamed, not deleted)

## Decisions Made
- Used `sed` for bulk string replacement in test files with many occurrences (state-machine.test.ts, capability-config.test.ts, validation.test.ts, model-config.test.ts, goal-state.test.ts) to avoid overlapping edit issues
- Used precise `edit` tool for the main source files (review-task.ts, state-machine.ts, validation.ts, index.ts, SKILL.md) where context-aware replacement was needed
- Prompt file content was not modified (content changes belong to Step 2)

## Test Coverage
- All 310 existing tests pass with no regressions (`npx vitest run`)
- TypeScript type checking passes with no errors (`npx tsc --noEmit`)
- No remaining references to `review-code` in `src/` (verified via `grep -r "review-code" src/`)
- All three renamed files exist on disk, old files are gone
