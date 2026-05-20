# Tests: Support explicit workingDir override in resolveCapabilityConfig

## Unit Tests

**File:** `src/capability-config.test.ts`  
**Test runner:** Vitest (globals enabled)

Add a new `describe` block for the explicit `workingDir` override behavior. Place it near the existing "resolveCapabilityConfig — happy path with static config" section since it tests the same function's `workingDir` derivation.

### Test cases

1. **`explicit workingDir overrides goalName-based derivation`**
   - Arrange: `cwd = "/tmp/proj"`, `params = { capability: "finalize-goal", goalName: "my-feature", workingDir: "/explicit/path" }`
   - Act: Call `resolveCapabilityConfig(cwd, params)`
   - Assert: `result.workingDir` is exactly `"/explicit/path"` (NOT `/tmp/proj/.pio/goals/my-feature`)

2. **`goalName-based derivation still works when workingDir is absent`**
   - Arrange: `cwd = "/tmp/proj"`, `params = { capability: "create-plan", goalName: "my-feature" }`
   - Act: Call `resolveCapabilityConfig(cwd, params)`
   - Assert: `result.workingDir` equals `/tmp/proj/.pio/goals/my-feature` (existing behavior preserved)

3. **`fallback to cwd when neither workingDir nor goalName is present`**
   - Arrange: `cwd = "/tmp/proj"`, `params = { capability: "project-context" }`
   - Act: Call `resolveCapabilityConfig(cwd, params)`
   - Assert: `result.workingDir` equals `/tmp/proj` (existing behavior preserved)

4. **`empty string workingDir does not override goalName derivation`**
   - Arrange: `cwd = "/tmp/proj"`, `params = { capability: "finalize-goal", goalName: "my-feature", workingDir: "" }`
   - Act: Call `resolveCapabilityConfig(cwd, params)`
   - Assert: `result.workingDir` equals `/tmp/proj/.pio/goals/my-feature` (empty string treated as absent)

## Programmatic Verification

- **What:** TypeScript type checking passes with no errors after the modification
- **How:** Run `npm run check` (`tsc --noEmit`)
- **Expected result:** Exit code 0, no type errors

- **What:** Full test suite passes (existing tests + new tests)
- **How:** Run `npm test` (`vitest run`)
- **Expected result:** Exit code 0, all tests pass including the 4 new test cases and existing `capability-config.test.ts` tests

## Test Order

1. Unit tests in `capability-config.test.ts` (new `describe` block + verify existing tests still pass)
2. Programmatic verification: `npm run check`
3. Full suite: `npm test`
