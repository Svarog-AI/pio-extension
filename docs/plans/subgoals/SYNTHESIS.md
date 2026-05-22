# Subgoals — Feasibility Synthesis

> **Detailed analysis:** See [FEASIBILITY.md](./FEASIBILITY.md) for the full 3200+ line feasibility study covering all 9 dimensions.

## Recommendation

**GO** — Nested subgoals are architecturally viable. All required changes are additive and non-breaking. Existing plans without subgoal metadata continue to function identically.

## Recommended Approach (Summary)

- **Nesting:** `S{NN}/subgoals/<name>/` — subgoals live inside parent step directories
- **Queueing:** Hierarchical keys with `__` delimiters (`task-parent__S03__nested.json`)
- **State machine:** Additive transitions — `evolve-plan` spawns subgoals, `finalize-goal` propagates completion back to parent
- **Trigger:** `create-plan` is the primary initiation point; planning agent marks composite steps with `[subgoal]` annotations
- **File protection:** No changes needed — default-deny check is correct for nested paths
- **Sessions:** Pi supports arbitrary nesting depth; single-hop `/pio-parent` navigation is acceptable
- **Completion:** Subgoal `COMPLETED` marker is authoritative; `finalize-goal` routes to parent's `evolve-plan`
- **Path resolution:** Centralized `resolveGoalDir` extension with optional `parentStepDir` parameter
- **Planning awareness:** In-body annotations (`[subgoal]` in step headings) as primary signaling; optional `subgoalSteps` in frontmatter

## Key Decisions by Dimension

### Dimension 1: Nesting structure on disk

Subgoal workspaces live at `S{NN}/subgoals/<name>/` inside parent step directories. The `subgoals/` directory marker prevents naming collisions with the `steps()` scanner regex (`/^S(\d+)$/`). Cwd derivation (`indexOf("/goals/")`) works correctly at all nesting depths — no changes required. `resolveGoalDir` requires extension for nested resolution.

### Dimension 2: Queue keying strategy

Hierarchical keys with `__` delimiters prevent collisions between sibling subgoals and flat goals. The `deriveQueueKey(goalDir, cwd)` helper strips the `subgoals/` marker and joins path segments. Flat goals produce identical filenames — fully backward compatible.

### Dimension 3: State machine extensions

New transitions are additive: `transitionEvolvePlan` routes to `create-goal` for subgoal steps; `transitionFinalizeGoal` routes to the parent's `evolve-plan` on subgoal completion. The parent implicitly pauses — no active coordination protocol. No concurrency support.

### Dimension 4: Subgoal trigger mechanism

`create-plan` is the primary initiation point. The planning agent evaluates each step against leaf-node criteria (I/O contract test, encapsulation rule) and marks composite steps. `evolve-plan` serves as a correction fallback. Step count guard (`totalSteps > 8`) prevents flat trees.

### Dimension 5: File protection scope

No changes to `validation.ts` — the default-deny check (`tp.startsWith(workingDir + path.sep)`) is correct for nested paths. The spawning transition passes explicit `params.workingDir` to bypass flat `resolveGoalDir` derivation. Parent context is injected via the initial message (hybrid approach).

### Dimension 6: Session hierarchy and navigation

Pi's `parentSession` supports arbitrary depth — confirmed via code evidence and API docs. `/pio-parent` single-hop navigation is acceptable for typical 2-3 level nesting. `deriveSessionName` formats qualified names for display (`__` → `/`).

### Dimension 7: Completion propagation

The subgoal's `COMPLETED` marker is authoritative (per user preference). `finalize-goal` routes to the parent's `evolve-plan` — symmetric with `review-task` (approved) → `evolve-plan`. `pio_mark_complete` uses the transition's `params.goalName` for enqueuing, enabling parent queue slot restoration.

### Dimension 8: GoalState and path resolution

17 function groups audited across 12 source files. 6 require changes (new logic or new fields); the remainder require no changes. The fix is centralized in `resolveGoalDir` — once extended, all downstream capability files are fixed automatically.

### Dimension 9: Planning awareness

In-body annotations (`[subgoal]` in step headings) are the primary signaling mechanism — backward compatible, human-readable, and co-located with step content. Optional `subgoalSteps` in frontmatter provides machine-readable convenience. `transitionEvolvePlan` parses PLAN.md body and routes to `create-goal` for subgoal steps.

## File Modification Inventory

| File | Category | Brief Description |
|------|----------|-------------------|
| `src/fs-utils.ts` | new logic | `resolveGoalDir` extension for nested paths; `deriveSessionName` formatting |
| `src/goal-state.ts` | new fields, new logic | Optional `qualifiedName` param; `pendingTask()` with hierarchical keys |
| `src/queues.ts` | new logic | Hierarchical queue keys; new `deriveQueueKey()` helper |
| `src/state-machine.ts` | new logic | Subgoal spawning (`transitionEvolvePlan`), completion propagation (`transitionFinalizeGoal`), body parsing (`getStepAnnotation`) |
| `src/capabilities/evolve-plan.ts` | new logic | Subgoal step detection in `validateAndFindNextStep`; routing in `handleEvolvePlan` |
| `src/capabilities/session-capability.ts` | new logic | Use transition's `params.goalName` for `enqueueTask` |
| `src/capabilities/create-plan.ts` | new logic | Parse step annotations, validate `subgoalSteps` in `postValidateCreatePlan` |
| `src/capabilities/list-goals.ts` | new logic | Recursive scan for nested subgoals |
| `src/frontmatter-schemas.ts` | new fields | Optional `subgoalSteps` array in `PLAN_FRONTMATTER_SCHEMA` |
| `src/prompts/create-plan.md` | new logic | Subgoal decomposition instructions |
| `src/prompts/create-goal.md` | new logic | Parent context reading instructions |
| `src/prompts/evolve-plan.md` | new logic | Subgoal detection instructions |
| `src/prompts/finalize-goal.md` | new logic | Subgoal-aware summary reading |
| `src/skills/pio-planning/SKILL.md` | new logic | Leaf-node criteria, decomposition guards |

**14 files modified. 0 breaking changes. All changes are additive.**

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Coordination complexity** — multiple files must change in lockstep | Medium | Phased implementation: path resolution → state machine → planning awareness → prompts |
| **`evolve-plan` validation gap** — subgoal steps skip TASK.md/TEST.md | Low-Medium | Detect subgoal steps before launching `evolve-plan` session; route to `create-goal` directly |
| **Param pollution** — `parentGoalName` leaks via `_sessionContext` | Low | Check top-level params only; don't propagate parent context to parent's tasks |
| **Test coverage gaps** — new behavior lacks existing tests | Medium | Prioritize unit tests for pure functions; add integration tests for subgoal lifecycle |
| **Plan format evolution** — external tools may not handle new format | Low | In-body annotations are backward compatible; missing annotations = all regular steps |

## Next Steps

1. **Create an implementation goal** (`/pio-create-goal subgoals-implementation`) to drive the actual code changes.
2. **Phase the rollout:**
   - Phase 1: Path resolution infrastructure (`resolveGoalDir`, `deriveQueueKey`)
   - Phase 2: State machine transitions (spawning + completion propagation)
   - Phase 3: Planning awareness (annotations + detection + prompts)
   - Phase 4: Prompt and skill updates
3. **Each phase should include tests** — unit tests for pure functions, integration tests for the complete subgoal lifecycle.
4. **Validate backward compatibility** at each phase — existing goals and plans must continue to function identically.
