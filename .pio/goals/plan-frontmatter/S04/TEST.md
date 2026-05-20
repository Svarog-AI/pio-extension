# Tests: Add postValidate hook to create-plan capability

## Unit Tests

**File:** `src/capabilities/create-plan.test.ts` (new, colocated)
**Test runner:** Vitest — global `describe/it/expect`, Node.js environment
**Setup:** Use `fs.mkdtempSync(path.join(os.tmpdir(), "pio-create-plan-test-"))` for temp directories. Create goal workspace tree with `GOAL.md` and `PLAN.md`. Clean up with `fs.rmSync` in `afterEach`.

### describe("postValidateCreatePlan — valid frontmatter and matching headings")

- **Test:** "returns success when totalSteps matches heading count (3 steps)"
  - Arrange: Create PLAN.md with frontmatter `totalSteps: 3` and exactly 3 `## Step N:` headings
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: true }`

- **Test:** "returns success when totalSteps matches heading count (1 step)"
  - Arrange: Create PLAN.md with frontmatter `totalSteps: 1` and exactly 1 `## Step N:` heading
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: true }`

- **Test:** "returns success with large step numbers (e.g. 12 steps)"
  - Arrange: Create PLAN.md with frontmatter `totalSteps: 12` and exactly 12 `## Step N:` headings (Step 1 through Step 12)
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: true }`

### describe("postValidateCreatePlan — missing or malformed frontmatter")

- **Test:** "returns failure when PLAN.md has no frontmatter"
  - Arrange: Create PLAN.md with content starting directly with `# Plan:` (no `---` delimiters)
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: false }`, `result.message` contains a reference to frontmatter

- **Test:** "returns failure when frontmatter YAML is malformed"
  - Arrange: Create PLAN.md with `---\ntotalSteps\n---` (invalid YAML — no colon)
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: false }`, `result.message` contains a reference to frontmatter or parsing

- **Test:** "returns failure when frontmatter block has no closing delimiter"
  - Arrange: Create PLAN.md with `---\ntotalSteps: 3\n# Plan:` (no closing `---`)
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: false }`

### describe("postValidateCreatePlan — invalid totalSteps value")

- **Test:** "returns failure when totalSteps is missing"
  - Arrange: Create PLAN.md with frontmatter `---\notherField: value\n---` (no totalSteps)
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: false }`, `result.message` mentions `totalSteps`

- **Test:** "returns failure when totalSteps is zero"
  - Arrange: Create PLAN.md with frontmatter `---\ntotalSteps: 0\n---`
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: false }`

- **Test:** "returns failure when totalSteps is negative"
  - Arrange: Create PLAN.md with frontmatter `---\ntotalSteps: -1\n---`
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: false }`

- **Test:** "returns failure when totalSteps is a float"
  - Arrange: Create PLAN.md with frontmatter `---\ntotalSteps: 3.5\n---`
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: false }`

- **Test:** "returns failure when totalSteps is a string"
  - Arrange: Create PLAN.md with frontmatter `---\ntotalSteps: "three"\n---`
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: false }`

### describe("postValidateCreatePlan — totalSteps vs heading count mismatch")

- **Test:** "returns failure when totalSteps > actual heading count"
  - Arrange: Create PLAN.md with frontmatter `totalSteps: 5` but only 2 `## Step N:` headings
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: false }`, `result.message` contains both numbers (expected vs actual)

- **Test:** "returns failure when totalSteps < actual heading count"
  - Arrange: Create PLAN.md with frontmatter `totalSteps: 2` but 5 `## Step N:` headings
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: false }`, `result.message` contains both numbers (expected vs actual)

- **Test:** "returns failure when there are zero headings but totalSteps is positive"
  - Arrange: Create PLAN.md with frontmatter `totalSteps: 3` and no `## Step N:` headings at all
  - Act: Call `CAPABILITY_CONFIG.postValidate!(goalDir)`
  - Assert: Result is `{ success: false }`

### describe("postValidateCreatePlan — CAPABILITY_CONFIG wiring")

- **Test:** "postValidate is defined on CAPABILITY_CONFIG"
  - Arrange: None needed
  - Act: Check `typeof CAPABILITY_CONFIG.postValidate`
  - Assert: Equals `"function"`

## Programmatic Verification

- **TypeScript compilation:** Run `npm run check` — must pass with no type errors. The new imports (`extractFrontmatter`, `PLAN_FRONTMATTER_SCHEMA`) and the `postValidate` property on `CAPABILITY_CONFIG` must all resolve correctly.
  - **Command:** `npm run check`
  - **Expected result:** Exit code 0, no errors

- **Existing tests pass:** Run full test suite to verify no regressions.
  - **Command:** `npm test`
  - **Expected result:** All existing tests pass

- **postValidate property exists on config:** Verify the hook is wired.
  - **Command:** `grep -c "postValidate:" src/capabilities/create-plan.ts`
  - **Expected result:** Returns `1` (exactly one postValidate assignment)

- **Required imports are present:** Verify `createGoalState` is imported.
  - **Command:** `grep "createGoalState" src/capabilities/create-plan.ts`
  - **Expected result:** Non-empty output (exit code 0) — the function uses `createGoalState(goalDir).planMetadata({ errors: true })`, not raw frontmatter utilities.

## Test Order

1. Unit tests: `npm test -- src/capabilities/create-plan.test.ts` — verify postValidate logic in isolation
2. Programmatic verification: `npm run check` — TypeScript compilation
3. Programmatic verification: `npm test` — full suite for regression check
4. Programmatic verification: `grep` checks — confirm imports and wiring
