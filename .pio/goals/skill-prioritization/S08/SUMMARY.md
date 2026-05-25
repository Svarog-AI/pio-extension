# Summary: Consume TASK.md skills in prepareSession (execute-task, review-task)

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/goal-state.ts` — added `taskSkills()` method to `StepStatus` interface; implemented it inside `createStepStatus()` factory; imported `TASK_FRONTMATTER_SCHEMA`, `TaskFrontmatter`, and `TaskSkills` from `frontmatter-schemas.ts`
- `src/fs-utils.ts` — added `mergeCapabilitySkills()` pure utility function; imported `CapabilitySkills` from `types.ts` and `TaskSkills` from `frontmatter-schemas.ts`
- `src/capabilities/session-capability.ts` — added `setMergedSkills()` export for `prepareSession` hooks to set merged skills on the current config
- `src/capabilities/execute-task.ts` — added `prepareExecuteSession` hook that reads TASK.md skills via `StepStatus.taskSkills()` and merges with base skills; imported `setMergedSkills` and `mergeCapabilitySkills`; wired `prepareSession` into `CAPABILITY_CONFIG`
- `src/capabilities/review-task.ts` — updated `prepareReviewSession` to also read TASK.md skills and merge with base skills; imported `setMergedSkills` and `mergeCapabilitySkills`
- `src/goal-state.test.ts` — added 11 test cases for `StepStatus.taskSkills()` (valid skills, mandatory-only, recommended-only, no skills key, empty frontmatter, missing file, malformed YAML, invalid schema, no caching, pending step, no-throw)
- `src/fs-utils.test.ts` — added 9 test cases for `mergeCapabilitySkills()` (dedup mandatory, dedup recommended, null task, undefined base, empty inputs, full merge, no mutation, order preservation, malformed input)
- `src/state-machine.test.ts` — added `taskSkills: () => null` to mock step object
- `src/capability-config.test.ts` — updated tests to expect `prepareSession` to be defined for both `execute-task` and `review-task`

## Files Deleted
- (none)

## Decisions Made
- **`mergeCapabilitySkills` placed in `fs-utils.ts`:** Pure merge utility operating on typed objects. Doesn't access the filesystem. Its placement is correct as a general-purpose helper.
- **`setMergedSkills` added to `session-capability.ts`:** Allows `prepareSession` hooks to set merged skills on `currentConfig` before `before_agent_start` runs `buildSkillLoadingSection()`.
- **`taskSkills()` returns `null` (not `undefined`):** Consistent with other `StepStatus` methods that return `null` on absence. `prepareSession` hooks check truthiness, which handles both.
- **Plan deviation from PLAN.md:** The plan suggested a "shared helper" in `fs-utils.ts`. Instead, `readTaskFrontmatterSkills` logic lives on `StepStatus.taskSkills()` — the single source of truth for per-step state (matching `hasTask()`, `status()`, `getMetadata()`).

## User-Requested Changes
- (none)

## Test Coverage
- 11 new tests for `StepStatus.taskSkills()` covering: valid skills (both mandatory and recommended), mandatory-only, recommended-only, no skills key, empty frontmatter, missing file, malformed YAML, invalid schema, lazy evaluation (no caching), pending steps, and error resilience (never throws).
- 9 new tests for `mergeCapabilitySkills()` covering: mandatory dedup, recommended first-seen-wins dedup, null/undefined handling, empty inputs, full merge, input immutability, order preservation, and malformed input resilience.
- All 735 existing tests pass with no regressions.
- `npx tsc --noEmit` reports no errors.
