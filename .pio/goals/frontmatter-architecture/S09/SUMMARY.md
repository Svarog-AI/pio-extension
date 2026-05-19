# Summary: Update `src/index.ts`, migrate tests, verify build

## Status
COMPLETED

## Files Created
- (none — all test files already existed from previous steps)

## Files Modified
- `src/guards/validation.test.ts` — removed `extractGoalName` from import statement and removed the entire `describe("extractGoalName", ...)` block (7 tests). File now contains only `validateOutputs` (6 tests) and `setupValidation` (1 test).

## Files Deleted
- (none)

## Files Verified (no changes needed)
- `src/index.ts` — imports are correct: `setupValidation` from `./guards/validation`, `setupCapability` from `./capabilities/session-capability`. No dangling imports to removed functions.
- `src/capabilities/mark-complete.test.ts` — already exists with 13 comprehensive tests covering the full `pio_mark_complete` exit orchestration flow (created by a previous step).

## Decisions Made
- **No duplicate tests in `session-capability.test.ts`:** The `pio_mark_complete` exit orchestration tests already exist in `src/capabilities/mark-complete.test.ts` (created during the mark-complete relocation in Step 6). Adding them to `session-capability.test.ts` would be redundant. The separate file follows the colocated test convention and keeps `session-capability.test.ts` focused on its own module's responsibilities.

## Test Coverage
- `src/guards/validation.test.ts`: 7 tests (6 `validateOutputs` + 1 `setupValidation`) — all pass
- `src/capabilities/mark-complete.test.ts`: 13 tests covering:
  - Tool registration via `setupCapability`
  - File validation failure → error, no termination
  - File validation success → proceeds to postValidate
  - postValidate failure → error propagated, no transitions
  - postValidate success → transition routing triggered
  - postExecute runs after transitions (call order verified)
  - postExecute errors are non-fatal (logged, doesn't block termination)
  - fileCleanup deletes declared files
  - No config entry → pass with terminate
  - Missing workingDir → error with terminate
  - APPROVED frontmatter → creates marker, enqueues evolve-plan
  - REJECTED frontmatter → creates marker, deletes COMPLETED, enqueues execute-task
  - Invalid frontmatter → error, no markers, no transitions
- **Full suite:** 391 tests pass, 0 failures, 0 TypeScript errors
