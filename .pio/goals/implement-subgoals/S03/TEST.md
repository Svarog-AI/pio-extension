# Tests: Plan frontmatter with per-step metadata and enriched StepStatus

## Unit Tests

### File: `src/capabilities/create-plan.test.ts` (colocated, Vitest)

Extend existing `postValidateCreatePlan` test suites with new describe blocks for the `steps` array validation.

**Test helper:** Add a helper to generate PLAN.md content with a `steps` frontmatter array, e.g., `makePlanContentWithSteps(totalSteps, stepsArray, headingCount)`. This should produce:
```yaml
---
totalSteps: N
steps:
  - name: first-step
  - name: second-step
    complexity: subgoal
  - name: third-step
---
```

**Important:** Existing test fixtures that write PLAN.md with only `totalSteps` (no `steps`) must be updated to include a valid `steps` array. Plans without `steps` will now fail TypeBox schema validation — this is the correct behavior. Any test that expects a plan to validate should provide `steps`.

#### `describe("postValidateCreatePlan — steps array is required")`

- **Test case:** "rejects when steps field is missing from frontmatter"
  - Arrange: PLAN.md with only `totalSteps: 3`, no `steps` field, and 3 headings
  - Act: Call `CAPABILITY_CONFIG.postValidate(goalDir)`
  - Assert: `{ success: false }` with message referencing the missing `steps` field

#### `describe("postValidateCreatePlan — steps array validation")`

- **Test case:** "passes when steps array length matches totalSteps"
  - Arrange: PLAN.md with `totalSteps: 3`, `steps: [{name:"a"},{name:"b"},{name:"c"}]`, and 3 headings
  - Act: Call `CAPABILITY_CONFIG.postValidate(goalDir)`
  - Assert: `{ success: true }`

- **Test case:** "passes when steps entries omit complexity (defaults to task)"
  - Arrange: PLAN.md with `steps: [{name:"step-one"},{name:"step-two"}]`, no `complexity` fields, matching headings
  - Act: Call postValidate
  - Assert: `{ success: true }`

- **Test case:** "passes when steps entries include complexity: 'task'"
  - Arrange: PLAN.md with `steps: [{name:"a", complexity:"task"},{name:"b", complexity:"task"}]`, matching headings
  - Act: Call postValidate
  - Assert: `{ success: true }`

- **Test case:** "passes when steps entries include complexity: 'subgoal'"
  - Arrange: PLAN.md with `steps: [{name:"a"},{name:"b", complexity:"subgoal"},{name:"c"}]`, matching headings
  - Act: Call postValidate
  - Assert: `{ success: true }`

- **Test case:** "rejects when steps array length is less than totalSteps"
  - Arrange: `totalSteps: 5` but `steps` has only 3 entries, with 5 headings
  - Act: Call postValidate
  - Assert: `{ success: false }` with message mentioning the length mismatch

- **Test case:** "rejects when steps array length is greater than totalSteps"
  - Arrange: `totalSteps: 2` but `steps` has 4 entries, with 2 headings
  - Act: Call postValidate
  - Assert: `{ success: false }` with message mentioning the length mismatch

- **Test case:** "rejects when a step entry has an empty name"
  - Arrange: `steps: [{name:"valid"},{name:""}]`, matching totalSteps and headings
  - Act: Call postValidate
  - Assert: `{ success: false }` with message referencing empty name

- **Test case:** "rejects when a step entry has an invalid complexity value"
  - Arrange: `steps: [{name:"a", complexity:"invalid"}]`, matching totalSteps and headings
  - Act: Call postValidate
  - Assert: `{ success: false }` with message referencing the invalid complexity field

---

### File: `src/goal-state.test.ts` (colocated, Vitest)

Add a new test helper to write PLAN.md with `steps` frontmatter array. Signature: `writePlanWithStepsFrontmatter(goalDir, totalSteps, stepsArray)`.

**Important:** Many existing tests in this file create PLAN.md with only `totalSteps` (e.g., `writePlanWithFrontmatter`). These plans will now fail TypeBox validation since `steps` is required. The executor must:
1. Update existing helpers or add new ones that include a valid `steps` array
2. Keep a subset of old-format test cases where the expected behavior is null/error returns (to prove graceful degradation)

#### `describe("StepStatus.getMetadata() — with valid frontmatter steps array")`

- **Test case:** "returns metadata for step 1 when frontmatter has steps array"
  - Arrange: Create goal tree with S01/, write PLAN.md with `totalSteps: 3`, `steps: [{name:"first-step"},{name:"second",complexity:"subgoal"},{name:"third"}]`
  - Act: `state.steps()[0].getMetadata()`
  - Assert: Returns `{ name: "first-step", complexity: "task" }` (defaulted)

- **Test case:** "returns metadata for step 2 with complexity subgoal"
  - Arrange: Same as above, goal tree with S01/ and S02/
  - Act: `state.steps()[1].getMetadata()`
  - Assert: Returns `{ name: "second", complexity: "subgoal" }`

- **Test case:** "maps step N to index N-1 (step 3 → index 2)"
  - Arrange: Same as above, goal tree with S03/
  - Act: `state.steps()[2].getMetadata()`
  - Assert: Returns `{ name: "third", complexity: "task" }`

- **Test case:** "returns null when step folder exists but is out of bounds of steps array"
  - Arrange: PLAN.md with `totalSteps: 2`, `steps` has only 2 entries, but S03/ folder exists on disk (step folder count can exceed frontmatter)
  - Act: `state.steps()` finds S03; call `.getMetadata()` on it
  - Assert: Returns `null`

#### `describe("StepStatus.getMetadata() — graceful degradation for old plans")`

- **Test case:** "returns null when PLAN.md has no steps field (old-format plan)"
  - Arrange: Create goal tree with S01/, write PLAN.md with only `totalSteps: 3` (no steps array)
  - Act: `state.steps()[0].getMetadata()`
  - Assert: Returns `null` — old plans don't crash, they just have no metadata

- **Test case:** "returns null when PLAN.md has no frontmatter at all"
  - Arrange: Write PLAN.md as plain markdown without `---` delimiters
  - Act: `state.steps()[0].getMetadata()`
  - Assert: Returns `null`

- **Test case:** "returns null when PLAN.md does not exist"
  - Arrange: Goal directory with S01/ but no PLAN.md
  - Act: `state.steps()[0].getMetadata()`
  - Assert: Returns `null`

#### `describe("StepStatus.getMetadata() — edge cases")`

- **Test case:** "defaults complexity to 'task' when omitted in steps entry"
  - Arrange: Valid PLAN.md with `steps: [{name:"only-name"}]` — no complexity field
  - Act: `state.steps()[0].getMetadata()`
  - Assert: `{ name: "only-name", complexity: "task" }`

- **Test case:** "reflects filesystem changes (no caching) — update PLAN.md and re-read"
  - Arrange: Write valid PLAN.md with steps array, read metadata. Overwrite with different steps array, read again.
  - Act: Call `getMetadata()` before and after overwrite
  - Assert: Returns different values reflecting the updated frontmatter

## Programmatic Verification

- **What:** TypeScript compilation passes with no errors
  - **How:** `npx tsc --noEmit`
  - **Expected result:** Exit code 0, no error output

- **What:** All tests pass (including updated fixtures)
  - **How:** `npm test` (Vitest)
  - **Expected result:** All pre-existing tests pass with updated fixtures. New tests add to the total count. Zero regressions in behavior for callers that handle null metadata gracefully.

- **What:** `StepMetadata` type is exported from `src/frontmatter-schemas.ts`
  - **How:** `grep -c "export.*StepMetadata" src/frontmatter-schemas.ts`
  - **Expected result:** Match count ≥ 1

- **What:** `PLAN_FRONTMATTER_SCHEMA` includes required `steps` in its properties
  - **How:** `grep "steps" src/frontmatter-schemas.ts`
  - **Expected result:** References to `steps` appear in the schema definition (not wrapped in `Type.Optional`)

## Test Order

1. Unit tests in `src/capabilities/create-plan.test.ts` (schema validation: missing `steps`, length mismatch, invalid entries)
2. Unit tests in `src/goal-state.test.ts` (`StepStatus.getMetadata()` behavior with and without valid frontmatter)
3. Programmatic verification: `npx tsc --noEmit`, `npm test`, file inspections
