# Summary: Dimension 1 — Nesting structure on disk

## Status
COMPLETED

## Files Created
- `.pio/goals/subgoals/FEASIBILITY.md` — Dimension 1 analysis section (first section of the feasibility study document)

## Files Modified
- (none — this is a research-and-documentation step only)

## Files Deleted
- (none)

## Decisions Made
- **Recommended nesting approach:** `S{NN}/subgoals/<name>/` — places subgoals physically close to parent step, uses `subgoals/` as a stable directory marker that doesn't conflict with `STEP_FOLDER_RE` (`/^S(\d+)$/`).
- **cwd derivation requires no change:** After careful code tracing and execution verification, the existing `createGoalState()` cwd derivation using `indexOf("/goals/")` + `path.dirname()` correctly handles all nesting depths. The first occurrence of `/goals/` is always at the `.pio/goals/` boundary, and `path.dirname()` strips `.pio` regardless of subsequent path segments. Verified with flat, nested, and deeply-nested paths.
- **`steps()` regex requires no change:** The `subgoals/` directory marker doesn't match `/^S(\d+)$/`, so the scanner correctly skips it.
- **`resolveGoalDir` needs new logic:** Add optional `parentStepDir` parameter for nested resolution (non-breaking extension).
- **`goalName` derivation needs new fields:** Sibling subgoals with same name under different parents would collide on queue keying (deferred to Dimension 2).

## Corrections from Review (REJECTED → COMPLETED)
- **Fixed cwd derivation analysis:** Previous version incorrectly claimed cwd derivation "breaks for nested paths." Verified with actual code execution that `indexOf("/goals/")` + `path.dirname(beforeGoals)` produces correct results for all nesting depths. Recategorized from "breaking change" to "no change required."
- **Fixed line number citations:** Updated to accurate line numbers from `grep -n` against actual source files (e.g., `resolveGoalDir` at line 9, `goalName` at line 163, cwd derivation at lines 168–183).
- **Included complete code snippets:** The cwd derivation code block now includes the full `if/else` branch with the `/.pio/` fallback, rather than truncating the function.

## Test Coverage
- ✅ FEASIBILITY.md exists at correct path
- ✅ Contains "Dimension 1" heading
- ✅ References `subgoals/` nesting approach
- ✅ References `src/fs-utils.ts` and `resolveGoalDir`
- ✅ References `src/goal-state.ts` and cwd derivation
- ✅ Contains change categorizations (new logic, new fields, no change)
- ✅ Discusses recursive nesting depth
- ✅ TypeScript type check (`npm run check`) passes with no errors
