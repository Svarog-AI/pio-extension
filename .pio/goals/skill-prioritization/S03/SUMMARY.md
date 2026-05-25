# Summary: Implement skill injection logic in session-capability.ts (Step 3 — re-execution)

## Status
COMPLETED

## Changes (review re-execution)

This re-execution addressed all quality issues identified in the code review. The implementation (`buildSkillLoadingSection`, `before_agent_start`, `resources_discover`) was functionally correct and unchanged. Only test quality issues were fixed.

### Review Issues Addressed

1. **[MEDIUM] DRY violation — duplicate helper functions**: Extracted `writeSkillFile()` and `makeSkill()` from inside two `describe` blocks to shared module-level helpers. Updated all call sites to pass `tempDir` as the first argument.

2. **[MEDIUM] Fragile spy pattern**: Replaced the `readFileSync` spy test (`vi.spyOn(require("node:fs"), "readFileSync")`) with a positive behavior test that verifies skill content is dynamically generated from `buildSkillLoadingSection`. The new test creates a skill on disk, triggers the full handler flow, and asserts the skill XML block appears in the output.

3. **[LOW] Dead comments**: Removed the abandoned section header "Single top-level mock for session-capability (used by both describe blocks)" that appeared before the actual mock setup.

## Files Created
- `.pio/goals/skill-prioritization/S03/TEST.md` — updated test specification
- `.pio/goals/skill-prioritization/S03/COMPLETED` — completion marker

## Files Modified
- `src/capabilities/session-capability.test.ts` — extracted duplicate helpers, replaced fragile spy test, cleaned up dead comments

## Files Deleted
- (none)

## Decisions Made
- The shared `writeSkillFile` helper takes `tempDir` as its first parameter (consistent with the existing module-level helper pattern), distinguishing it from the old local versions that captured `tempDir` from the enclosing scope.
- The positive replacement test verifies dynamic skill generation by asserting the skill XML block appears in the `before_agent_start` output — proving `buildSkillLoadingSection` is the source of skill content without relying on fragile fs spy internals.

## User-Requested Changes
- (none)

## Test Coverage
- All 705 tests pass (692 existing + 13 skill injection tests)
- `npx tsc --noEmit` reports zero errors
- No VS Code diagnostics
