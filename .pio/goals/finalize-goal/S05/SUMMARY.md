# Summary: Create finalize-goal capability module (Step 5 — Re-review)

## Status
COMPLETED

## Files Modified
- `src/capabilities/finalize-goal.ts` — Fixed critical bug: tool enqueue params changed from `{ goalName: params.name }` to `{ goalDir: result.goalDir }` to preserve `workingDir` as `cwd` for correct `.pio/PROJECT/*.md` path resolution
- `src/capabilities/finalize-goal.test.ts` — Added 7 new tests for tool execute and command handler (total 26 tests, up from 19)

## Files Created
- (none — all files existed from previous attempt)

## Files Deleted
- (none)

## Critical Issues Fixed
1. **Tool enqueue params bug (CRITICAL)**: Changed line 96 from `params: { goalName: params.name }` to `params: { goalDir: result.goalDir }`. This ensures `resolveCapabilityConfig` does NOT see `goalName` in params, so `workingDir` defaults to `cwd` instead of the goal directory. This is essential because `.pio/PROJECT/*.md` paths must resolve relative to the repo root, not the goal workspace.

2. **Missing tests for tool execute (CRITICAL)**: Added 4 tests:
   - `enqueues task with goalDir (not goalName) when goal is complete` — verifies the critical fix by reading the queue file and confirming `goalDir` is present and `goalName` is absent
   - `returns error when goal does not exist` — verifies validation error path
   - `returns error when goal is not complete` — validates COMPLETED check integration
   - Tool is accessed via `setupFinalizeGoal` mock registration (tool is not exported)

3. **Missing tests for command handler (CRITICAL)**: Added 3 tests:
   - `shows usage message when no arguments provided` — arg parsing
   - `shows usage message when empty arguments provided` — arg parsing with whitespace
   - `shows error when goal does not exist` — validation error path
   - `shows error when goal is not complete` — COMPLETED check integration

## Decisions Made
- **Tool access pattern**: Since `finalizeGoalTool` is not exported, tests access it via `setupFinalizeGoal` mock registration — captures the tool passed to `pi.registerTool()`. This follows the existing pattern used for `setupFinalizeGoal` registration tests.
- **Queue file verification**: Tool execute tests verify enqueue behavior by reading the queue file via `readPendingTask()` after calling `tool.execute()`. This provides end-to-end verification of the params fix without mocking internal dependencies.
- **Command handler capture**: Tests capture the handler function from `setupFinalizeGoal`'s `registerCommand` call, enabling direct invocation with mock `ExtensionCommandContext`.
- **Success path for command handler**: Not tested end-to-end because `launchCapability` calls `ctx.newSession()` which creates real sessions. The validation and error paths are fully tested; the success path flows through `resolveCapabilityConfig` + `launchCapability` which are tested in other capability test suites.

## Test Coverage
- **26 total tests** in `src/capabilities/finalize-goal.test.ts`:
  - CAPABILITY_CONFIG: 10 tests (prompt, 7 writeAllowlist paths, validation undefined)
  - defaultInitialMessage: 3 tests (non-empty, includes goal dir, references goal)
  - setupFinalizeGoal: 3 tests (registers tool, registers command, command description)
  - validateFinalizeGoal: 3 tests (ready when COMPLETED, error when missing, error when not complete)
  - **Tool execute (NEW)**: 4 tests (enqueue with goalDir, error on missing goal, error on incomplete)
  - **Command handler (NEW)**: 3 tests (usage on no args, usage on empty args, error on missing goal, error on incomplete)
- **All 477 tests pass** (451 original + 26 new)
- **TypeScript compilation clean**: `npx tsc --noEmit` reports no errors
