# Tests: Create revise-plan capability implementation

## Unit Tests

**File:** `src/capabilities/revise-plan.test.ts` (colocated with source, following the project convention)
**Test runner:** Vitest (Node.js environment, global `describe/it/expect`)

### CAPABILITY_CONFIG structure

- `describe("CAPABILITY_CONFIG")`:
  - `prompt is "revise-plan.md"` — assert `CAPABILITY_CONFIG.prompt === "revise-plan.md"`
  - `validation requires PLAN.md` — assert `CAPABILITY_CONFIG.validation?.files` contains `"PLAN.md"`
  - `prepareSession is a function` — assert `typeof CAPABILITY_CONFIG.prepareSession === "function"`
  - `defaultInitialMessage returns non-empty string` — call with a mock workingDir, assert result is a non-empty string containing the goal workspace path

### Validation — validateRevisePlan preconditions (PreValidate phase)

Helper: Create goal workspace trees in temp dirs using `fs.mkdtempSync()` under `os.tmpdir()`, with configurable GOAL.md, PLAN.md, and step folders. Clean up in `afterEach`.

- `describe("validateRevisePlan — rejects invalid states")`:
  - `rejects when goal workspace does not exist` — call with a non-existent goal name, assert `ready: false` and error mentions "does not exist"
  - `rejects when GOAL.md is missing` — create goal dir with PLAN.md but no GOAL.md, assert `ready: false` and error mentions "GOAL"
  - `rejects when PLAN.md is missing` — create goal dir with GOAL.md but no PLAN.md, assert `ready: false` and error mentions "PLAN"

- `describe("validateRevisePlan — accepts valid states")`:
  - `succeeds when GOAL.md and PLAN.md exist (no steps required)` — create goal dir with both files, no step folders at all, assert `ready: true`
  - `succeeds with APPROVED steps present` — create S01/ with APPROVED marker, assert `ready: true`

### prepareSession — archive PLAN.md

- `describe("prepareSession — archiving")`:
  - `archives PLAN.md to PLAN_ARCHIVE/ with timestamped filename` — set up goal dir with PLAN.md containing known content, run `prepareSession(goalDir)`, assert `PLAN_ARCHIVE/` directory exists, assert exactly one file matching `PLAN-*.md` exists, assert archived file content matches original PLAN.md content, assert original PLAN.md is deleted
  - `creates PLAN_ARCHIVE/ directory if it does not exist` — set up goal dir without PLAN_ARCHIVE/, run prepareSession, assert directory was created
  - `preserves previous archive files when archiving again` — set up goal dir with an existing file in PLAN_ARCHIVE/, run prepareSession, assert both the old archive and new archive exist (two files total)
  - `does nothing if PLAN.md is already missing` — set up goal dir without PLAN.md (edge case: manual deletion), run prepareSession, assert no error is thrown (guard with existsSync)

### prepareSession — deleting non-APPROVED step folders

- `describe("prepareSession — cleanup")`:
  - `deletes step folders without APPROVED marker` — create S01/ (no APPROVED) and S02/ (has APPROVED), run prepareSession, assert S01/ is deleted and S02/ still exists
  - `preserves APPROVED step folders` — create S01/APPROVED and S02/APPROVED, run prepareSession, assert both still exist with APPROVED markers intact
  - `deletes multiple non-APPROVED folders` — create S01 (no marker), S02 (has TASK.md + TEST.md but no APPROVED), S03 (APPROVED), run prepareSession, assert only S03 remains
  - `handles goal with all steps APPROVED` — create S01-S03 all with APPROVED, run prepareSession, assert all folders preserved

### prepareSession — REVISE_PLAN_NEEDED marker cleanup

- `describe("prepareSession — marker cleanup")`:
  - `deletes REVISE_PLAN_NEEDED from triggering step folder when revisionTriggerStep provided` — create S01/APPROVED with REVISE_PLAN_NEEDED inside, call `prepareSession(goalDir, { revisionTriggerStep: 1 })`, assert marker file is deleted
  - `does not attempt cleanup when revisionTriggerStep is not provided` — create S02/ with REVISE_PLAN_NEEDED (non-APPROVED), call `prepareSession(goalDir)` without params, assert folder is deleted entirely by the non-APPROVED cleanup (marker naturally removed)
  - `handles missing marker gracefully` — provide revisionTriggerStep pointing to an APPROVED step that has no marker file, run prepareSession, assert no error thrown

### Config callbacks — readOnlyFiles and writeAllowlist

Test via `resolveCapabilityConfig()` (same pattern as evolve-plan.test.ts):

- `describe("CAPABILITY_CONFIG callbacks via resolveCapabilityConfig")`:
  - `writeAllowlist includes PLAN.md` — resolve config for `"revise-plan"` capability, assert `writeAllowlist` contains `"PLAN.md"`
  - `readOnlyFiles is a function (callback)` — assert `typeof CAPABILITY_CONFIG.readOnlyFiles === "function"` to confirm it uses step-dependent resolution

## Integration Tests

- `describe("end-to-end prepareSession workflow")`:
  - `full lifecycle: archive, cleanup, marker removal in one run` — set up a goal dir with GOAL.md, PLAN.md (known content), S01/ (APPROVED + REVISE_PLAN_NEEDED), S02/ (TASK.md + TEST.md, no APPROVED), S03/ (only SUMMARY.md, no APPROVED). Call `prepareSession(goalDir, { revisionTriggerStep: 1 })`. Assert: PLAN_ARCHIVE/ has one timestamped file with correct content, original PLAN.md is gone, S01/ exists with APPROVED but marker removed, S02/ and S03/ are deleted.

## Programmatic Verification

- **File existence:** `src/capabilities/revise-plan.ts` exists and is non-empty
  - **How:** `test -s src/capabilities/revise-plan.ts`
  - **Expected result:** exit code 0

- **Exports match capability pattern:** File exports `CAPABILITY_CONFIG` and `setupRevisePlan`
  - **How:** `grep -c 'export const CAPABILITY_CONFIG' src/capabilities/revise-plan.ts && grep -c 'export function setupRevisePlan' src/capabilities/revise-plan.ts`
  - **Expected result:** both return 1

- **Tool name is correct:** Tool registered as `pio_revise_plan`
  - **How:** `grep 'name: "pio_revise_plan"' src/capabilities/revise-plan.ts`
  - **Expected result:** line found

- **Command name is correct:** Command handler for `pio-revise-plan`
  - **How:** `grep 'pio-revise-plan' src/capabilities/revise-plan.ts`
  - **Expected result:** line found in registerCommand call

- **Uses required imports:** File imports from session-capability, fs-utils, queues, capability-config, goal-state
  - **How:** `grep -c 'from "./session-capability"' src/capabilities/revise-plan.ts`, `grep -c 'from "../fs-utils"' src/capabilities/revise-plan.ts`, `grep -c 'from "../queues"' src/capabilities/revise-plan.ts`, `grep -c 'from "../goal-state"' src/capabilities/revise-plan.ts`
  - **Expected result:** all return ≥1

- **prepareSession references PLAN_ARCHIVE:** Archive logic mentions the directory name
  - **How:** `grep 'PLAN_ARCHIVE' src/capabilities/revise-plan.ts`
  - **Expected result:** at least one match

- **prepareSession deletes non-approved steps:** References step status checking or rmSync
  - **How:** `grep -E '(rmSync|status.*approved)' src/capabilities/revise-plan.ts`
  - **Expected result:** matches found

- **TypeScript type check:** No type errors
  - **How:** `npx tsc --noEmit`
  - **Expected result:** exit code 0, no output

- **Full test suite passes (no regressions):** All existing tests still pass after adding new capability
  - **How:** `npm test`
  - **Expected result:** all tests pass, exit code 0

## Test Order

1. Unit tests for CAPABILITY_CONFIG structure (fastest, no filesystem)
2. Unit tests for validation function (temp dir setup)
3. Unit tests for prepareSession — archiving (temp dir setup)
4. Unit tests for prepareSession — cleanup (temp dir setup)
5. Unit tests for prepareSession — marker cleanup (temp dir setup)
6. Config callback tests via resolveCapabilityConfig (no temp dirs)
7. Integration test — full lifecycle (complex temp dir setup)
8. Programmatic verification — file existence and content checks
9. TypeScript type check (`npx tsc --noEmit`)
10. Full test suite (`npm test`)
