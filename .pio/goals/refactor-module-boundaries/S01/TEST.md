# Tests: Extract `src/transitions.ts` + update dependent tests

## Unit Tests

No new unit tests are needed. The transition system is already fully covered by existing test files. This step moves code and updates imports — the tests validate that extraction preserves behavior.

### Existing tests to verify (updated import paths)

#### `__tests__/transition.test.ts` (import path changed)
- **What:** Comprehensive tests for `CAPABILITY_TRANSITIONS` structure, `resolveNextCapability()` logic, and various transition paths
- **Import change:** Transition symbols from `../src/transitions`, `stepFolderName` stays from `../src/utils`
- **Coverage includes:**
  - `describe("CAPABILITY_TRANSITIONS structure")`: Verifies all 5 capability keys exist with correct value types (string vs function)
  - `describe("resolveNextCapability — create-goal → create-plan")`: String transition preserves params, handles undefined params
  - `describe("resolveNextCapability — create-plan → evolve-plan")`: String transition with params preservation
  - `describe("resolveNextCapability — evolve-plan → execute-task")`: Callback transition with/without stepNumber in params
  - `describe("resolveNextCapability — execute-task → review-code")`: Callback transition with/without stepNumber
  - `describe("resolveNextCapability — review-code (approval path)")`: File-system-dependent: APPROVED marker → evolve-plan with incremented stepNumber
  - `describe("resolveNextCapability — review-code (rejection path)")`: Missing APPROVED → execute-task; no stepNumber fallback
  - `describe("resolveNextCapability — review-code (REJECTED marker routing)")`: REJECTED takes precedence over APPROVED
  - `describe("resolveNextCapability — unknown capabilities")`: Returns undefined for unknown/empty capability names
  - `describe("TransitionResult shape consistency")`: String transitions wrap in TransitionResult; callback results pass through unchanged; params immutability

#### `__tests__/smoke.test.ts` (no changes)
- **What:** Import resolution smoke test — verifies ESM + TypeScript module resolution works correctly
- **No import changes needed** — still imports `stepFolderName` from `../src/utils`

#### `__tests__/execute-task-initial-message.test.ts` (no changes)
- **What:** Tests execute-task's `defaultInitialMessage` — indirectly validates `stepFolderName` from the unchanged import location

#### `__tests__/review-code-config.test.ts` (no changes)
- **What:** Tests review-code config — indirectly validates `stepFolderName` from the unchanged import location, including zero-padding (`stepFolderName(5) → "S05"`)

## Programmatic Verification

### TypeScript type check
- **What:** All TypeScript files compile without errors after extraction and import changes
- **How:** `npm run check` (runs `tsc --noEmit`)
- **Expected result:** Zero errors, exit code 0

### Verify `src/transitions.ts` exports all required symbols
- **What:** The new module exports exactly the 5 expected symbols (NOT stepFolderName)
- **How:** Verify each symbol: `grep 'export' src/transitions.ts | grep -E '(TransitionContext|TransitionResult|CapabilityTransitionResolver|CAPABILITY_TRANSITIONS|resolveNextCapability)'`
- **Expected result:** All 5 symbols appear in export statements; `stepFolderName` does NOT

### Verify `src/transitions.ts` imports stepFolderName from utils
- **What:** The temporary dependency on utils is correctly established
- **How:** `grep 'stepFolderName' src/transitions.ts`
- **Expected result:** Import statement referencing `"./utils"` (or `from "../utils"` if relative)

### Verify `src/utils.ts` re-exports from `./transitions`
- **What:** Re-export lines exist and reference `./transitions`
- **How:** `grep 'from "./transitions"' src/utils.ts`
- **Expected result:** At least 2 lines (one for value exports, one for type exports) referencing `"./transitions"`

### Verify `stepFolderName` still defined in `src/utils.ts`
- **What:** stepFolderName was NOT extracted — it remains in utils until Step 3
- **How:** `grep -n 'export function stepFolderName' src/utils.ts`
- **Expected result:** One match — the original definition is still present

### Verify no transition symbols remain defined in `src/utils.ts`
- **What:** The extracted symbols are no longer *defined* in utils.ts (only re-exported)
- **How:** `grep -n 'function resolveNextCapability\|const CAPABILITY_TRANSITIONS' src/utils.ts`
- **Expected result:** No matches — only re-exports should exist, not original definitions

### Run transition tests independently
- **What:** Transition tests pass when run in isolation (proves cross-module imports work)
- **How:** `npm test __tests__/transition.test.ts`
- **Expected result:** All tests pass, exit code 0

### Run smoke test (unchanged)
- **What:** Existing smoke test still passes — no import changes required
- **How:** `npm test __tests__/smoke.test.ts`
- **Expected result:** All tests pass, exit code 0

### Run dependent capability tests (unchanged)
- **What:** Tests that use stepFolderName via utils still pass
- **How:** `npm test __tests__/execute-task-initial-message.test.ts && npm test __tests__/review-code-config.test.ts`
- **Expected result:** All tests pass, exit code 0

### Run full test suite (regression check)
- **What:** No regressions in any other test file due to the extraction
- **How:** `npm test`
- **Expected result:** All 14 test files pass with no failures

## Test Order

1. **TypeScript type check** (`npm run check`) — catch import/compilation errors first
2. **Transition tests** (`npm test __tests__/transition.test.ts`) — verify core extraction + cross-module imports
3. **Smoke test** (`npm test __tests__/smoke.test.ts`) — confirm unchanged tests still pass
4. **Dependent capability tests** (`execute-task-initial-message`, `review-code-config`) — confirm unchanged tests still pass
5. **Full test suite** (`npm test`) — regression check across all 14 files
