# Tests: Implement infrastructure-managed completion in evolve-plan

## Unit Tests

### File: `src/capabilities/evolve-plan.test.ts`

**Test runner:** Vitest (existing test file, add new describe block)

Add a new `describe("validateAndFindNextStep with frontmatter-based completion")` block containing the following test cases.

#### Helper setup

Create a helper that builds a goal tree with PLAN.md containing YAML frontmatter:

```
function createGoalTreeWithFrontmatter(
  tempDir: string,
  goalName: string,
  totalSteps: number,
  options?: { stepFolders?: Array<{ stepNumber: number; approved: boolean }>; withCompleted?: boolean },
): string
```

This creates PLAN.md with `---\ntotalSteps: N\n---` frontmatter and optionally creates S{NN}/ folders with or without APPROVED markers.

#### Test cases

1. **describe("frontmatter-based completion detection"):**

   - **"writes COMPLETED and returns not-ready when currentStepNumber() > totalSteps"**
     - Arrange: Goal with `totalSteps: 3` frontmatter, S01/, S02/, S03/ all with APPROVED markers (so `currentStepNumber()` returns 4). No existing COMPLETED file.
     - Act: Call `validateAndFindNextStep(goalName, tempDir)`
     - Assert: `result.ready` is `false`; COMPLETED file exists at goal root; error message mentions "all steps" or "specified"

   - **"returns not-ready when all steps are defined but current step exceeds totalSteps"**
     - Arrange: Goal with `totalSteps: 2` frontmatter, S01/ and S02/ exist without APPROVED markers (both have TASK.md + TEST.md). No COMPLETED.
     - Note: `currentStepNumber()` returns 1 here (first non-APPROVED), which is ≤ 2. This should NOT trigger completion. This test verifies the boundary — normal flow continues when work remains.
     - Act: Call `validateAndFindNextStep(goalName, tempDir)`
     - Assert: `result.ready` is `true`; `result.stepNumber` is 1; COMPLETED file does NOT exist

   - **"writes COMPLETED for totalSteps=1 when S01/ is APPROVED"**
     - Arrange: Goal with `totalSteps: 1` frontmatter, S01/ exists with APPROVED marker. No COMPLETED.
     - Act: Call `validateAndFindNextStep(goalName, tempDir)`
     - Assert: `result.ready` is `false`; COMPLETED file exists at goal root; error mentions step count

   - **"proceeds normally when currentStepNumber() <= totalSteps"**
     - Arrange: Goal with `totalSteps: 5` frontmatter, S01/ exists without APPROVED. No COMPLETED.
     - Act: Call `validateAndFindNextStep(goalName, tempDir)`
     - Assert: `result.ready` is `true`; `result.stepNumber` is 1; COMPLETED file does NOT exist

   - **"proceeds normally when frontmatter is unavailable (null)"**
     - Arrange: Goal with PLAN.md but no YAML frontmatter (or invalid frontmatter). S01/ doesn't exist. No COMPLETED.
     - Act: Call `validateAndFindNextStep(goalName, tempDir)`
     - Assert: `result.ready` is `true`; `result.stepNumber` is 1; COMPLETED file does NOT exist

2. **describe("COMPLETED guard interaction"):**

   - **"existing COMPLETED guard still blocks relaunch"**
     - Arrange: Goal with valid frontmatter (`totalSteps: 3`), S01/S02/S03 all APPROVED, AND a pre-existing COMPLETED file at goal root.
     - Act: Call `validateAndFindNextStep(goalName, tempDir)`
     - Assert: `result.ready` is `false`; error mentions "COMPLETED" or "already specified"

   - **"new frontmatter check runs before existing COMPLETED guard (both detect completion)"**
     - Arrange: Goal with valid frontmatter (`totalSteps: 2`), S01/S02 all APPROVED, no pre-existing COMPLETED.
     - Act: Call `validateAndFindNextStep(goalName, tempDir)`
     - Assert: `result.ready` is `false`; COMPLETED file now exists (written by frontmatter check); error indicates completion

## Programmatic Verification

1. **TypeScript compilation:**
   - **What:** No type errors introduced by the change
   - **How:** `npm run check` (runs `tsc --noEmit`)
   - **Expected result:** Exit code 0, no errors

2. **Full test suite passes:**
   - **What:** All existing tests still pass, plus new tests
   - **How:** `npm test` (runs `vitest run`)
   - **Expected result:** All tests pass, exit code 0

3. **COMPLETED file is empty:**
   - **What:** The infrastructure-written COMPLETED marker is an empty file
   - **How:** After running a test that writes COMPLETED, check: `test -s <path>/COMPLETED && echo "NOT EMPTY" || echo "EMPTY"`
   - **Expected result:** Output is "EMPTY"

## Test Order

1. Unit tests — verify the completion detection logic in isolation
2. Programmatic verification — type check and full suite pass
3. Manual COMPLETED file inspection (if needed)
