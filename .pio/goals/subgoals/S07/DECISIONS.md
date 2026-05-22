# Accumulated Decisions (through Step 6)

## Nesting Structure (from Dimension 1)

- **Subgoal workspace path:** `S{NN}/subgoals/<name>/` — subgoals live inside parent step directories under the `subgoals/` marker. All downstream dimensions must assume this structure.
- **cwd derivation requires no change:** Existing `indexOf("/goals/")` + `path.dirname()` correctly handles all nesting depths. Confirmed by Steps 1–2 research.
- **`steps()` regex requires no change:** The `subgoals/` directory marker does not match `/^S(\d+)$/`. Scanner is safe.
- **`resolveGoalDir` requires new logic:** Add optional `parentStepDir` parameter for nested resolution (non-breaking extension). Downstream: state machine transitions may need to pass parent-aware paths.

## Queue Keying (from Dimension 2)

- **Hierarchical keys with `__` delimiters** (Strategy A). Format: `task-parent__S03__nested.json` for subgoals, `task-my-feature.json` for flat goals (unchanged). Backward compatible — flat goals produce identical filenames.
- **`deriveQueueKey(goalDir, cwd)` helper function** proposed as the canonical key derivation mechanism. Strips `.pio/goals/` prefix, filters out `subgoals/` markers, joins remaining segments with `__`.
- **Slug-only goal names** assumed to prevent delimiter collisions.

## State Machine Extensions (from Dimension 3)

- **Spawning mechanism:** Approach 1 (new transition in the state machine) recommended over piggyback. `transitionEvolvePlan` routes to `create-goal` with parent context when a step is flagged as a subgoal. Rationale: consistency with pio design, centralized logic, testable pure functions.
- **Lifecycle composition:** Parent implicitly pauses. No active pause/resume protocol. No concurrency support. The parent's queue slot is overwritten by the subgoal's task and restored when the subgoal completes.
- **Completion propagation mechanism:** Subgoal's `finalize-goal` routes to the parent's `evolve-plan` (not `review-task`). This is symmetric with the existing `review-task` (approved) → `evolve-plan` transition. The subgoal replaces the `execute-task → review-task` cycle. Subgoal COMPLETED = step COMPLETED.
- **User navigation is separate:** After subgoal completion, user runs `/pio-parent` to switch sessions, then `/pio-next-task` to dequeue the parent's `evolve-plan` task.
- **`finalize-goal` terminal behavior:** Remains terminal (`undefined`) for top-level goals. Becomes non-terminal for subgoals only (discriminated by `parentGoalName` param).
- **No breaking changes:** All modifications are additive — new optional params, new helper functions, extracted inline logic. Existing callers without subgoal params see identical behavior.

## Subgoal Trigger Mechanism (from Dimension 4)

- **Abstraction tree model adopted:** Root = goal, children = plan steps, leaves = directly implementable steps. Composite nodes spawn subgoals.
- **Leaf-node criteria: I/O contract test.** Single principle — "can you state the output without listing internal sub-outputs?" If yes → leaf. If no → composite. Domain-agnostic. Replaces old 5-point checklist.
- **Subgoal boundary: encapsulation rule.** Parent plan operates at the deliverable level. Subgoals encapsulate process steps. Test: "does the parent need to know how this is built?" If no → subgoal. If yes → flatten.
- **Hybrid flat-tree prevention:** Step count limit (`totalSteps > 8`) as a hard guard + abstraction distance heuristic as skill guidance. Count limit catches obvious flat plans; distance heuristic catches edge cases.
- **create-plan is the primary initiation point:** Planning agent evaluates all steps against leaf-node criteria upfront. Single decision point, declarative and auditable. `evolve-plan` is a correction fallback. `execute-task` is not involved in decomposition decisions.
- **Signaling mechanism deferred to Dimension 9:** Two options evaluated — Mechanism A (PLAN.md metadata, declarative) and Mechanism B (runtime marker file). Choice deferred to Dimension 9 where the PLAN.md metadata schema will be designed.
- **pio-planning skill separation maintained:** Leaf-node criteria and decomposition guards are HOW (in `pio-planning/SKILL.md`, reusable by both `create-plan` and `revise-plan`). Capability prompts say WHAT to do and reference the skill.

## File Protection Scope (from Dimension 5)

- **Default-deny check is correct for nested paths:** `tp.startsWith(workingDir + path.sep)` with separator requirement correctly isolates subgoal sessions. No path traversal bypass exists.
- **workingDir assignment gap identified:** `resolveGoalDir` produces flat paths and cannot resolve nested subgoal workingDirs. The spawning transition (`transitionEvolvePlan`) must pass explicit `params.workingDir` for nested subgoals.
- **No changes to `validation.ts` required:** The default-deny check, path traversal handling, and allowlist resolution are all correct for the recommended approach.
- **Parent context injection: Approach C (hybrid) recommended.** Inject parent goal directory path into initial message, let LLM read parent files on demand. Minimal token overhead, guided behavior, fresh context.
- **Read access works naturally:** Write-only protection means reads are unrestricted. No changes needed.

## Session Hierarchy and Navigation (from Dimension 6)

- **Pi `parentSession` supports arbitrary depth:** Confirmed via evidence from `launchCapability()` (no depth check), pi `ctx.newSession()` docs (no depth constraint), and session header format (linked-list chain). No changes required.
- **`/pio-parent` single-hop behavior is acceptable:** One command = one hop. Multiple invocations for deep nesting (2-3 levels typical) is acceptable. No changes required for core functionality.
- **Session naming improvement recommended:** `deriveSessionName()` should format qualified names by replacing `__` with `/` for display. E.g., `parent__S03__nested` → `parent/S03/nested`. Categorization: **new logic** (cosmetic, non-breaking).
- **Breadcrumb/chain visibility deferred:** A `/pio-session-chain` command is feasible but not required for subgoal viability. Defer to future enhancement.
