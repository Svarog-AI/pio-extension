# Accumulated Decisions (through Step 7)

## Nesting Structure (from Dimension 1)

- **Subgoal workspace path:** `S{NN}/subgoals/<name>/` — subgoals live inside parent step directories under the `subgoals/` marker. All downstream dimensions must assume this structure.
- **cwd derivation requires no change:** Existing `indexOf("/goals/")` + `path.dirname()` correctly handles all nesting depths. Confirmed by Steps 1–2 research.
- **`steps()` regex requires no change:** The `subgoals/` directory marker does not match `/^S(\d+)$/`. Scanner is safe.
- **`resolveGoalDir` requires new logic:** Add optional parameter(s) for nested resolution (non-breaking extension). Downstream: state machine transitions and capability configs must pass parent-aware paths.

## Queue Keying (from Dimension 2)

- **Hierarchical keys with `__` delimiters.** Format: `task-parent__S03__nested.json` for subgoals, `task-my-feature.json` for flat goals (unchanged). Backward compatible — flat goals produce identical filenames.
- **`deriveQueueKey(goalDir, cwd)` helper function** proposed as the canonical key derivation mechanism. Strips `.pio/goals/` prefix, filters out `subgoals/` markers, joins remaining segments with `__`.

## State Machine Extensions (from Dimension 3)

- **Spawning mechanism:** New transition in the state machine. `transitionEvolvePlan` routes to `create-goal` with parent context when a step is flagged as a subgoal.
- **Lifecycle composition:** Parent implicitly pauses. No active pause/resume protocol. No concurrency support. Parent's queue slot overwritten by subgoal's task and restored on subgoal completion.
- **Completion propagation:** Subgoal's `finalize-goal` routes to the parent's `evolve-plan`. Symmetric with existing `review-task` (approved) → `evolve-plan`. Subgoal replaces the `execute-task → review-task` cycle. Subgoal COMPLETED = step COMPLETED.
- **`finalize-goal` terminal behavior:** Remains terminal (`undefined`) for top-level goals. Becomes non-terminal for subgoals only (discriminated by `parentGoalName` param).
- **No breaking changes to state machine:** All modifications are additive — new optional params, new helper functions, extracted inline logic.

## Subgoal Trigger Mechanism (from Dimension 4)

- **Abstraction tree model adopted:** Root = goal, children = plan steps, leaves = directly implementable steps. Composite nodes spawn subgoals.
- **Leaf-node criteria: I/O contract test.** "Can you state the output without listing internal sub-outputs?" If yes → leaf. If no → composite. Domain-agnostic.
- **Subgoal boundary: encapsulation rule.** Parent plan operates at the deliverable level. Subgoals encapsulate process steps. Test: "Does the parent need to know how this is built?"
- **Hybrid flat-tree prevention:** Step count limit (`totalSteps > 8`) as hard guard + abstraction distance heuristic as skill guidance.
- **create-plan is the primary initiation point.** Planning agent evaluates all steps against leaf-node criteria upfront. `evolve-plan` is a correction fallback only.
- **Signaling mechanism deferred to Dimension 9:** Choice between PLAN.md metadata and runtime marker files deferred to where the schema is designed.

## File Protection Scope (from Dimension 5)

- **Default-deny check is correct for nested paths:** `tp.startsWith(workingDir + path.sep)` with separator requirement correctly isolates subgoal sessions. No path traversal bypass exists.
- **workingDir assignment gap identified:** `resolveGoalDir` produces flat paths and cannot resolve nested subgoal workingDirs. The spawning transition must pass explicit `params.workingDir` for nested subgoals.
- **No changes to `validation.ts` required.** Default-deny, path traversal handling, and allowlist resolution are all correct for the recommended approach.
- **Parent context injection: Approach C (hybrid).** Inject parent goal directory path into initial message, let LLM read parent files on demand. Minimal token overhead, guided behavior, fresh context.

## Session Hierarchy and Navigation (from Dimension 6)

- **Pi `parentSession` supports arbitrary depth.** Confirmed via code evidence. No changes required.
- **`/pio-parent` single-hop behavior is acceptable.** One command = one hop. Multiple invocations for deep nesting is acceptable.
- **Session naming improvement recommended:** `deriveSessionName()` should format qualified names by replacing `__` with `/` for display. Categorization: **new logic** (cosmetic, non-breaking).

## Completion Propagation (from Dimension 7)

- **Subgoal COMPLETED marker is authoritative.** Per user preference, the subgoal's own `COMPLETED` file is what counts — no separate parent-side marking mechanism needed.
- **Propagation path confirmed:** `finalize-goal` → transition back to parent's `evolve-plan` (same as Dimension 3). Step 7 verified line numbers and added explicit checks for `recordTransition`/`writeLastTask` correctness.
