---
totalSteps: 7
steps:
  - name: path-resolution-infrastructure
    complexity: task
  - name: queue-keying
    complexity: task
  - name: plan-frontmatter-metadata
    complexity: task
  - name: state-machine-transitions
    complexity: task
  - name: evolve-plan-integration
    complexity: task
  - name: session-capability-integration
    complexity: task
  - name: list-goals-prompts-skills
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

**Status:** COMPLETED — implementation approved in S04. Do not modify. Note: Step 5 extends this by adding `initialMessage` to subgoal routing params.

### Step 5: Evolve-plan integration with TASK.md as subgoal context

**Description:** Detect subgoal steps before launching the evolve-plan session. For subgoal steps, the evolve-plan LLM session still runs — but instead of producing `TASK.md` + `TEST.md`, it produces **only `TASK.md`** containing a context-aware decomposition message. This is the key architectural change from the original plan: rather than bypassing evolve-plan with a code-level string template (which can't capture nuanced context), the LLM session runs and crafts TASK.md by reading parent GOAL.md, PLAN.md, and step context.

When `transitionEvolvePlan` routes to `create-goal`, it passes an `initialMessage` that instructs the Goal Definition Assistant to read TASK.md from disk as a starting point. The state machine does NOT read TASK.md itself — it simply tells the session where to find it (relative path from the subgoal workspace). No file I/O in the state machine.

**Evolve-plan capability changes (`src/capabilities/evolve-plan.ts`):**
- `validateAndFindNextStep`: After finding the next step number, check if it's a subgoal step using `state.steps()[n].getMetadata()`. If so, return the result with a flag (e.g., `isSubgoal: true`) and the subgoal name from metadata. The caller (`handleEvolvePlan`) uses this to configure the session differently for subgoals.
- Validation config: For subgoal steps, expect **only `TASK.md`** (not `[TASK.md, TEST.md]`). Update `resolveEvolveValidation` callback to accept a flag or check subgoal metadata and adjust expected files accordingly.
- Write allowlist: For subgoal steps, allow only `${folder}/TASK.md` and related markers (no `TEST.md`).
- Default initial message: For subgoal steps, instruct the LLM to produce TASK.md containing a context-aware decomposition scope — reading parent GOAL.md + PLAN.md step context, describing what area of work is being decomposed.

**Tool execute (`pio_evolve_plan`):** When a subgoal is detected during validation, enqueue `evolve-plan` with the step number as usual. The tool always enqueues `"evolve-plan"` regardless of step type — differentiation happens at session launch time and at transition time.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions (600+ tests)
- [ ] `validateAndFindNextStep` returns `isSubgoal: true` when next step has `complexity: "subgoal"` in frontmatter
- [ ] Non-subgoal steps proceed identically — evolve-plan session produces TASK.md + TEST.md as before
- [ ] Subgoal steps launch evolve-plan session configured to produce only TASK.md (no TEST.md)
- [ ] `transitionEvolvePlan` passes `initialMessage` instructing the session to read TASK.md from disk (e.g., "read ../../S{NN}/TASK.md as a starting point")
- [ ] Validation passes with only TASK.md present for subgoal step folders

**Files affected:**
- `src/capabilities/evolve-plan.ts` — subgoal detection in `validateAndFindNextStep`; conditional validation/writeAllowlist for subgoals; conditional initial message
- `src/capabilities/evolve-plan.test.ts` — tests for subgoal detection, conditional validation
- `src/state-machine.ts` — extend subgoal routing to pass `initialMessage` pointing at TASK.md path (small additive change)
- `src/state-machine.test.ts` — test for initialMessage in subgoal spawning params

### Step 6: Session capability integration and create-plan validation

**Description:** Two independent changes to close the loop on subgoal lifecycle.

**Session capability (`src/capabilities/session-capability.ts`):** In `pio_mark_complete`, when enqueuing the next task, use the transition's adjusted `params.goalName` as the queue key for `enqueueTask`. Currently it uses `state.goalName` (leaf basename). For subgoals, `transitionFinalizeGoal` returns `goalName: parentGoalName` — using this enables parent queue slot restoration when a subgoal completes. The `/pio-next-task` command then resumes the parent workflow.

**Create-plan validation (`src/capabilities/create-plan.ts`):** Extend `postValidateCreatePlan` to validate that step entries with `complexity: "subgoal"` have unique `name` values (no two subgoals share the same name, preventing path collisions). The `STEP_HEADING_RE` regex should NOT be changed — it already matches all `## Step N:` headings correctly regardless of body content.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] `pio_mark_complete` uses transition's adjusted `params.goalName` for enqueuing (parent goal name for subgoals)
- [ ] `postValidateCreatePlan` accepts plans with valid `steps` array including entries with `complexity: "subgoal"`
- [ ] `postValidateCreatePlan` rejects plans with duplicate `name` values among subgoal steps

**Files affected:**
- `src/capabilities/session-capability.ts` — use `nextTask.params?.goalName` for `enqueueTask` goal key instead of `state.goalName`
- `src/capabilities/session-capability.test.ts` — test for goalName propagation in enqueuing
- `src/capabilities/create-plan.ts` — extend `postValidateCreatePlan` to validate unique `name` values among subgoal entries
- `src/capabilities/create-plan.test.ts` — test for duplicate name validation

### Step 7: List-goals, prompts, and skills

**Description:** Enable `/pio-list-goals` to discover nested subgoals and update documentation so agents understand the subgoal feature.

**List-goals recursive scan (`src/capabilities/list-goals.ts`):** The command currently scans only `.pio/goals/` at one level. Extend it to recursively find subgoals under `S{NN}/subgoals/<name>/` inside each goal's step directories. For each discovered subgoal, show it prefixed with the parent path (e.g., `parent/S03/nested`) so the table displays the full hierarchy.

**Prompt updates (additive content):**
- `create-plan.md`: Add instructions for writing `steps` array in PLAN.md frontmatter. Planning agent evaluates each step against leaf-node criteria and sets `complexity: "subgoal"` for composite steps. The step `name` is always provided — it serves as the subgoal workspace name when complexity is `"subgoal"`. Step count guard (`totalSteps > 8`) prevents flat trees.
- `evolve-plan.md`: Add instructions for subgoal steps. When working on a subgoal step (indicated by session config), produce only `TASK.md` — no `TEST.md`. TASK.md should contain a context-aware decomposition scope: read parent GOAL.md, read the relevant PLAN.md step, and describe the area of work being decomposed. This file is later read from disk by the create-goal subgoal session.
- `finalize-goal.md`: Add subgoal-aware summary reading. When a step has subgoals (indicated by a `subgoals/` directory under the step folder), read the subgoal's completion state and summaries instead of expecting TASK.md/TEST.md at the step level.

**Skill updates:**
- `pio-planning/SKILL.md`: Document leaf-node criteria, frontmatter-based subgoal declaration (`steps` array with `name` + `complexity`), decomposition guards (step count guard at 8).
- `pio/SKILL.md`: Update workflow lifecycle diagram to show subgoal spawning from `evolve-plan` and completion propagation through `finalize-goal`.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] Flat goals without subgoals display identically in list-goals (backward compatible)
- [ ] Nested subgoals appear in the list-goals table with hierarchical name prefix
- [ ] All prompt files remain valid markdown (no syntax errors)
- [ ] `create-plan.md` contains instructions for writing `steps` array with `name` and `complexity` fields
- [ ] `evolve-plan.md` contains instructions for producing TASK.md (no TEST.md) for subgoal steps
- [ ] `finalize-goal.md` contains subgoal-aware summary reading instructions
- [ ] `pio-planning/SKILL.md` documents leaf-node criteria, frontmatter-based subgoal declaration, and decomposition guards

**Files affected:**
- `src/capabilities/list-goals.ts` — recursive scan for `S{NN}/subgoals/*/` directories; hierarchical display names
- `src/prompts/create-plan.md` — add frontmatter-based subgoal instructions (`steps` array with `name`/`complexity`)
- `src/prompts/evolve-plan.md` — add subgoal step instructions (produce only TASK.md, no TEST.md)
- `src/prompts/finalize-goal.md` — add subgoal-aware summary reading
- `src/skills/pio-planning/SKILL.md` — document leaf-node criteria, frontmatter-based subgoal declaration, decomposition guards
- `src/skills/pio/SKILL.md` — update workflow lifecycle diagram for subgoals

## Notes

- **Backward compatibility is critical.** Every change must be additive. Flat goals without subgoal metadata function identically. The `steps` field in frontmatter is required at the schema level but old plans degrade gracefully — `GoalState.planMetadata()` returns null, `getMetadata()` returns null, and existing workflows continue.
- **Frontmatter-based subgoal detection only.** Subgoal metadata lives exclusively in PLAN.md frontmatter (`steps` array with `name` + `complexity`). No regex heading parsing, no `[subgoal]` annotations in markdown body. The planning agent writes the structured frontmatter; downstream code reads it programmatically via index lookup.
- **TASK.md as subgoal context.** For subgoal steps, evolve-plan produces TASK.md containing a context-aware decomposition scope crafted by the LLM. `transitionEvolvePlan` passes an `initialMessage` telling the create-goal session to read TASK.md from disk (relative path) — it does NOT read file content itself. The create-goal prompt (`create-goal.md`) requires no changes; the initial message carries the instruction.
- **Param scoping:** `parentGoalName` and `parentStepNumber` are top-level params on subgoal sessions only. They are checked explicitly, never recursed into `_sessionContext`, and not forwarded to parent's evolve-plan. This prevents param pollution across nesting levels.
- **File protection:** No changes to `validation.ts` — the default-deny check (`tp.startsWith(workingDir + path.sep)`) works for nested paths automatically. The spawning transition passes explicit `params.workingDir` (full nested path) to bypass flat `resolveGoalDir` derivation in `capability-config.ts`.
- **CWD derivation in goal-state.ts** already works correctly at all nesting depths (uses `indexOf("/goals/")`). No changes needed there beyond queue keying (already done in Step 2).
- **Step count guard:** When `totalSteps > 8`, the planning agent should consider subgoal decomposition. Enforced by prompt instructions, not schema constraints.
- **`listPendingGoals` returns qualified names** containing `__` delimiters. Downstream code must handle hierarchical names — the `resolveGoalDir` extension from Step 1 reconstructs nested paths.
- **No test file for list-goals.** `src/capabilities/list-goals.ts` has no dedicated test file. The executor should add one if the recursive scan logic warrants unit-level verification.
- **`deriveQueueKey` throws on invalid prefix:** Documented in S02/DECISIONS.md as a medium-severity deviation from original TASK.md. All current callers construct valid paths via `createGoalState`. Downstream code should be aware that `deriveQueueKey` can throw if called with unexpected paths.
