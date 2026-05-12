# Tests: Test capability config resolution (`capability-config.test.ts`)

## Unit Tests

### File: `__tests__/capability-config.test.ts`
### Test runner: Vitest (native ESM, Node environment)

#### `describe('resolveCapabilityConfig — happy path with static config')`

Tests basic resolution where all CAPABILITY_CONFIG fields are plain values (no callbacks).

1. **it('resolves create-goal config with correct capability name and prompt')**
   - Arrange: `cwd = fs.mkdtempSync(...)`, `params = { capability: "create-goal", goalName: "my-feature" }`
   - Act: `result = await resolveCapabilityConfig(cwd, params)`
   - Assert: `result.capability === "create-goal"`, `result.prompt === "create-goal.md"`

2. **it('resolves create-plan config with correct prompt and validation')**
   - Arrange: `cwd = fs.mkdtempSync(...)`, `params = { capability: "create-plan", goalName: "my-feature" }`
   - Act: `result = await resolveCapabilityConfig(cwd, params)`
   - Assert: `result.prompt === "create-plan.md"`, `result.validation.files.includes("PLAN.md")`

3. **it('derives workingDir from goalName (goal-scoped)')**
   - Arrange: `cwd = "/tmp/test-proj"`, `params = { capability: "create-goal", goalName: "my-feature" }`
   - Act: `result = await resolveCapabilityConfig(cwd, params)`
   - Assert: `result.workingDir === path.join("/tmp/test-proj", ".pio", "goals", "my-feature")`

4. **it('falls back to cwd when no goalName (project-scoped)')**
   - Arrange: `cwd = "/tmp/test-proj"`, `params = { capability: "create-goal" }` (no goalName)
   - Act: `result = await resolveCapabilityConfig(cwd, params)`
   - Assert: `result.workingDir === "/tmp/test-proj"`

#### `describe('resolveCapabilityConfig — session name derivation')`

5. **it('derives session name with goal + capability (no step)')**
   - Arrange: `params = { capability: "create-plan", goalName: "my-feature" }`
   - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
   - Assert: `result.sessionName === "my-feature create-plan"`

6. **it('derives session name with step number')**
   - Arrange: `params = { capability: "execute-task", goalName: "my-feature", stepNumber: 3 }`
   - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
   - Assert: `result.sessionName === "my-feature execute-task s3"`

7. **it('derives session name without goalName (capability only)')**
   - Arrange: `params = { capability: "create-goal" }`
   - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
   - Assert: `result.sessionName === "create-goal"`

#### `describe('resolveCapabilityConfig — initial message derivation')`

8. **it('uses defaultInitialMessage when no params.initialMessage')**
   - Arrange: `cwd = "/tmp/proj"`, `params = { capability: "create-goal", goalName: "my-feature" }`
   - Act: `result = await resolveCapabilityConfig(cwd, params)`
   - Assert: `typeof result.initialMessage === "string" && result.initialMessage.length > 0 && result.initialMessage.includes(".pio")`

9. **it('uses explicit params.initialMessage over defaultInitialMessage')**
   - Arrange: `cwd = "/tmp/proj"`, `params = { capability: "create-goal", goalName: "my-feature", initialMessage: "custom message" }`
   - Act: `result = await resolveCapabilityConfig(cwd, params)`
   - Assert: `result.initialMessage === "custom message"`

10. **it('defaultInitialMessage contains workingDir path info')**
    - Arrange: `cwd = "/tmp/proj"`, `params = { capability: "create-plan", goalName: "my-feature" }`
    - Act: `result = await resolveCapabilityConfig(cwd, params)`
    - Assert: `result.initialMessage.includes("my-feature") && result.initialMessage.includes(".pio")`

#### `describe('resolveCapabilityConfig — step-dependent callback resolution')`

Tests that function callbacks for `validation`, `readOnlyFiles`, and `writeAllowlist` are invoked correctly.

11. **it('invokes evolve-plan validation callback with correct stepNumber')**
    - Arrange: `params = { capability: "evolve-plan", goalName: "my-feature", stepNumber: 3 }`
    - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
    - Assert: `result.validation.files.includes("S03/TASK.md") && result.validation.files.includes("S03/TEST.md")`

12. **it('invokes evolve-plan writeAllowlist callback with correct stepNumber')**
    - Arrange: `params = { capability: "evolve-plan", goalName: "my-feature", stepNumber: 5 }`
    - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
    - Assert: `result.writeAllowlist.includes("S05/TASK.md") && result.writeAllowlist.includes("S05/TEST.md")`

13. **it('invokes execute-task validation callback (checks for SUMMARY.md)')**
    - Arrange: `params = { capability: "execute-task", goalName: "my-feature", stepNumber: 2 }`
    - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
    - Assert: `result.validation.files.includes("S02/SUMMARY.md")`

14. **it('invokes execute-task readOnlyFiles callback')**
    - Arrange: `params = { capability: "execute-task", goalName: "my-feature", stepNumber: 1 }`
    - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
    - Assert: `result.readOnlyFiles.includes("S01/TASK.md") && result.readOnlyFiles.includes("S01/TEST.md")`

15. **it('invokes review-code writeAllowlist callback (REVIEW.md + APPROVED)')**
    - Arrange: `params = { capability: "review-code", goalName: "my-feature", stepNumber: 4 }`
    - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
    - Assert: `result.writeAllowlist.includes("S04/REVIEW.md") && result.writeAllowlist.includes("S04/APPROVED")`

#### `describe('resolveCapabilityConfig — graceful error handling')`

16. **it('returns undefined when capability param is missing')**
    - Arrange: `params = { goalName: "my-feature" }` (no capability)
    - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
    - Assert: `result === undefined`

17. **it('returns undefined when params is undefined')**
    - Arrange: call with no params
    - Act: `result = await resolveCapabilityConfig("/tmp/proj")`
    - Assert: `result === undefined`

18. **it('returns undefined for unknown capability name')**
    - Arrange: `params = { capability: "nonexistent-capability", goalName: "my-feature" }`
    - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
    - Assert: `result === undefined`

19. **it('preserves sessionParams in result')**
    - Arrange: `params = { capability: "create-goal", goalName: "my-feature", customField: "value" }`
    - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
    - Assert: `result.sessionParams.customField === "value"`

#### `describe('resolveCapabilityConfig — static config passthrough')`

20. **it('passes through static validation (create-goal has files: ["GOAL.md"])')**
    - Arrange: `params = { capability: "create-goal", goalName: "my-feature" }`
    - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
    - Assert: `JSON.stringify(result.validation) === JSON.stringify({ files: ["GOAL.md"] })`

21. **it('passes through static writeAllowlist (create-goal has ["GOAL.md"])')**
    - Arrange: `params = { capability: "create-goal", goalName: "my-feature" }`
    - Act: `result = await resolveCapabilityConfig("/tmp/proj", params)`
    - Assert: `JSON.stringify(result.writeAllowlist) === JSON.stringify(["GOAL.md"])`

## Programmatic Verification

- **What:** All tests pass with `npm test`
  - **How:** `npx vitest run __tests__/capability-config.test.ts`
  - **Expected result:** Exit code 0, all 21 tests passing, no failures

- **What:** TypeScript type checking passes
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no type errors

- **What:** Test file imports resolve correctly
  - **How:** `grep 'resolveCapabilityConfig' __tests__/capability-config.test.ts`
  - **Expected result:** Import from `"../src/utils"` is present and correct

## Test Order

1. Happy path with static config (tests 1–4) — establishes baseline resolution works
2. Session name derivation (tests 5–7) — verifies derived fields without step complexity
3. Initial message derivation (tests 8–10) — tests both explicit and default paths
4. Step-dependent callback resolution (tests 11–15) — most complex scenario, requires prior tests to pass first
5. Graceful error handling (tests 16–19) — negative tests independent of happy path
6. Static config passthrough (tests 20–21) — verify non-callback fields pass through unchanged
