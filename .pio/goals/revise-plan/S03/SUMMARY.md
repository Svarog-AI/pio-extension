# Summary: Create revise-plan capability implementation

## Status
COMPLETED

## Files Created
- `src/capabilities/revise-plan.ts` — Full capability implementation: CAPABILITY_CONFIG, validateRevisePlan(), prepareSession(), tool (pio_revise_plan), command (/pio-revise-plan), setupRevisePlan()
- `src/capabilities/revise-plan.test.ts` — 23 unit and integration tests covering config structure, validation, archiving, cleanup, marker removal, config callbacks, and end-to-end workflow

## Files Modified
- (none)

## Files Deleted
- (none)

## Decisions Made
- **prepareSession exports as a named function** — Exported for testability, matching the pattern of `validateAndFindNextStep` in evolve-plan.ts
- **Archive timestamp format** — Uses `new Date().toISOString().replace(/[:.]/g, "")` producing safe filenames like `PLAN-2026-05-21T143022Z.md`
- **Copy-then-delete for archiving** — `fs.copyFileSync` followed by `fs.unlinkSync` is safe: if delete fails after copy, both files exist (data preserved)
- **readOnlyFiles as callback** — Uses a callback to dynamically resolve approved step folders at session time, matching the evolve-plan pattern for step-dependent config
- **writeAllowlist includes PLAN_ARCHIVE/\*** — Permits the agent to access archived plans during its session

## Test Coverage
- **CAPABILITY_CONFIG structure** (4 tests): prompt, validation, prepareSession type, defaultInitialMessage
- **Validation rejects invalid states** (3 tests): missing goal workspace, missing GOAL.md, missing PLAN.md
- **Validation accepts valid states** (2 tests): GOAL.md + PLAN.md present, with APPROVED steps
- **prepareSession archiving** (4 tests): timestamped archive, directory creation, preserves old archives, handles missing PLAN.md
- **prepareSession cleanup** (4 tests): deletes non-APPROVED, preserves APPROVED, handles multiple folders, handles all-APPROVED
- **prepareSession marker cleanup** (3 tests): deletes marker when trigger provided, natural removal without trigger, handles missing marker
- **Config callbacks** (2 tests): writeAllowlist includes PLAN.md, readOnlyFiles is a function
- **Integration test** (1 test): full lifecycle — archive, cleanup, marker removal in one run
- **Total: 23 tests, all passing**
