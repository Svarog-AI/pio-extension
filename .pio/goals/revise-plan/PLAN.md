---
totalSteps: 9
---
# Plan: Revise Plan Capability

Add a `revise-plan` capability that archives the current `PLAN.md`, deletes incomplete step folders, and writes a fresh plan for remaining work — plus extract shared planning methodology into a reusable skill.

## Prerequisites

None.

## Steps

## Step 1: Extract planning methodology into shared skill

**Description:** Extract all planning methodology currently in `src/prompts/create-plan.md` into a new shared skill at `src/skills/planning/SKILL.md`. This includes step structure conventions, acceptance criteria rules, research instructions, file conventions (frontmatter with `totalSteps`, step headings format), and the no-source-code policy. The skill should be self-contained — a reader who reads it understands exactly how to write a PLAN.md without needing any other prompt file.

**Acceptance criteria:**
- [ ] `src/skills/planning/SKILL.md` exists with comprehensive planning methodology content
- [ ] All step structure, acceptance criteria, and research instructions from current `create-plan.md` are captured in the skill
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/skills/planning/SKILL.md` — new file: shared planning methodology skill

## Step 2: Add `revisionNeeded()` to StepStatus and GoalState

**Description:** Add a `revisionNeeded(): boolean` method to the `StepStatus` interface in `src/goal-state.ts`. It returns `true` when the step folder contains a `REVISE_PLAN_NEEDED` marker file. This is used by evolve-plan's transition logic to detect that plan revision is required. The implementation follows the existing pattern — lazy filesystem read via `fs.existsSync` on the marker path inside the step directory.

**Acceptance criteria:**
- [ ] `StepStatus` interface has a `revisionNeeded: () => boolean` method
- [ ] Method returns `true` when `REVISE_PLAN_NEEDED` exists in the step folder, `false` otherwise
- [ ] Existing `createGoalState()` factory creates the method on each `StepStatus` instance
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/goal-state.ts` — add `revisionNeeded` to `StepStatus` interface and implementation

## Step 3: Create revise-plan capability implementation

**Description:** Create `src/capabilities/revise-plan.ts` following the existing capability pattern (`CAPABILITY_CONFIG`, tool, command, setup). The capability validates that the goal has `GOAL.md`, `PLAN.md`, and at least one APPROVED step. The `prepareSession` lifecycle hook handles mechanical cleanup: (1) archives current `PLAN.md` to `PLAN_ARCHIVE/PLAN-{timestamp}.md`, (2) deletes all non-APPROVED `S{NN}/` folders, (3) cleans up the `REVISE_PLAN_NEEDED` marker if `revisionTriggerStep` is provided. The tool enqueues via `enqueueTask()`, the command launches via `launchCapability()`. Write allowlist permits creating new `PLAN.md` and files inside `PLAN_ARCHIVE/`.

**Acceptance criteria:**
- [ ] `src/capabilities/revise-plan.ts` exists with exports matching capability pattern: `CAPABILITY_CONFIG`, `setupRevisePlan()`
- [ ] Tool registered as `pio_revise_plan`, command as `/pio-revise-plan <goal-name>`
- [ ] Validation rejects if no `GOAL.md`, no `PLAN.md`, or zero APPROVED steps exist
- [ ] `prepareSession` archives PLAN.md to timestamped file in `PLAN_ARCHIVE/` and deletes non-APPROVED step folders
- [ ] `CAPABILITY_CONFIG` uses prompt `"revise-plan.md"`, validation for `PLAN.md`, writeAllowlist for `PLAN.md` only
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/capabilities/revise-plan.ts` — new file: capability implementation (tool + command + config)

## Step 4: Add revise-plan transitions in state-machine.ts

**Description:** Add two transition cases to `resolveTransition()` in `src/state-machine.ts`: (1) `evolve-plan → revise-plan`: when the current evolving step has `revisionNeeded() === true`, route to `revise-plan` with `revisionTriggerStep` set to the current step number. The guard checks `state.steps()[currentStep].revisionNeeded()`. If no revision needed, fall through to normal routing (execute-task or finalize-goal). (2) `revise-plan → evolve-plan`: after successful plan revision, route back to `evolve-plan` so the next incomplete step gets specified.

**Acceptance criteria:**
- [ ] `resolveTransition()` has a case for `"evolve-plan"` that checks `revisionNeeded()` and routes to `"revise-plan"` when marker present
- [ ] When routing to revise-plan, `revisionTriggerStep` is passed in params
- [ ] Normal evolve-plan routing (execute-task / finalize-goal) still works when no revision needed
- [ ] `resolveTransition()` has a case for `"revise-plan"` that routes to `"evolve-plan"`
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/state-machine.ts` — add revise-plan transition cases in `resolveTransition()` and helper functions

## Step 5: Create revise-plan prompt

**Description:** Create `src/prompts/revise-plan.md` with instructions specific to the plan revision workflow. The agent should: (1) read `GOAL.md` for context, (2) find the most recent archived plan in `PLAN_ARCHIVE/` for reference, (3) identify completed steps from remaining `S{NN}/` folders (those with `APPROVED` markers), (4) write a fresh `PLAN.md` containing completed step entries as historical anchors (marked immutable) plus new future steps continuing numbering after the last completed step, (5) set `totalSteps` to reflect all entries, (6) if changes to completed code are needed, add new future steps rather than modifying completed entries. The prompt references the shared planning skill for methodology details.

**Acceptance criteria:**
- [ ] `src/prompts/revise-plan.md` exists with revise-specific instructions
- [ ] Prompt references the shared planning skill (`src/skills/planning/SKILL.md`) for methodology
- [ ] Prompt instructs agent to read archived plans and completed step folders
- [ ] Prompt instructs agent to write fresh PLAN.md with completed steps as anchors + new future steps
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/prompts/revise-plan.md` — new file: revise-plan system prompt

## Step 6: Update create-plan prompt to reference shared skill

**Description:** Shrink `src/prompts/create-plan.md` by removing methodology content that is now in the shared planning skill. Retain only capability-specific instructions: role definition ("you are creating a fresh plan from GOAL.md"), process overview, and references to the shared skill for detailed methodology (step structure, acceptance criteria rules, research approach). The prompt should be significantly shorter than before — it delegates conventions to the skill rather than repeating them.

**Acceptance criteria:**
- [ ] `src/prompts/create-plan.md` is shortened — methodology content removed
- [ ] Prompt retains capability-specific role definition and process overview
- [ ] Prompt references the shared planning skill for methodology details
- [ ] No methodology rules are lost — everything moved to skill, not deleted
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/prompts/create-plan.md` — extract methodology into skill reference, keep capability-specific instructions

## Step 7: Wire revise-plan and register planning skill in index.ts

**Description:** Update `src/index.ts` to (1) import and call `setupRevisePlan()` from the new capability module, (2) register the planning skill by adding its path to `skillPaths`. The skill path follows existing convention: `path.join(SKILLS_DIR, "planning")`. This makes the skill discoverable in `<available_skills>` for all sub-sessions.

**Acceptance criteria:**
- [ ] `setupRevisePlan` is imported from `./capabilities/revise-plan` and called in the main function
- [ ] Planning skill path is registered in `skillPaths` array
- [ ] Import matches module filename convention (`revise-plan`) so `resolveCapabilityConfig` can dynamically import it
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/index.ts` — add revise-plan import + setup call, register planning skill path

## Step 8: Integrate evolve-plan marker writing

**Description:** Two changes to enable the auto-enqueue from evolve-plan → revise-plan: (1) Update `resolveEvolveWriteAllowlist()` in `evolve-plan.ts` to permit writing `REVISE_PLAN_NEEDED` inside the current step folder (`S{NN}/REVISE_PLAN_NEEDED`). This allows the Specification Writer to write the marker when conditions are met. (2) Update `src/prompts/evolve-plan.md` with instructions on when to write `REVISE_PLAN_NEEDED`: decisions make future steps impossible, decisions require changes to completed implementations, decisions require additional steps beyond the plan, or significant divergence from original plan. Also specify criteria for NOT enqueuing: minor descriptive changes only, steps stay roughly the same.

**Acceptance criteria:**
- [ ] `resolveEvolveWriteAllowlist()` includes `REVISE_PLAN_NEEDED` inside the current step folder
- [ ] `src/prompts/evolve-plan.md` instructs when to write the marker (four trigger conditions) and when not to (minor changes)
- [ ] Marker file format is specified: markdown with YAML frontmatter containing structured fields (`reason`, `decisions`)
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/capabilities/evolve-plan.ts` — update writeAllowlist callback to permit `REVISE_PLAN_NEEDED`
- `src/prompts/evolve-plan.md` — add revise-plan trigger criteria and marker file protocol

## Step 9: Update pio skill documentation

**Description:** Update `src/skills/pio/SKILL.md` to document the revised workflow lifecycle including revise-plan. Add `revise-plan` to the workflow lifecycle description, add it to the command reference table (tool + command), and update common conventions to mention the marker file mechanism (`REVISE_PLAN_NEEDED`) and the archive directory (`PLAN_ARCHIVE/`). The pio skill is the canonical workflow reference — it must stay accurate.

**Acceptance criteria:**
- [ ] Workflow lifecycle section includes revise-plan in the correct position (evolve-plan → revise-plan → evolve-plan)
- [ ] Command reference table has a row for `/pio-revise-plan` and `pio_revise_plan`
- [ ] Common conventions mention `REVISE_PLAN_NEEDED` marker and `PLAN_ARCHIVE/` directory
- [ ] No other workflow steps are accidentally modified or removed
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/skills/pio/SKILL.md` — document revise-plan in workflow lifecycle, command reference, and conventions

## Notes

- **Step ordering is dependency-driven:** Step 1 (shared skill) first because steps 5–6 reference it. Steps 2–4 build infrastructure before the capability itself. Steps 7–9 wire things together and update docs.
- **The `prepareSession` hook is critical:** Revise-plan must archive before the agent starts — if PLAN.md is deleted without archiving, context is lost forever. Ensure the archive happens atomically (rename or copy+delete, not delete-then-copy).
- **Write allowlist for PLAN_ARCHIVE:** Since revise-plan's `prepareSession` runs before file protection initializes (it runs during `resources_discover`), the hook can write freely. However, if the agent needs to access archived plans during its session, read-only paths should cover `PLAN_ARCHIVE/`. The workingDir IS the goal workspace, so reads to `PLAN_ARCHIVE/` inside it are automatically permitted.
- **Transition purity:** `resolveTransition()` stays pure — `revisionNeeded()` is on `StepStatus`, which is part of `GoalState.state` (lazy-evaluated FS view). This matches existing patterns where `goalCompleted()` and `currentStepNumber()` are queried from state during transitions.
