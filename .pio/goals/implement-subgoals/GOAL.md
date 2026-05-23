# Implement Nested Subgoals

Add nested subgoal support to pio: plan steps marked as composite can spawn child goal workspaces that run through the full pio lifecycle recursively. When a subgoal completes, control propagates back to the parent's next step. All changes are additive — existing goals and plans without subgoal metadata continue to function identically.

Authoritative specification: `docs/plans/subgoals/SYNTHESIS.md` (summary) and `docs/plans/subgoals/FEASIBILITY.md` (full 9-dimension analysis).

## Current State

pio manages goals as flat workspaces under `.pio/goals/<name>/`. Each goal progresses through a linear lifecycle: `create-goal → create-plan → evolve-plan → execute-task → review-task → finalize-goal`. Plan steps (`S01/`, `S02/`, etc.) are atomic — each step produces `TASK.md` + `TEST.md`, is implemented in one session, and reviewed in one session. There is no mechanism to decompose a single step into a nested goal with its own plan, multiple sub-steps, and independent lifecycle.

**Path resolution** (`src/fs-utils.ts`): `resolveGoalDir(cwd, name)` always produces flat paths: `<cwd>/.pio/goals/<name>/`. No support for nested subgoal paths. `deriveSessionName(goalName, capability, stepNumber)` formats session names from flat goal names only.

**Queue keying** (`src/queues.ts`): Per-goal single-slot queue uses flat `goalName` to derive filenames: `task-{goalName}.json`. `enqueueTask`, `readPendingTask`, and `listPendingGoals` all operate on flat names — sibling subgoals with identical leaf names would collide.

**State machine** (`src/state-machine.ts`): Pure transition resolver dispatching on capability name. Transitions are linear within one goal: `evolve-plan → execute-task → review-task → evolve-plan (cycle)`, with `revise-plan` branching off and `finalize-goal` as terminal. No concept of parent-child relationships, subgoal spawning, or completion propagation across goals.

**GoalState** (`src/goal-state.ts`): Lazy-evaluated filesystem view over a single goal workspace. `createGoalState(goalDir)` derives `goalName` from `path.basename(goalDir)` — just the leaf name. `pendingTask()` constructs queue path from flat `goalName`. CWD derivation using `indexOf("/goals/")` already works correctly at all nesting depths (confirmed in feasibility study).

**Session capability** (`src/capabilities/session-capability.ts`): `pio_mark_complete` orchestrates the exit lifecycle — validation, transition routing via `resolveTransition`, and task enqueuing. Uses `state.goalName` (leaf basename) for `enqueueTask`. Transition params propagate `goalName` and `stepNumber` but no parent context.

**Evolve-plan** (`src/capabilities/evolve-plan.ts`): Validates PLAN.md exists, finds next step via `GoalState.currentStepNumber()`, creates `S{NN}/` folder, and launches the specification writer session. No subgoal detection — every step produces TASK.md + TEST.md.

**Plan frontmatter** (`src/frontmatter-schemas.ts`): `PLAN_FRONTMATTER_SCHEMA` defines a single required field: `totalSteps` (integer ≥ 1). No support for marking which steps are subgoals.

**Prompts:**
- `create-plan.md`: Planning agent writes PLAN.md from GOAL.md. No instructions about subgoal decomposition.
- `evolve-plan.md`: Specification writer produces TASK.md + TEST.md per step. No instructions about detecting composite steps.
- `finalize-goal.md`: Reads accumulated decisions, updates `.pio/PROJECT/`. Unaware of parent-child relationships.
- `create-goal.md`: Goal Definition Assistant writes GOAL.md. No instructions about reading parent context for subgoals.

**Skills:** `pio-planning/SKILL.md` documents step design rules but has no leaf-node criteria or decomposition guards. `pio/SKILL.md` describes the flat workflow lifecycle without nested subgoals.

## To-Be State

### Nesting structure on disk

Subgoal workspaces live at `S{NN}/subgoals/<name>/` inside parent step directories. The `subgoals/` directory marker prevents naming collisions with the `steps()` scanner regex (`/^S(\d+)$/`). Structure example:

```
.pio/goals/parent-goal/
├── S03/
│   ├── TASK.md, TEST.md
│   └── subgoals/
│       └── nested-feature/      ← subgoal workspace
│           ├── GOAL.md
│           ├── PLAN.md
│           ├── S01/
│           │   └── TASK.md, TEST.md
│           └── S02/
│               └── TASK.md, TEST.md
```

Recursive nesting is supported: each level adds `subgoals/<name>/` to the path.

### Path resolution infrastructure

- `resolveGoalDir(cwd, name)` extended with optional `parentStepDir?: string` parameter. When present, resolves relative to parent step: `path.join(parentStepDir, "subgoals", name)`. Existing callers without this parameter work identically (backward compatible).
- New `deriveQueueKey(goalDir, cwd)` pure function in `src/queues.ts`: strips `.pio/goals/` prefix, filters out `subgoals` markers, joins segments with `__`. Flat goals produce identical output to current behavior. Examples: `my-feature` → `my-feature`, `parent/S03/subgoals/nested` → `parent__S03__nested`.
- `deriveSessionName` extended with optional parent path prefix for display formatting (`__` → `/`).

### Queue keying

- `enqueueTask` and `readPendingTask` accept optional `qualifiedName?: string` parameter. When present, use it as the queue key. Derive via `deriveQueueKey`.
- `listPendingGoals` returns qualified names (may contain `__` delimiters). Downstream code must handle hierarchical names.
- `GoalState.pendingTask()` computes qualified queue key from `goalDir` using `deriveQueueKey`.

### State machine transitions

All changes are additive — new params (`parentGoalName`, `parentStepNumber`, `subgoalType`) are optional.

**Subgoal spawning** (`transitionEvolvePlan`): When the current step is flagged as a subgoal (via PLAN.md annotations), route to `create-goal` with `parentGoalName`, `parentStepNumber`, and `subgoalType: true` in params. New helper `stepIsSubgoal(state, stepNumber)` reads step-level metadata from PLAN.md body (in-body `[subgoal]` annotations) or frontmatter (`subgoalSteps` array).

**Completion propagation** (`transitionFinalizeGoal`): New function extracted from the inline `undefined` return in `resolveTransition`. For subgoals (has `parentGoalName` param), returns `evolve-plan` for the parent with `stepNumber: parentStepNumber + 1`. For top-level goals, returns `undefined` (terminal, unchanged). The subgoal's `COMPLETED` marker is the authoritative signal — subgoal completion = parent step completion.

**Param scoping:** `parentGoalName` and `parentStepNumber` are top-level params on subgoal sessions only. Checked explicitly, never recursed into `_sessionContext`. Not forwarded to parent's `evolve-plan`.

### Planning awareness

- **In-body annotations (primary):** `[subgoal]` marker in step headings within PLAN.md body. Human-readable, backward compatible, co-located with step content. Example: `### Step 3: Build the pipeline [subgoal]`
- **Optional frontmatter:** New `subgoalSteps?: number[]` optional field in `PLAN_FRONTMATTER_SCHEMA`. Machine-readable convenience — lists step numbers that are subgoals.
- `create-plan.md` prompt: Planning agent evaluates each step against leaf-node criteria (I/O contract test, encapsulation rule) and marks composite steps with `[subgoal]` annotations. Step count guard (`totalSteps > 8`) prevents flat trees.
- `evolve-plan.md` prompt: Specification writer detects subgoal steps before launching; routes to `create-goal` directly instead of producing TASK.md/TEST.md.

### Evolve-plan integration

- `validateAndFindNextStep` in `src/capabilities/evolve-plan.ts`: Detects if the next step is a subgoal. If so, skips TASK.md/TEST.md generation and routes to `create-goal` with parent context.
- `handleEvolvePlan`: Uses state machine transition (`resolveTransition`) which now handles subgoal routing via `transitionEvolvePlan`.

### Session capability integration

- `pio_mark_complete` uses the transition's `params.goalName` for `enqueueTask`, enabling parent queue slot restoration when subgoal completes. For flat goals, behavior is unchanged.

### Prompt and skill updates

- `create-plan.md`: Add subgoal decomposition instructions (leaf-node criteria, `[subgoal]` annotation format).
- `evolve-plan.md`: Add subgoal step detection instructions.
- `finalize-goal.md`: Add subgoal-aware summary reading — when a step has subgoals, read subgoal `COMPLETED` marker and subgoal summaries instead of step-level TASK.md/TEST.md.
- `create-goal.md`: Add parent context reading instructions — for subgoals, read parent PLAN.md and parent step's context to understand the decomposition scope.
- `pio-planning/SKILL.md`: Document leaf-node criteria, `[subgoal]` annotation format, decomposition guards (step count guard at 8).
- `pio/SKILL.md`: Update workflow lifecycle diagram to show subgoal spawning from `evolve-plan` and completion propagation through `finalize-goal`.

### File modification inventory (14 files, 0 breaking changes)

| File | Change |
|------|--------|
| `src/fs-utils.ts` | `resolveGoalDir` extension with `parentStepDir`; `deriveSessionName` formatting |
| `src/goal-state.ts` | Optional qualified name in `pendingTask()` via `deriveQueueKey` |
| `src/queues.ts` | Hierarchical queue keys; new `deriveQueueKey()` helper |
| `src/state-machine.ts` | Subgoal spawning (`transitionEvolvePlan`), completion propagation (`transitionFinalizeGoal`), body parsing |
| `src/capabilities/evolve-plan.ts` | Subgoal step detection in `validateAndFindNextStep`; routing in `handleEvolvePlan` |
| `src/capabilities/session-capability.ts` | Use transition's `params.goalName` for `enqueueTask` |
| `src/capabilities/create-plan.ts` | Parse step annotations, validate `subgoalSteps` in `postValidateCreatePlan` |
| `src/capabilities/list-goals.ts` | Recursive scan for nested subgoals |
| `src/frontmatter-schemas.ts` | Optional `subgoalSteps` array in `PLAN_FRONTMATTER_SCHEMA` |
| `src/prompts/create-plan.md` | Subgoal decomposition instructions |
| `src/prompts/create-goal.md` | Parent context reading instructions |
| `src/prompts/evolve-plan.md` | Subgoal detection instructions |
| `src/prompts/finalize-goal.md` | Subgoal-aware summary reading |
| `src/skills/pio-planning/SKILL.md` | Leaf-node criteria, decomposition guards |

### Backward compatibility guarantees

- Flat goals produce identical queue filenames (`task-my-feature.json`) — no migration needed.
- Plans without `[subgoal]` annotations are treated as all regular steps — existing plans work unchanged.
- `PLAN_FRONTMATTER_SCHEMA` change is additive (optional field) — existing plans validate identically.
- All new state machine params are optional — callers without them see identical behavior.
- `resolveGoalDir` default behavior (flat paths) is preserved when `parentStepDir` is omitted.
