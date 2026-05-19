# Task: Slim down `validation.ts` — retain only file protection

Final cleanup of `src/guards/validation.ts` to contain only file protection event handlers, the `validateOutputs` utility, and type re-exports. All frontmatter parsing and the mark-complete tool have already been moved out in Steps 5–6; this step verifies the slim-down is complete and removes any remaining artifacts.

## Context

As part of the frontmatter architecture refactor, `validation.ts` was responsible for file protection (readOnly/writeAllowlist guards), the `pio_mark_complete` tool, AND review-specific frontmatter parsing. Steps 5–6 moved the mark-complete tool to `session-capability.ts` and review frontmatter logic to `review-task.ts` + `frontmatter.ts`. This step completes the transition by verifying the file contains only its remaining responsibilities.

## What to Build

This is a cleanup and verification step. The main work items are:

### 1. Verify current state of `validation.ts`

Confirm the file exports exactly what Step 8 requires:
- `setupValidation` — registers event handlers for file protection (tool_call guard, resources_discover config loading, turn_start counter reset)
- `validateOutputs` — pure utility function for file-existence validation (still needed by `session-capability.ts`)
- `ValidationRule` type re-export

And contains **no** references to:
- Frontmatter functions (`parseReviewFrontmatter`, `validateReviewFrontmatter`, `toReviewFrontmatter`, `applyReviewDecision`, `validateReviewState`)
- Frontmatter types (`RawReviewFrontmatter`, `ReviewFrontmatter`)
- Tool registration (`defineTool`, `markCompleteTool`, `pi.registerTool`)
- `js-yaml` import

### 2. Remove `extractGoalName` if no longer needed

`extractGoalName(workingDir: string)` was used by the old mark-complete tool to derive goal names from paths. After moving mark-complete to `session-capability.ts` (which uses `GoalState.goalName` instead), this function is no longer consumed by any production code. It is currently imported only by `src/guards/validation.test.ts`.

**Action:** Remove `extractGoalName` from `validation.ts`. The test file's imports will be handled in Step 9 (test migration). If any production code still imports it, retain the function and document the dependency.

Check: `grep -rn "extractGoalName" src/ --include="*.ts"` — currently `state-machine.ts` has its own local `extractGoalName`, so no cross-module dependency exists.

### 3. Verify file protection functionality is intact

Ensure the file protection event handlers continue to work correctly:
- `tool_call` guard: blocks writes to `.pio/` outside session's goal workspace, enforces write-allowlist and read-only blocklist
- `resources_discover`: loads validation config from custom session entry
- `turn_start`: resets one-shot warning counter

### 4. Clean up unused internal state

Review the module-level cached variables and remove any that were used only by the removed mark-complete tool:
- `validationRules` — still needed (used by `validateOutputs` if called from external callers)
- `baseDir` — check if still referenced
- `workingDir` — still needed for file protection (`.pio/` path checks)
- `capabilityName` — check if still used
- `warnedOnce`, `warningsThisSession`, `MAX_WARNINGS` — check if still referenced

### Code Components

No new functions or modules. This step modifies exactly one file: `src/guards/validation.ts`.

### Approach and Decisions

- **Be conservative with removals.** Only remove code that is provably unused (no imports from other files, no internal references). When in doubt, leave it — Step 9 can handle remaining cleanup during test migration.
- **Follow DECISIONS.md plan deviation:** The slim-down work was partially completed in Steps 5–6 when the mark-complete tool and review frontmatter were moved. This step should not be surprised to find `validation.ts` already mostly clean.
- **Do not modify behavior of file protection.** The tool_call guard, resources_discover handler, and turn_start handler must remain unchanged. Existing tests verify their correctness.

## Dependencies

- **Step 6:** Must be complete — `pio_mark_complete` tool moved to `session-capability.ts`, so `validation.ts` no longer needs mark-complete logic.
- **Step 5:** Must be complete — review-task `postValidate` uses shared frontmatter module, not validation.ts functions.

## Files Affected

- `src/guards/validation.ts` — remove `extractGoalName`, clean up unused internal state; verify file contains only file protection + `validateOutputs` + type re-export

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] `validation.ts` exports exactly: `setupValidation` (file protection), `validateOutputs`, `ValidationRule` type re-export
- [ ] No frontmatter functions (`parseReviewFrontmatter`, `validateReviewFrontmatter`, `toReviewFrontmatter`, `applyReviewDecision`, `validateReviewState`) exist in the file
- [ ] No `js-yaml` import in `validation.ts`
- [ ] No `defineTool` / `pi.registerTool` calls in `validation.ts`
- [ ] File protection (readOnly/writeAllowlist) continues to work — verified by existing tests in `src/guards/validation.test.ts`
- [ ] `extractGoalName` is removed from `validation.ts` (verify no production code imports it)

## Risks and Edge Cases

- **Breaking change for test imports:** Removing `extractGoalName` will break `validation.test.ts` — the tests still import it. This is expected; Step 9 handles test migration. Do not modify test files in this step.
- **Unused internal variables:** Be careful not to remove module-level variables that are still used by event handlers (e.g., `workingDir`, `readOnlyFilePaths`, `writeAllowlistPaths` are all actively used).
- **`ValidationResult` interface:** Currently exported and used as the return type of `validateOutputs`. Keep it if it's part of the function signature. If removing `extractGoalName` leaves other dead exports, only remove them if nothing imports them.
