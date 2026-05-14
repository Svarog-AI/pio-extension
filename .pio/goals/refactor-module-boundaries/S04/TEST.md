# Tests: Extract `src/capability-config.ts` + update dependent tests

## Unit Tests

No new unit tests are created. This step is a pure extraction — `resolveCapabilityConfig()` is moved verbatim with no behavioral changes. The existing test suite provides comprehensive coverage (34 tests across 3 files).

### `__tests__/capability-config.test.ts` (21 tests, import updated)

**File:** `__tests__/capability-config.test.ts`  
**Test runner:** Vitest (`npm test`)  
**Import change:** `resolveCapabilityConfig` from `../src/utils` → `../src/capability-config`

**Test cases (all existing, no changes to logic):**
- `describe("resolveCapabilityConfig — happy path with static config")`: 4 tests verifying capability name/prompt resolution, workingDir derivation from goalName, and fallback to cwd when no goalName
- `describe("resolveCapabilityConfig — session name derivation")`: 3 tests verifying session name formatting (with goal+capability, with step number, capability-only)
- `describe("resolveCapabilityConfig — initial message derivation")`: 3 tests verifying default vs. explicit initialMessage handling and workingDir path inclusion
- `describe("resolveCapabilityConfig — step-dependent callback resolution")`: 5 tests verifying callback invocation for evolve-plan (validation/writeAllowlist with correct stepNumber), execute-task (validation/readOnlyFiles), and review-code (writeAllowlist)
- `describe("resolveCapabilityConfig — graceful error handling")`: 4 tests verifying undefined return on missing capability param, undefined params, unknown capability name, and sessionParams passthrough
- `describe("resolveCapabilityConfig — static config passthrough")`: 2 tests verifying static validation and writeAllowlist pass through unchanged for create-goal

### `__tests__/session-capability.test.ts` (4 tests, import updated)

**File:** `__tests__/session-capability.test.ts`  
**Test runner:** Vitest (`npm test`)  
**Import change:** `resolveCapabilityConfig` from `../src/utils` → `../src/capability-config`

**Test cases (all existing, no changes to logic):**
- `describe("backward compatibility — capabilities without prepareSession")`: 4 tests verifying create-goal, create-plan, execute-task return undefined `prepareSession`, while review-code returns a defined callback function

### `__tests__/types.test.ts` (9 tests, partial import updated)

**File:** `__tests__/types.test.ts`  
**Test runner:** Vitest (`npm test`)  
**Import change:** `resolveCapabilityConfig` from `../src/utils` → `../src/capability-config`. Type imports (`PrepareSessionCallback`, `StaticCapabilityConfig`, `CapabilityConfig`) remain from `../src/types`

**Test cases (all existing, no changes to logic):**
- `describe("PrepareSessionCallback")`: 2 compile-time type verification tests (sync + async callback signatures)
- `describe("StaticCapabilityConfig.prepareSession")`: 3 tests verifying optional field behavior and inline arrow function acceptance
- `describe("CapabilityConfig.prepareSession")`: 2 tests verifying resolved config type compatibility
- `describe("resolveCapabilityConfig — prepareSession")`: 2 tests verifying prepareSession is undefined for create-goal and defined only for review-code across all capabilities

## Programmatic Verification

- **TypeScript compilation**: Run `npm run check` (`tsc --noEmit`). Expected result: zero TypeScript errors. This verifies the new module, re-export chain, and updated test imports all type-check correctly.
- **File existence — new module**: Verify `src/capability-config.ts` exists on disk. Command: `test -f src/capability-config.ts && echo "PASS"` or equivalent. Expected result: file exists.
- **File content — correct exports**: Verify `src/capability-config.ts` exports the expected symbols. Command: `grep -c 'export.*resolveCapabilityConfig' src/capability-config.ts`. Expected result: at least 1 match.
- **File content — correct imports in new module**: Verify `src/capability-config.ts` imports from `./fs-utils`. Command: `grep 'from "./fs-utils"' src/capability-config.ts`. Expected result: non-empty output containing `resolveGoalDir` and `deriveSessionName`.
- **Re-export verification in utils.ts**: Verify `src/utils.ts` re-exports from `./capability-config`. Command: `grep 'from "./capability-config"' src/utils.ts`. Expected result: non-empty output.
- **No stale imports in test files**: Verify no test file still imports `resolveCapabilityConfig` from `../src/utils`. Command: `grep -r "resolveCapabilityConfig.*from.*\.\./src/utils" __tests__/`. Expected result: zero matches (empty output).
- **Full test suite — no regressions**: Run `npm test`. Expected result: all 219 tests pass across all 14 test files with zero failures.

## Test Order

1. Write `src/capability-config.ts` (move code from utils.ts)
2. Update `src/utils.ts` (remove function, add re-exports)
3. Run `npm run check` — verify the new module compiles correctly before touching tests
4. Update imports in all three test files
5. Run individual test files: `npm test __tests__/capability-config.test.ts`, `npm test __tests__/session-capability.test.ts`, `npm test __tests__/types.test.ts`
6. Run full suite: `npm test` — verify zero regressions across all 14 test files
