---
totalSteps: 8
steps:
  - name: path-resolution-infrastructure
    complexity: task
  - name: queue-keying
    complexity: task
  - name: plan-frontmatter-metadata
    complexity: task
  - name: state-machine-transitions
    complexity: task
  - name: move-test-generation-to-execute-task
    complexity: task
  - name: subgoal-lifecycle-wiring
    complexity: task
  - name: create-plan-validation-and-list-goals
    complexity: task
  - name: prompts-and-skills
    complexity: task
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

### Step 3: Plan frontmatter with per-step metadata and enriched StepStatus [COMPLETED]

**Description:** Extended `PLAN_FRONTMATTER_SCHEMA` with required `steps` array containing `{ name, complexity? }` entries. Added `StepMetadata` type. Enriched `StepStatus` with `getMetadata()` returning frontmatter data or `null`. Steps derived from `planMetadata()` instead of folder scanning. Updated `postValidateCreatePlan` to validate `steps` array.

**Status:** COMPLETED — implementation approved in S03. Do not modify.

### Step 4: State machine transitions [COMPLETED]

**Description:** Added subgoal spawning in `transitionEvolvePlan`: detects `complexity === "subgoal"` via `state.steps()[n].getMetadata()` and routes to `create-goal` with parent context (`parentGoalName`, `parentStepNumber`, `subgoalType`, explicit `workingDir`). Extracted `transitionFinalizeGoal` for completion propagation: subgoals route back to parent's `evolve-plan`, top-level goals return `undefined`. Updated `resolveTransition` switch.

**Status:** COMPLETED — implementation approved in S04. Do not modify. Note: Step 6 extends this by adding `initialMessage` to subgoal routing params.

### Step 5: Move test generation from evolve-plan to execute-task

**Description:** Evolve-plan produces only TASK.md (never TEST.md). Execute-task reads TASK.md and generates tests itself using TDD methodology. This is the key architectural simplification — TASK.md becomes the universal input artifact for both regular execution (execute-task) and subgoal definition (create-goal), eliminating the need for any conditional logic in evolve-plan based on step type.

**Evolve-plan code changes (`src/capabilities/evolve-plan.ts`):**
- Validation config: expect only `TASK.md` (not `[TASK.md, TEST.md]`). Update `resolveEvolveValidation`.
- Write allowlist: allow `TASK.md` and markers only (no `TEST.md`). Update `resolveEvolveWriteAllowlist`.
- Default initial message: instruct to produce TASK.md only — no mention of TEST.md.
- `validateAndFindNextStep`: consider a step "specified" when TASK.md exists (remove TEST.md check).

**Execute-task code changes (`src/capabilities/execute-task.ts`):**
- `isStepReady` and `validateExplicitStep`: step is ready when TASK.md exists alone (remove TEST.md requirement).
- Read-only files: remove TEST.md from `resolveExecuteReadOnlyFiles`.
- Default initial message: instruct to read TASK.md, derive tests from acceptance criteria using the test-driven-development skill.

**GoalState status logic (`src/goal-state.ts`):**
- `status()`: a step with only TASK.md returns `"defined"` — remove the TEST.md check. Pending = no folder, Defined = has TASK.md, other statuses come from markers.

**Prompt changes:**
- `evolve-plan.md`: Remove the "Write TEST.md" step entirely. The agent writes TASK.md with acceptance criteria detailed enough for an executor to derive tests. Add guidance: "TASK.md is the only output — ensure acceptance criteria are specific enough that an executor can write meaningful tests from them."
- `execute-task.md`: Remove all references to reading TEST.md as an input file. Instruct the executor to derive test cases from TASK.md acceptance criteria using TDD methodology (RED→GREEN→REFACTOR, Arrange-Act-Assert per the test-driven-development skill). Write tests first, then implement.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] Evolve-plan validation expects only TASK.md (not TEST.md)
- [ ] Execute-task considers a step ready when TASK.md exists alone
- [ ] Execute-task prompt instructs deriving tests from TASK.md acceptance criteria using TDD skill
- [ ] `StepStatus.status()` returns `"defined"` when TASK.md exists (no TEST.md required)
- [ ] Evolve-plan prompt no longer instructs writing TEST.md

**Files affected:**
- `src/capabilities/evolve-plan.ts` — remove TEST.md from validation, write allowlist, initial message; update completion checks
- `src/capabilities/evolve-plan.test.ts` — update tests for TASK.md-only workflow
- `src/capabilities/execute-task.ts` — remove TEST.md requirement from isStepReady, validateExplicitStep, readOnlyFiles, initialMessage
- `src/capabilities/execute-task.test.ts` — update tests for TASK.md-only readiness
- `src/goal-state.ts` — status() returns "defined" when TASK.md exists (no TEST.md check)
- `src/goal-state.test.ts` — update status tests
- `src/prompts/evolve-plan.md` — remove TEST.md step; instruct writing testable acceptance criteria
- `src/prompts/execute-task.md` — remove TEST.md references; instruct deriving tests from TASK.md

### Step 6: Subgoal lifecycle wiring

**Description:** Connect the critical path for subgoals to work end-to-end. Two code changes that make the subgoal lifecycle functional: the state machine tells create-goal where to find context, and the session capability routes completion back to the parent queue slot.

**TransitionEvolvePlan initialMessage (`src/state-machine.ts`):** Extend the subgoal routing block to pass an `initialMessage` telling the create-goal session where to find the parent TASK.md (relative path from subgoal workspace). Example: `"This is a subgoal step. Read ../../S{NN}/TASK.md from the parent goal for decomposition scope context."` No file I/O — just constructs a relative path string. Additive extension of Step 4's completed implementation.

**Session capability (`src/capabilities/session-capability.ts`):** In `pio_mark_complete`, use `nextTask.params?.goalName` as the queue key for `enqueueTask` instead of `state.goalName`. For subgoals, `transitionFinalizeGoal` returns `goalName: parentGoalName` — using this enables parent queue slot restoration when a subgoal completes. The `/pio-next-task` command then resumes the parent workflow.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] `transitionEvolvePlan` passes `initialMessage` with relative TASK.md path when routing to create-goal for subgoal steps
- [ ] `pio_mark_complete` uses transition's adjusted `params.goalName` for enqueuing (parent goal name for subgoals)
- [ ] Flat goals without subgoals continue to function identically

**Files affected:**
- `src/state-machine.ts` — pass initialMessage with relative TASK.md path in subgoal routing (additive)
- `src/state-machine.test.ts` — test for initialMessage in subgoal spawning params
- `src/capabilities/session-capability.ts` — use transition's goalName for enqueueTask key
- `src/capabilities/session-capability.test.ts` — test for goalName propagation

### Step 7: Create-plan validation and list-goals recursion

**Description:** Two independent supporting features that round out the subgoal infrastructure. Neither depends on Step 6 being completed first, but they're grouped here as related quality-of-life additions.

**Create-plan validation (`src/capabilities/create-plan.ts`):** Extend `postValidateCreatePlan` to validate that step entries with `complexity: "subgoal"` have unique `name` values (no two subgoals share the same name, preventing path collisions). The `STEP_HEADING_RE` regex should NOT be changed — it already matches all `## Step N:` headings correctly regardless of body content.

**List-goals recursive scan (`src/capabilities/list-goals.ts`):** Scan `.pio/goals/` recursively for subgoals under `S{NN}/subgoals/<name>/`. Display with hierarchical prefix (e.g., `parent/S03/nested`). Backward compatible — flat goals display identically.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] `postValidateCreatePlan` accepts plans with valid `steps` array including entries with `complexity: "subgoal"`
- [ ] `postValidateCreatePlan` rejects plans with duplicate `name` values among subgoal steps
- [ ] Flat goals without subgoals display identically in list-goals (backward compatible)
- [ ] Nested subgoals appear in the list-goals table with hierarchical name prefix

**Files affected:**
- `src/capabilities/create-plan.ts` — validate unique subgoal names in postValidateCreatePlan
- `src/capabilities/create-plan.test.ts` — test for duplicate name validation
- `src/capabilities/list-goals.ts` — recursive subgoal discovery; hierarchical display names

### Step 8: Prompts and skills documentation

**Description:** Additive documentation updates so agents and users understand the subgoal feature. No code changes — purely prompt and skill file updates. These can be completed after the code infrastructure is in place.

**Prompt updates (additive content only):**
- `create-plan.md`: Add instructions for writing `steps` array in PLAN.md frontmatter. Planning agent evaluates each step against leaf-node criteria and sets `complexity: "subgoal"` for composite steps. The step `name` is always provided — it serves as the subgoal workspace name when complexity is `"subgoal"`. Step count guard (`totalSteps > 8`) prevents flat trees.
- `finalize-goal.md`: Add subgoal-aware summary reading — when a step has a `subgoals/` directory, read subgoal summaries instead of step-level TASK.md/TEST.md.

**Skill updates:**
- `pio-planning/SKILL.md`: Document leaf-node criteria, frontmatter-based subgoal declaration (`steps` array with `name` + `complexity`), decomposition guards (step count guard at 8).
- `pio/SKILL.md`: Update workflow lifecycle diagram to show subgoal spawning from `evolve-plan` and completion propagation through `finalize-goal`.

**Acceptance criteria:**
- [ ] All prompt files remain valid markdown (no syntax errors)
- [ ] `create-plan.md` contains instructions for writing `steps` array with `name` and `complexity` fields
- [ ] `finalize-goal.md` contains subgoal-aware summary reading instructions
- [ ] `pio-planning/SKILL.md` documents leaf-node criteria, frontmatter-based subgoal declaration, and decomposition guards
- [ ] `pio/SKILL.md` shows subgoal spawning from evolve-plan in workflow lifecycle diagram

**Files affected:**
- `src/prompts/create-plan.md` — frontmatter-based subgoal instructions
- `src/prompts/finalize-goal.md` — subgoal-aware summary reading
- `src/skills/pio-planning/SKILL.md` — leaf-node criteria, frontmatter declaration, decomposition guards
- `src/skills/pio/SKILL.md` — workflow lifecycle diagram update

## Notes

- **Backward compatibility is critical.** Every change must be additive. Flat goals without subgoal metadata function identically. The `steps` field in frontmatter is required at the schema level but old plans degrade gracefully — `GoalState.planMetadata()` returns null, `getMetadata()` returns null, and existing workflows continue.
- **Evolve-plan has no subgoal special cases.** With TASK.md as the only output artifact (Step 5), evolve-plan code and prompts are identical for regular and subgoal steps. Subgoal detection happens entirely in the state machine transition (Step 4) — routing to create-goal vs execute-task based on frontmatter `complexity`.
- **TASK.md as universal input.** Both execute-task and create-goal read TASK.md from disk. For execute-task: it's the implementation spec + acceptance criteria to derive tests from. For create-goal (subgoal): the initialMessage tells it where to find the parent step's TASK.md for decomposition scope context. No file reading in the state machine; no prompt changes to create-goal.md needed — the initial message carries all necessary instructions.
- **Step 5 is a broad change.** Moving TEST.md generation from evolve-plan to execute-task touches evolve-plan code, execute-task code, GoalState status logic, and two prompts (`evolve-plan.md`, `execute-task.md`). The executor must update all existing tests that reference TEST.md existence or content. Be thorough in regression testing — this changes the core artifact contract between workflow steps.
- **Frontmatter-based subgoal detection only.** Subgoal metadata lives exclusively in PLAN.md frontmatter (`steps` array with `name` + `complexity`). No regex heading parsing, no `[subgoal]` annotations in markdown body.
- **Param scoping:** `parentGoalName` and `parentStepNumber` are top-level params on subgoal sessions only. Checked explicitly, never recursed into `_sessionContext`, not forwarded to parent's evolve-plan.
- **File protection:** No changes to `validation.ts` — the default-deny check (`tp.startsWith(workingDir + path.sep)`) works for nested paths automatically. The spawning transition passes explicit `params.workingDir` (full nested path) to bypass flat `resolveGoalDir` derivation in `capability-config.ts`.
- **CWD derivation in goal-state.ts** already works correctly at all nesting depths (uses `indexOf("/goals/")`). No changes needed there beyond queue keying (already done in Step 2).
- **Step count guard:** When `totalSteps > 8`, the planning agent should consider subgoal decomposition. Enforced by prompt instructions, not schema constraints.
- **`listPendingGoals` returns qualified names** containing `__` delimiters. Downstream code must handle hierarchical names — the `resolveGoalDir` extension from Step 1 reconstructs nested paths.
- **No test file for list-goals.** `src/capabilities/list-goals.ts` has no dedicated test file. The executor should add one if the recursive scan logic warrants unit-level verification.
- **`deriveQueueKey` throws on invalid prefix:** Documented in S02/DECISIONS.md as a medium-severity deviation from original TASK.md. All current callers construct valid paths via `createGoalState`. Downstream code should be aware that `deriveQueueKey` can throw if called with unexpected paths.
