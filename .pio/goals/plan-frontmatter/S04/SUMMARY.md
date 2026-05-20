# Summary: Add postValidate hook to create-plan capability

## Status
COMPLETED

## Files Created
- `src/capabilities/create-plan.test.ts` — 15 unit tests covering postValidate logic (valid frontmatter, malformed frontmatter, invalid totalSteps, heading count mismatch, CAPABILITY_CONFIG wiring)

## Files Modified
- `src/capabilities/create-plan.ts` — added `postValidateCreatePlan` function and wired it into `CAPABILITY_CONFIG.postValidate`; added `createGoalState` import from `../goal-state`

## Files Deleted
- (none)

## Decisions Made
- Followed the `postValidateReview` pattern from `review-task.ts` exactly: create `GoalState`, call `planMetadata({ errors: true })`, check for `.error`, return `{ success, message }`
- Used a type assertion (`as { data?: { totalSteps: number }; error?: string }`) to handle the union return type of `planMetadata({ errors: true })`, matching the pattern in `postValidateReview`
- Heading regex `/^## Step \d+:/gm` matches headings like `## Step 1:`, `## Step 12: Add schema` — the `m` flag enables `^` to match start of each line
- Error messages include specific values (expected vs actual counts) to help the Planning Agent fix issues

## Test Coverage
- 15 unit tests in `src/capabilities/create-plan.test.ts`:
  - 3 tests for valid frontmatter with matching headings (3 steps, 1 step, 12 steps)
  - 3 tests for missing/malformed frontmatter (no frontmatter, malformed YAML, no closing delimiter)
  - 5 tests for invalid totalSteps values (missing, zero, negative, float, string)
  - 3 tests for heading count mismatch (totalSteps > headings, totalSteps < headings, zero headings)
  - 1 test for CAPABILITY_CONFIG wiring (postValidate is a function)
- All 435 tests pass (including 15 new ones)
- `npm run check` (TypeScript compilation) passes with no errors
