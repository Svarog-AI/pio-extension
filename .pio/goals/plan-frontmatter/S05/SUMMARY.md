# Summary: Implement infrastructure-managed completion in evolve-plan

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/evolve-plan.ts` — Added frontmatter-based completion detection in `validateAndFindNextStep()`. When `currentStepNumber() > totalSteps` from PLAN.md frontmatter, writes an empty `COMPLETED` marker and returns not-ready. Added import of `PlanFrontmatter` from `../frontmatter-schemas`.
- `src/capabilities/evolve-plan.test.ts` — Added `createGoalTreeWithFrontmatter()` helper and new `describe("validateAndFindNextStep with frontmatter-based completion")` block with 7 test cases covering completion detection, normal flow, unavailable frontmatter, and COMPLETED guard interaction.

## Files Deleted
- (none)

## Decisions Made
- **Ordering of guards:** The existing COMPLETED pre-launch guard runs before the new frontmatter check. This ensures that when COMPLETED already exists (from a previous run or agent), the existing guard message is returned. The frontmatter check only fires when COMPLETED doesn't yet exist, at which point it writes the marker. This ordering was determined by the test "existing COMPLETED guard still blocks relaunch" which expects the COMPLETED-specific error message.
- **Reused `completedPath` variable:** The frontmatter check reuses the `completedPath` variable declared by the COMPLETED guard above it, avoiding a duplicate `path.join()` call.
- **No import of `PlanFrontmatter` needed for runtime:** The type is used only for annotation (`as PlanFrontmatter | null`) to satisfy TypeScript; the actual runtime behavior relies on `state.planMetadata()` returning the correct shape from `goal-state.ts`.

## Test Coverage
- 7 new unit tests in `src/capabilities/evolve-plan.test.ts`:
  - `writes COMPLETED and returns not-ready when currentStepNumber() > totalSteps` — all 3 steps APPROVED, totalSteps=3
  - `returns not-ready when all steps are defined but current step exceeds totalSteps` — boundary test (steps defined but not approved, currentStepNumber=1 <= totalSteps=2)
  - `writes COMPLETED for totalSteps=1 when S01 is APPROVED` — single-step plan completion
  - `proceeds normally when currentStepNumber() <= totalSteps` — normal flow continues
  - `proceeds normally when frontmatter is unavailable (null)` — backward compatibility with plans without frontmatter
  - `existing COMPLETED guard still blocks relaunch` — pre-existing COMPLETED is caught by the existing guard
  - `new frontmatter check runs before existing COMPLETED guard (both detect completion)` — frontmatter check writes COMPLETED when it doesn't exist
- All 442 tests pass across 19 test files
- TypeScript type check (`tsc --noEmit`) passes with no errors
