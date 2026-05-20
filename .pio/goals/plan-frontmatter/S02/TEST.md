# Tests: Add planMetadata() to GoalState and replace totalPlanSteps()

## Unit Tests

### File: `src/goal-state.test.ts` (modify existing + add new tests)

**Test runner:** Vitest (globals mode, Node.js environment)

Use the existing test helpers (`createGoalTree`, `createTempDir`, `cleanup`) already defined in the file. Add a new helper for writing PLAN.md with frontmatter:

```
writePlanWithFrontmatter(goalDir, totalSteps: number): writes PLAN.md with ---\ntotalSteps: N\n--- frontmatter followed by markdown content
```

#### New: `planMetadata()` tests

1. **`describe("planMetadata()")`:**
   - "returns typed PlanFrontmatter when PLAN.md has valid frontmatter" — write PLAN.md with `totalSteps: 5`, assert result is `{ totalSteps: 5 }`
   - "returns null when PLAN.md does not exist" — no PLAN.md written, assert `null`
   - "returns null for PLAN.md with no frontmatter delimiters" — write plain markdown content (no `---`), assert `null`
   - "returns null for malformed YAML in frontmatter" — write `---\ninvalid: yaml: [:\n---`, assert `null`
   - "returns null when totalSteps is missing from frontmatter" — write `---\notherField: value\n---`, assert `null`
   - "returns null when totalSteps is zero" — write `---\ntotalSteps: 0\n---`, assert `null` (minimum 1)
   - "returns null when totalSteps is negative" — write `---\ntotalSteps: -3\n---`, assert `null`
   - "returns null when totalSteps is a float" — write `---\ntotalSteps: 2.5\n---`, assert `null` (must be integer)
   - "strips extra fields from frontmatter, returns only totalSteps" — write `---\ntotalSteps: 3\nextraField: value\n---`, assert result is `{ totalSteps: 3 }` with no extra key
   - "reads fresh from disk on every call (no caching)" — write frontmatter with `totalSteps: 2`, assert 2, then overwrite with `totalSteps: 7`, assert 7
   - "returns valid PlanFrontmatter for boundary value totalSteps: 1" — write `totalSteps: 1`, should return `{ totalSteps: 1 }`

2. **`describe("planMetadata({ errors: true })")`:**
   Follows the same test structure as `getReviewOutputs with { errors: true }` in the existing test file.
   - "returns `{ data }` for valid frontmatter" — write `totalSteps: 5`, assert `result.data.totalSteps === 5` and `result.error` is undefined
   - "returns `{ error }` for missing PLAN.md" — no file, assert `result.error` is a non-empty string, `result.data` is undefined
   - "returns `{ error }` for no frontmatter delimiters" — write plain markdown, assert `result.error` exists
   - "returns `{ error }` with typebox details for invalid totalSteps" — write `totalSteps: 0`, assert `result.error` contains "totalSteps"
   - "returns `{ data }` strips extra fields" — write `totalSteps: 3, extraField: value`, assert `result.data` is `{ totalSteps: 3 }`

3. **`describe("suppress console.warn in errors mode")`:**
   Follows the existing `suppress console.warn in errors mode` test for `getReviewOutputs()`.
   - "no console.warn when errors=true and file is missing" — spy on `console.warn`, call `planMetadata({ errors: true })` with no PLAN.md, assert spy was not called
   - "console.warn IS called without errors option and file is missing" — spy on `console.warn`, call `planMetadata()` with no PLAN.md, assert spy was called once

#### Updated: `totalPlanSteps()` tests

The existing `totalPlanSteps()` tests use `writePlan()` which writes headings without frontmatter. These must be updated:

4. **`describe("totalPlanSteps()")` (updated):**
   - "returns totalSteps from PLAN.md frontmatter" — write PLAN.md with frontmatter `totalSteps: 3`, assert `3`. (Replaces the heading-based test)
   - "returns undefined when PLAN.md does not exist" — no change needed, still passes
   - "returns undefined for PLAN.md with no frontmatter" — write plain markdown without frontmatter, assert `undefined`. (Replaces "no step headings" test)
   - "returns undefined for invalid frontmatter totalSteps" — write `totalSteps: 0`, assert `undefined`
   - Remove the "handles non-sequential step numbers" test — heading parsing is gone; this behavior no longer applies

5. **Update the construction smoke test:**
   - In `createGoalState — construction`, the "all methods execute without throwing" test calls every method. Add `planMetadata()` to the list and assert it returns `null` on empty directory.
   - The existing `expect(state.totalPlanSteps()).toBeUndefined()` assertion remains valid (no PLAN.md → undefined).

## Programmatic Verification

- **What:** TypeScript compilation passes with no type errors
- **How:** `npx tsc --noEmit`
- **Expected result:** Exit code 0, no output errors

- **What:** Old heading-parsing regex is removed from goal-state.ts
- **How:** `grep -c "Step \\\\d+\\|## Step" src/goal-state.ts`
- **Expected result:** No matches (exit code 1 from grep, meaning the pattern is absent)

- **What:** `PLAN_FRONTMATTER_SCHEMA` import exists in goal-state.ts
- **How:** `grep "PLAN_FRONTMATTER_SCHEMA" src/goal-state.ts`
- **Expected result:** At least one match (import + usage)

- **What:** Full test suite passes with no regressions
- **How:** `npm test`
- **Expected result:** All tests pass, exit code 0

## Test Order

1. Write and run the new `planMetadata()` unit tests first — they verify the core new functionality in isolation
2. Update `totalPlanSteps()` tests to use frontmatter-based PLAN.md files — these verify the delegation works correctly
3. Run full test suite (`npm test`) — confirms no regressions across all ~402 existing tests
4. Run `npx tsc --noEmit` — confirms type correctness
