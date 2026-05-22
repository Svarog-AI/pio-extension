---
totalSteps: 7
---

# Plan: Implement Nested Subgoals

Add nested subgoal support to pio: plan steps marked `complexity: "subgoal"` in PLAN.md frontmatter spawn child goal workspaces under `S{NN}/subgoals/<name>/` that run through the full pio lifecycle recursively. All changes are additive — existing flat goals and plans function identically.

## Prerequisites

None.

## Steps

### Step 1: Path resolution infrastructure [COMPLETED]

**Description:** Extended path resolution to support nested subgoal directories. `resolveGoalDir` gained optional `parentStepDir` parameter for nested paths; `deriveSessionName` replaces `__` with `/` for hierarchical display names. Backward compatible — existing flat-goal callers work identically.

**Status:** COMPLETED — implementation approved in S01, committed (`d15707a`). Do not modify.

### Step 2: Queue keying [COMPLETED]

**Description:** Introduced `deriveQueueKey(goalDir, cwd)` to produce unique hierarchical queue keys (e.g., `parent__S03__nested`). Extended `enqueueTask` and `readPendingTask` with optional `qualifiedName` parameter. Updated `GoalState.pendingTask()` to compute qualified keys via `deriveQueueKey`. Flat goals produce identical output — no migration needed.

**Status:** COMPLETED — implementation approved in S02, committed (`8eba42b`). Do not modify.

### Step 3: Plan frontmatter with per-step metadata and enriched StepStatus

Extend PLAN.md frontmatter schema, validation, and `GoalState` so every step has structured metadata available via `StepStatus`. Subgoal detection reads from `StepStatus` — no body-scanning of markdown headings.

**New `PLAN_FRONTMATTER_SCHEMA` fields:**
- Optional `steps` array: each entry has `name` (string, always present) and `complexity` (union of `"task"` | `"subgoal"`, defaults to `"task"`)
- Array position determines step ordering (index + 1 = step number). No explicit `number` field.
- When `complexity` is `"subgoal"`, that step spawns a subgoal workspace named by the step's `name` value
- A step with `complexity: "task"` (or missing `complexity`) is a leaf node — normal TASK.md/TEST.md generation

**TypeBox schema change in `src/frontmatter-schemas.ts`:** Add optional `steps` array to `PLAN_FRONTMATTER_SCHEMA`. Each step entry: `{ name: String, complexity: Union("task", "subgoal") }`. The field is optional at the schema level (backward compatible) but enforced by `postValidateCreatePlan` for new plans. Export a derived `StepMetadata` type.

**`GoalState` enrichment:** After frontmatter is available, `GoalState.steps()` enriches every `StepStatus` with metadata from the `steps` array. The `StepStatus` interface gains a `getMetadata()` method returning `{ name: string; complexity: "task" | "subgoal" }` when the `steps` frontmatter field exists and the index maps to a valid entry. When frontmatter is absent or the step has no matching entry, `getMetadata()` returns `null`. This is the canonical source of step metadata — downstream code (state machine, evolve-plan) reads from here instead of parsing PLAN.md themselves.

**`postValidateCreatePlan` changes:** Validate that when the `steps` array is present, it has exactly `totalSteps` entries, each entry has a non-empty `name`, and `complexity` is one of the allowed literals (defaulting to `"task"` if omitted). Plans without the `steps` field validate identically to today — treated as having no subgoal metadata.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] Plans without `steps` field validate as valid; `StepStatus.getMetadata()` returns `null` (backward compatible)
- [ ] Plans with `steps` array where entries have `complexity: "subgoal"` pass `postValidateCreatePlan`
- [ ] `postValidateCreatePlan` rejects plans where `steps` array length doesn't match `totalSteps`
- [ ] `postValidateCreatePlan` rejects entries with empty `name` or invalid `complexity` value
- [ ] `GoalState.steps()` returns `StepStatus` objects with `getMetadata()` populated from frontmatter when available
- [ ] `getMetadata()` for step N maps to index N-1 in the `steps` array; returns `null` when no frontmatter or out of bounds

**Files affected:**
- `src/frontmatter-schemas.ts` — extend `PLAN_FRONTMATTER_SCHEMA` with optional `steps` array containing `{ name, complexity? }` entries; add `StepMetadata` derived type
- `src/goal-state.ts` — enrich `StepStatus` interface with `getMetadata()` method; populate from frontmatter `steps` array in `createGoalState`
- `src/capabilities/create-plan.ts` — update `postValidateCreatePlan` to validate `steps` array when present (length matches `totalSteps`, non-empty names, valid complexity values)
- `src/capabilities/create-plan.test.ts` — tests for steps array validation
- `src/goal-state.test.ts` — tests for `StepStatus.getMetadata()` with and without frontmatter

### Step 4: State machine transitions

Add subgoal spawning and completion propagation to the state machine. Subgoal detection reads from PLAN.md frontmatter (`steps` array where `complexity === "subgoal"`), NOT from body-scanning of markdown headings.

**New helper `getStepMetadata(goalDir, stepNumber)`:** Reads PLAN.md frontmatter using existing `extractFrontmatter()` + `PLAN_FRONTMATTER_SCHEMA` validation. Looks up the entry at index `stepNumber - 1` in the `steps` array. Returns `{ name, complexity }` if found, or `null` if the `steps` field is absent, the index is out of bounds, or frontmatter parsing fails.

**Subgoal spawning in `transitionEvolvePlan`:** When the current step's metadata has `complexity === "subgoal"` (from frontmatter), route to `create-goal` with `parentGoalName`, `parentStepNumber`, `subgoalType: true`, and explicit `workingDir` (full nested path: `<cwd>/.pio/goals/<parent>/S{NN}/subgoals/<name>`). Uses the `resolveGoalDir(cwd, stepMetadata.name, parentStepDir)` extension from Step 1.

**Completion propagation:** Extract `finalize-goal` handling into a new `transitionFinalizeGoal` function. For subgoals (has `parentGoalName` param), returns `evolve-plan` for the parent with `stepNumber: parentStepNumber + 1`. Does NOT forward `parentGoalName` or `parentStepNumber` to prevent param pollution. For top-level goals, returns `undefined` (terminal, unchanged).

**Update `resolveTransition`:** Wire up `transitionFinalizeGoal` as the handler for the `finalize-goal` case instead of the inline `undefined` return.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] `resolveTransition("evolve-plan", state, { goalName: "parent", stepNumber: 3 })` routes to `create-goal` when step 3 has `complexity: "subgoal"` in frontmatter
- [ ] Subgoal spawning params include explicit `workingDir` (full nested path), `parentGoalName`, `parentStepNumber`, and `subgoalType: true`
- [ ] `resolveTransition("evolve-plan", state, { goalName: "parent", stepNumber: 4 })` routes to `execute-task` when step 4 has `complexity: "task"` (backward compatible)
- [ ] `resolveTransition("finalize-goal", state, { goalName: "nested", parentGoalName: "parent", parentStepNumber: 3 })` routes to `evolve-plan` for parent with `stepNumber: 4`
- [ ] `transitionFinalizeGoal` does NOT forward `parentGoalName`/`parentStepNumber` in returned params (param pollution prevention)
- [ ] `resolveTransition("finalize-goal", state, { goalName: "my-feature" })` returns `undefined` (top-level goal, backward compatible)
- [ ] No body-scanning regex exists for subgoal detection (purely frontmatter-based)

**Files affected:**
- `src/state-machine.ts` — add `getStepMetadata()` helper (reads PLAN.md frontmatter `steps` array); modify `transitionEvolvePlan` for subgoal spawning with explicit `workingDir`; extract `transitionFinalizeGoal`; update `resolveTransition` switch
- `src/state-machine.test.ts` — tests for subgoal spawning, completion propagation, backward-compatible paths

### Step 5: Evolve-plan integration

Detect subgoal steps before launching the specification writer session. When the next step has `complexity: "subgoal"` in PLAN.md frontmatter, skip TASK.md/TEST.md generation and route to `create-goal` with parent context instead.

In `validateAndFindNextStep`: After finding the next step number, check if it's a subgoal step using `getStepMetadata()` from the state machine (reads frontmatter). If so, return a result indicating it's a subgoal along with the step metadata (name). The caller in `handleEvolvePlan` then routes to `create-goal` with `parentGoalName`, `parentStepNumber`, and explicit `workingDir` for the subgoal workspace (`<stepDir>/subgoals/<name>`).

Update the tool's `execute` method similarly: when a subgoal is detected, enqueue a `create-goal` task instead of an `evolve-plan` task.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] Non-subgoal steps proceed identically — `validateAndFindNextStep` returns ready state, launches evolve-plan session as before
- [ ] Subgoal steps are detected via frontmatter and routed to `create-goal` instead of producing TASK.md/TEST.md

**Files affected:**
- `src/capabilities/evolve-plan.ts` — subgoal step detection in `validateAndFindNextStep` using frontmatter; routing in `handleEvolvePlan` and tool execute
- `src/capabilities/evolve-plan.test.ts` — tests for subgoal detection and routing

### Step 6: Session capability + create-plan integration

Two independent changes to close the loop on subgoal lifecycle.

**Session capability:** In `pio_mark_complete`, when enqueuing the next task, use the transition's adjusted `params.goalName` (not `state.goalName`) as the queue key for `enqueueTask`. This enables parent queue slot restoration when a subgoal completes — the `transitionFinalizeGoal` returns the parent's goal name in params, so enqueuing to the parent's slot allows `/pio-next-task` to resume the parent workflow.

**Create-plan validation:** Extend `postValidateCreatePlan` to validate that step entries with `complexity: "subgoal"` have unique `name` values (no two subgoals share the same name). The `STEP_HEADING_RE` regex should NOT be changed — it already matches all `## Step N:` headings correctly regardless of body content.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] `pio_mark_complete` uses transition's adjusted `params.goalName` for enqueuing (parent goal name for subgoals)
- [ ] `postValidateCreatePlan` accepts plans with valid `steps` array including entries with `complexity: "subgoal"`
- [ ] `postValidateCreatePlan` rejects plans with duplicate `name` values among subgoal steps

**Files affected:**
- `src/capabilities/session-capability.ts` — use `nextTask.params?.goalName` for `enqueueTask` goal key instead of `state.goalName`
- `src/capabilities/create-plan.ts` — extend `postValidateCreatePlan` to validate unique `name` values among subgoal entries
- `src/capabilities/session-capability.test.ts` — test for goalName propagation in enqueuing
- `src/capabilities/create-plan.test.ts` — test for duplicate name validation

### Step 7: List-goals, prompts, and skills

Enable `/pio-list-goals` to discover nested subgoals and update documentation so agents understand the subgoal feature.

**List-goals recursive scan:** The command currently scans only `.pio/goals/` at one level. Extend it to recursively find subgoals under `S{NN}/subgoals/<name>/` inside each goal's step directories. For each discovered subgoal, show it prefixed with the parent path (e.g., `parent/S03/nested`) so the table displays the full hierarchy.

**Prompt updates (additive content):**
- `create-plan.md`: Add instructions for writing `steps` array in PLAN.md frontmatter. Planning agent evaluates each step against leaf-node criteria and sets `complexity: "subgoal"` for composite steps. The step `name` is always provided — it serves as the subgoal workspace name when complexity is `"subgoal"`. Step count guard (`totalSteps > 8`) prevents flat trees.
- `evolve-plan.md`: Note that subgoal detection is handled by code-level frontmatter reading (Step 4/5). The specification writer session is never launched for subgoal steps — they route to `create-goal` directly.
- `finalize-goal.md`: Add subgoal-aware summary reading. When a step has subgoals (indicated by a `subgoals/` directory under the step folder), read the subgoal's completion state and summaries instead of expecting TASK.md/TEST.md at the step level.
- `create-goal.md`: Add parent context reading instructions. For subgoal sessions, the initial message includes the parent goal directory path. Instruct the Goal Definition Assistant to read the parent's GOAL.md and relevant step from PLAN.md frontmatter to understand decomposition scope.

**Skill updates:**
- `pio-planning/SKILL.md`: Document leaf-node criteria, frontmatter-based subgoal declaration (`steps` array with `name` + `complexity`), and decomposition guards (step count guard at 8).
- `pio/SKILL.md`: Update workflow lifecycle diagram to show subgoal spawning from `evolve-plan` and completion propagation through `finalize-goal`.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] Flat goals without subgoals display identically (backward compatible)
- [ ] Nested subgoals appear in the list-goals table with hierarchical name prefix
- [ ] All prompt files remain valid markdown (no syntax errors)
- [ ] `create-plan.md` contains instructions for writing `steps` array with `name` and `complexity` fields
- [ ] `finalize-goal.md` contains subgoal-aware summary reading instructions
- [ ] `create-goal.md` contains parent context reading instructions
- [ ] `pio-planning/SKILL.md` documents leaf-node criteria, frontmatter-based subgoal declaration, and decomposition guards

**Files affected:**
- `src/capabilities/list-goals.ts` — recursive scan for `S{NN}/subgoals/*/` directories; hierarchical display names
- `src/prompts/create-plan.md` — add frontmatter-based subgoal instructions (`steps` array with `name`/`complexity`)
- `src/prompts/evolve-plan.md` — note code-level subgoal detection
- `src/prompts/finalize-goal.md` — add subgoal-aware summary reading
- `src/prompts/create-goal.md` — add parent context reading instructions
- `src/skills/pio-planning/SKILL.md` — document leaf-node criteria, frontmatter-based subgoal declaration, decomposition guards
- `src/skills/pio/SKILL.md` — update workflow lifecycle diagram for subgoals

## Notes

- **Backward compatibility is critical.** Every change must be additive. Flat goals without subgoal metadata function identically. The `steps` field in frontmatter is optional at the schema level — existing plans validate unchanged but are treated as having no subgoals.
- **Frontmatter-based subgoal detection only.** Subgoal metadata lives exclusively in PLAN.md frontmatter (`steps` array with `name` + `complexity`). No regex heading parsing, no `[subgoal]` annotations in markdown body. The planning agent writes the structured frontmatter; downstream code reads it programmatically via index lookup.
- **Step naming:** Every step entry must have a `name`. For subgoals, this name becomes the workspace directory name (slugified). For regular tasks, it provides a human-readable identifier that can be used in logs, status displays, and future extensions.
- **`complexity` field is extensible.** Currently supports `"task"` and `"subgoal"`. The union type makes it easy to add new complexity levels later (e.g., `"parallel"`, `"manual"`) without schema changes beyond adding a new literal.
- **Param scoping:** `parentGoalName` and `parentStepNumber` are top-level params on subgoal sessions only. They are checked explicitly, never recursed into `_sessionContext`, and not forwarded to parent's evolve-plan. This prevents param pollution across nesting levels.
- **File protection:** No changes to `validation.ts` — the default-deny check (`tp.startsWith(workingDir + path.sep)`) works for nested paths automatically. The spawning transition MUST pass explicit `params.workingDir` (full nested path) to bypass flat `resolveGoalDir` derivation in `capability-config.ts`.
- **CWD derivation in goal-state.ts** already works correctly at all nesting depths (uses `indexOf("/goals/")`). No changes needed there beyond queue keying (already done in Step 2).
- **Step count guard:** When `totalSteps > 8`, the planning agent should consider subgoal decomposition. Enforced by prompt instructions, not schema constraints.
- **`listPendingGoals` returns qualified names** containing `__` delimiters. Downstream code (e.g., `/pio-list-goals`) must handle hierarchical names — the `resolveGoalDir` extension from Step 1 reconstructs nested paths.
- **No test file for list-goals.** `src/capabilities/list-goals.ts` has no dedicated test file. The executor should add one if the recursive scan logic warrants unit-level verification.
- **Detailed design reference:** For full 9-dimension feasibility analysis, see `docs/plans/subgoals/FEASIBILITY.md`. For the condensed summary with recommended decisions, see `docs/plans/subgoals/SYNTHESIS.md`.
