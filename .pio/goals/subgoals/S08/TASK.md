# Task: Dimension 8 — GoalState and path resolution changes

Produce a comprehensive inventory of every function and location in the codebase that assumes flat goal workspace paths, and document how each must change to support nested subgoal paths (`S{NN}/subgoals/<name>/`).

## Context

This is Step 8 of the Subgoals Feasibility Study. Dimensions 1–7 have already identified specific path resolution issues. Dimension 8 consolidates these findings into a systematic audit: every function that derives, resolves, or traverses goal workspace paths must be examined for flat-path assumptions. The output feeds directly into the synthesis (Step 9) which produces the final file modification inventory and go/no-go recommendation.

The nested subgoal path structure is `S{NN}/subgoals/<name>/` relative to a parent goal workspace, producing full paths like `<cwd>/.pio/goals/parent/S03/subgoals/nested/`. Any code that splits on `/goals/`, uses `goalName` as a basename, or constructs paths via `resolveGoalDir(cwd, goalName)` must be audited.

## What to Build

Append a "Dimension 8: GoalState and path resolution changes" section to `FEASIBILITY.md`. This section must contain:

### Comprehensive Function Inventory

For every source file that performs path operations on goal workspaces, document:

1. **The function/location** — exact name, file path, and approximate line number
2. **The flat-path assumption** — what specific pattern assumes flat paths (e.g., `indexOf("/goals/")`, `path.basename(goalDir)`, `resolveGoalDir(cwd, goalName)`)
3. **Impact of nesting** — how the function breaks or misbehaves with nested subgoal paths
4. **Proposed resolution strategy** — how to fix it (new parameter, new helper, refactor)
5. **Change category** — new fields / new logic / breaking change

### Key Functions to Audit (from prior dimensions and source code research)

The following list is a starting point derived from Dimensions 1–7 and grep results. The inventory in FEASIBILITY.md must be **comprehensive** — include any additional functions discovered during the audit:

**`src/goal-state.ts`:**
- `createGoalState(goalDir)` — cwd derivation via `goalDir.indexOf("/goals/")`. Prior decision (Dim 1) says this is correct for nested paths. Verify and document why.
- `goalName` property — uses `path.basename(goalDir)`. For a nested subgoal at `parent/S03/subgoals/nested/`, basename is `nested` — may be ambiguous with flat goals of the same name.
- `steps()` method — scans `goalDir` for `/^S(\d+)$/` folders. Safe per Dim 1, but document reasoning (subgoals are inside `subgoals/` subdirectory, not at goal root).
- `currentStepNumber()` — sequential scan of step folders. Same regex safety applies. Document any assumptions about directory structure.
- `pendingTask()` — constructs queue path as `cwd/.pio/session-queue/task-{goalName}.json`. With nested `goalName = "nested"`, this collides with flat goals named `nested`. Must use hierarchical queue key (Dim 2: `deriveQueueKey`).

**`src/fs-utils.ts`:**
- `resolveGoalDir(cwd, name)` — always produces flat paths. Needs new logic per Dim 1 decision (optional parameters for nested resolution). Document the proposed signature change.
- `discoverNextStep(goalDir)` — scans a given directory for step folders. Works correctly if passed the right dir (subgoal's own goalDir). No change needed but document the assumption.
- `deriveSessionName(goalName, capability, stepNumber)` — uses raw `goalName` for display. Dim 6 recommends replacing `__` with `/` for qualified names. Document this as **new logic** (cosmetic).

**`src/capability-config.ts`:**
- `resolveCapabilityConfig()` line ~44 — derives `workingDir` via `resolveGoalDir(cwd, goalName)`. Falls back to flat resolution when no explicit `params.workingDir` is provided. For subgoals, the spawning transition must pass `params.workingDir` explicitly (Dim 5). Document this gap and the proposed fix.
- Session name derivation — calls `deriveSessionName(goalName, cap, stepNumber)`. Affected by Dim 6 session naming change.

**`src/state-machine.ts`:**
- `transitionEvolvePlan()` line ~77 — calls `resolveGoalDir(cwd, goalName!)` to compute `goalDir` for the `finalize-goal` transition. For a nested subgoal completing via `finalize-goal`, this produces an incorrect flat path. The proposed fix: pass `goalDir` explicitly in params (which Dim 3's completion propagation mechanism already does). Document this interaction.
- `export { stepFolderName, resolveGoalDir }` — re-export of `resolveGoalDir`. No functional change needed but note for API surface awareness.

**Capability files that call `resolveGoalDir(cwd, name)`:**
Every capability that uses `resolveGoalDir` to construct `goalDir` from a `goalName` parameter must be audited:
- `src/capabilities/create-goal.ts` (line 38) — creates new goal workspaces. For nested subgoals, `create-goal` must accept explicit parent context to compute nested paths. Document required changes.
- `src/capabilities/create-plan.ts` (line 90) — reads PLAN.md from goal dir. Affected if goalName resolves incorrectly.
- `src/capabilities/evolve-plan.ts` (line 91) — same pattern. Must receive correct goalDir via params for subgoals.
- `src/capabilities/execute-task.ts` (lines 105, 165) — reads TASK.md, writes SUMMARY.md. Same issue.
- `src/capabilities/review-task.ts` (lines 205, 285) — reads REVIEW.md, writes markers. Same issue.
- `src/capabilities/revise-plan.ts` (line 35) — archives PLAN.md. Same issue.
- `src/capabilities/finalize-goal.ts` (line 52) — writes COMPLETED marker. Same issue.
- `src/capabilities/goal-from-issue.ts` (line 33) — creates goal from issue. Likely top-level only, but document assumption.
- `src/capabilities/delete-goal.ts` (line 13) — deletes goal workspace. Document behavior for nested paths.
- `src/capabilities/execute-plan.ts` (line 34) — executes all steps. Same issue.

**`src/queues.ts`:**
- `enqueueTask(cwd, goalName, task)` — constructs filename `task-{goalName}.json`. Dim 2 proposes hierarchical keys. Document required changes here.
- `readPendingTask(cwd, goalName)` — same. Must use hierarchical key lookup.
- `listPendingGoals(cwd)` — extracts goal name by stripping `task-` prefix and `.json`. With hierarchical keys like `task-parent__S03__nested.json`, extraction returns `parent__S03__nested`. Document whether this is acceptable or requires decoding.

**`src/capabilities/list-goals.ts`:**
- Scans `.pio/goals/*/` as flat directories (line ~72). Would miss nested subgoals entirely. Document the gap and proposed solution (recursive scan vs. flag-based listing).
- Uses `resolveGoalDir(ctx.cwd, name)` (line 75) — produces correct paths for top-level goals but cannot resolve nested subgoals.

### Resolution Strategy Section

After the function inventory, document a unified resolution strategy:

**Strategy:** The spawning transition (e.g., `transitionEvolvePlan` routing to `create-goal` for a subgoal) must pass **explicit absolute paths** in params rather than relying on goal name resolution. Key changes:
- New optional params: `workingDir` (absolute path), `parentGoalDir` (for context)
- `resolveGoalDir` extension: keep existing flat behavior, add `resolveNestedGoalDir(cwd, parentGoalName, stepNumber, subgoalName)` helper for callers that need nested resolution
- `deriveQueueKey(goalDir, cwd)`: new helper in `queues.ts` to produce hierarchical keys from any goal path

### Change Summary Table

Conclude with a table summarizing every affected file and its change category:

| File | Function | Change Category | Description |
|------|----------|-----------------|-------------|
| ...  | ...      | new logic / new fields / breaking | ... |

## Dependencies

- Depends on Steps 1–7 being completed (context from DECISIONS.md, which carries accumulated decisions).
- Requires FEASIBILITY.md to exist with Dimensions 1–7 already written (confirmed via S07/SUMMARY.md).

## Files Affected

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 8 analysis section with comprehensive function inventory, resolution strategy, and change summary table

## Acceptance Criteria

- `FEASIBILITY.md` contains a "Dimension 8: GoalState and path resolution changes" section.
- Section lists every function/location that assumes flat paths (comprehensive inventory covering at minimum all files listed in the Key Functions to Audit above).
- Each entry documents: flat-path assumption, impact of nesting, proposed resolution strategy, and change category (new fields / new logic / breaking change).
- Section proposes a unified resolution strategy (explicit absolute paths via params + helper functions).
- Section includes a change summary table mapping files to change categories.
- Cross-references to prior dimensions are explicit where the same function was identified by multiple dimensions (e.g., `resolveGoalDir` from Dims 1, 5, and 8).

## Risks and Edge Cases

- The inventory must be thorough — missing a single function creates blind spots in the synthesis (Step 9) and could produce an incomplete go/no-go recommendation.
- Some capabilities may be top-level-only by design (e.g., `goal-from-issue` creates goals from issues, which are always top-level). Document these assumptions explicitly rather than flagging them as gaps.
- Ensure line numbers in FEASIBILITY.md match actual source code — this was a review issue caught in Step 7.
