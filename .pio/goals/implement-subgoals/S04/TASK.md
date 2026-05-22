# Task: State machine transitions

Add subgoal spawning and completion propagation to the state machine. Subgoal detection reads from PLAN.md frontmatter (`steps` array where `complexity === "subgoal"`), NOT from body-scanning of markdown headings.

## Context

pio's state machine (`src/state-machine.ts`) orchestrates capability transitions via `resolveTransition()`. Currently it handles a flat lifecycle: create-goal → create-plan → evolve-plan → execute-task → review-task → finalize-goal (terminal). With nested subgoals, two new behaviors are needed:

1. **Subgoal spawning:** When `evolve-plan` targets a step marked as a subgoal in PLAN.md frontmatter, route to `create-goal` (not `execute-task`) so the subgoal goes through its own full lifecycle.
2. **Completion propagation:** When a subgoal's `finalize-goal` completes, route back to `evolve-plan` on the parent goal at the next step, allowing the parent workflow to continue.

Step 3 provided the frontmatter schema (`steps` array with `name` + `complexity`) and `StepStatus.getMetadata()` in GoalState. Step 1 provided `resolveGoalDir(cwd, name, parentStepDir)` for nested path resolution. Step 4 connects these via the state machine.

## What to Build

### New helper: `getStepMetadata(goalDir, stepNumber)`

A pure utility function that reads PLAN.md frontmatter from a goal directory and extracts metadata for a specific step number. This is the canonical source of truth for step-level subgoal detection in the state machine — no body-scanning of markdown headings.

**Behavior:**
- Takes `goalDir` (absolute path to a goal workspace) and `stepNumber` (1-based integer).
- Constructs PLAN.md path: `path.join(goalDir, "PLAN.md")`.
- Reads frontmatter using existing `extractFrontmatter()` from `./frontmatter`.
- Validates against `PLAN_FRONTMATTER_SCHEMA` using existing `validateAndCoerce()` from `./frontmatter`.
- Looks up entry at index `stepNumber - 1` in the `steps` array.
- Returns `{ name: string; complexity: "task" | "subgoal" }` if found, defaulting `complexity` to `"task"` when omitted (consistent with Step 3).
- Returns `null` if: PLAN.md doesn't exist, no valid frontmatter, schema validation fails, `steps` array is missing/empty, or index is out of bounds.

**Interface:**
```typescript
export function getStepMetadata(
  goalDir: string,
  stepNumber: number,
): StepMetadata | null;
```

### Subgoal spawning in `transitionEvolvePlan`

Modify the existing `transitionEvolvePlan` function to detect subgoal steps before routing to `execute-task`. When a step is flagged as a subgoal (from frontmatter), route to `create-goal` with parent context.

**Behavior changes:**
1. After extracting `explicitStepNumber` and `goalName`, compute `goalDir` via `resolveGoalDir(cwd, goalName)`.
2. Call `getStepMetadata(goalDir, explicitStepNumber)` when `explicitStepNumber` is available.
3. If metadata has `complexity === "subgoal"`, route to `create-goal` with params:
   - `goalName`: the subgoal's `name` from step metadata (workspace directory name)
   - `parentGoalName`: the parent goal name from params
   - `parentStepNumber`: the current step number
   - `subgoalType: true`: marker for downstream session capability to recognize subgoal sessions
   - `workingDir`: explicit full nested path computed via `resolveGoalDir(cwd, metadata.name, parentStepDir)` where `parentStepDir = path.join(goalDir, stepFolderName(stepNumber))`. This is the `<cwd>/.pio/goals/<parent>/S{NN}/subgoals/<name>` path.
4. All existing routing (revision-needed → revise-plan, goal-completed → finalize-goal, normal → execute-task) proceeds when complexity is `"task"` or metadata is `null`.

**Routing order in `transitionEvolvePlan`:** revision check → subgoal spawning → goal completion check → execute-task. Subgoal detection happens BEFORE the goal-completed check so that a subgoal step spawns even if other steps are already complete.

### Completion propagation: `transitionFinalizeGoal`

Extract `finalize-goal` handling from the inline `undefined` return into a dedicated function. This enables completion propagation from subgoals back to their parent goals.

**Behavior:**
- Takes `state: GoalState` and `params?: Record<string, unknown>`.
- Check for `parentGoalName` in params (string type check).
- **Subgoal path (has `parentGoalName`):** Return `{ capability: "evolve-plan", params }` where `params` contain:
  - `goalName`: the parent goal name from `parentGoalName`
  - `stepNumber`: `parentStepNumber + 1` (next step after the subgoal)
  - **Do NOT forward** `parentGoalName`, `parentStepNumber`, or `subgoalType` to prevent param pollution across nesting levels.
- **Top-level goal path (no `parentGoalName`):** Return `undefined` (terminal, unchanged behavior).

**Interface:**
```typescript
function transitionFinalizeGoal(
  state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult | undefined;
```

### Update `resolveTransition`

Replace the inline `return undefined` for `"finalize-goal"` with a call to `transitionFinalizeGoal(state, params)`.

## Dependencies

- **Step 1 (COMPLETED):** `resolveGoalDir(cwd, name, parentStepDir?)` in `src/fs-utils.ts` — used to compute nested subgoal paths.
- **Step 2 (COMPLETED):** Queue keying — not directly used by state machine but required for downstream enqueuing to work correctly with hierarchical goals.
- **Step 3 (COMPLETED):** `PLAN_FRONTMATTER_SCHEMA` with `steps` array, `StepMetadata` type, and `extractFrontmatter`/`validateAndCoerce` utilities — consumed by the new `getStepMetadata()` helper.

## Files Affected

- `src/state-machine.ts` — add `getStepMetadata()` helper (reads PLAN.md frontmatter `steps` array); modify `transitionEvolvePlan` for subgoal spawning with explicit `workingDir`; extract `transitionFinalizeGoal`; update `resolveTransition` switch
- `src/state-machine.test.ts` — tests for subgoal spawning, completion propagation, backward-compatible paths

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] `resolveTransition("evolve-plan", state, { goalName: "parent", stepNumber: 3 })` routes to `create-goal` when step 3 has `complexity: "subgoal"` in frontmatter
- [ ] Subgoal spawning params include explicit `workingDir` (full nested path), `parentGoalName`, `parentStepNumber`, and `subgoalType: true`
- [ ] `resolveTransition("evolve-plan", state, { goalName: "parent", stepNumber: 4 })` routes to `execute-task` when step 4 has `complexity: "task"` (backward compatible)
- [ ] `resolveTransition("finalize-goal", state, { goalName: "nested", parentGoalName: "parent", parentStepNumber: 3 })` routes to `evolve-plan` for parent with `stepNumber: 4`
- [ ] `transitionFinalizeGoal` does NOT forward `parentGoalName`/`parentStepNumber` in returned params (param pollution prevention)
- [ ] `resolveTransition("finalize-goal", state, { goalName: "my-feature" })` returns `undefined` (top-level goal, backward compatible)
- [ ] No body-scanning regex exists for subgoal detection (purely frontmatter-based)

## Risks and Edge Cases

- **Circular imports:** Importing `extractFrontmatter`/`validateAndCoerce` from `./frontmatter` and `PLAN_FRONTMATTER_SCHEMA` from `./frontmatter-schemas` into `state-machine.ts` must not create circular dependencies. Verify: `frontmatter.ts` imports only from external packages (typebox, js-yaml); `frontmatter-schemas.ts` imports only from typebox. No cycle risk.
- **Frontmatter parsing failures:** `getStepMetadata()` must return `null` gracefully when PLAN.md has invalid YAML or missing `steps` array. This allows plans without the new schema to proceed with existing behavior (all steps treated as regular tasks).
- **Subgoal name conflicts:** If multiple subgoals have the same name, they'd create path collisions. Step 6 handles duplicate name validation — Step 4 doesn't need to check this but should pass the name through verbatim from frontmatter.
- **`workingDir` computation accuracy:** The nested path must exactly match `resolveGoalDir(cwd, metadata.name, parentStepDir)` output. A wrong path would break session capability file protection (default-deny check in validation.ts).
- **`process.cwd()` usage:** Existing transitions use `process.cwd()` to resolve goal paths. New subgoal spawning follows this pattern. Tests must mock `process.cwd()` consistently.
