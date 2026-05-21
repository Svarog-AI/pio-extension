# Summary: Wire revise-plan and register planning skill in index.ts

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/index.ts` — Added `setupRevisePlan` import from `./capabilities/revise-plan`, called `setupRevisePlan(pi)` in the main function, and registered `pio-planning` skill path in `skillPaths`
- `src/index.test.ts` — Added 4 new tests: `pio-planning` skill path presence, `pio-planning` in skill names list, `pio_revise_plan` tool registration, `pio-revise-plan` command registration

## Files Deleted
- (none)

## Decisions Made
- Used `pio-planning` as the skill directory name (not `planning`) to match the actual filesystem path created in Step 1
- Placed `setupRevisePlan` import alphabetically after `setupReviewTask` (following existing import ordering convention)
- Placed `setupRevisePlan(pi)` call after `setupReviewTask(pi)` (conceptually related in the workflow)
- Test for tool registration checks `call[0]?.name === "pio_revise_plan"` since `registerTool` receives a tool definition object, not a string name
- Test for command registration checks `call[0] === "pio-revise-plan"` (without leading `/`, matching the actual registration convention)

## Test Coverage
- 4 new tests added to `src/index.test.ts`, all passing:
  - `"includes pio-planning in skillPaths"` — verifies `resources_discover` returns a path containing `pio-planning`
  - `"skillPaths contain absolute paths under the skills directory"` — updated to also assert `pio-planning` is in the skill names list
  - `"setupRevisePlan registers pio_revise_plan tool"` — verifies the tool definition object with name `pio_revise_plan` is passed to `registerTool`
  - `"setupRevisePlan registers pio-revise-plan command"` — verifies the command name `pio-revise-plan` is passed to `registerCommand`
- Full test suite: 534 tests across 22 files, all passing
- TypeScript compilation (`npx tsc --noEmit`): clean, no errors
