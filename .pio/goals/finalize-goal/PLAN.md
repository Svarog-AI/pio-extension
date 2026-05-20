---
totalSteps: 6
---
# Plan: finalize-goal

Add a finalize-goal capability that reads accumulated decisions from a completed goal and updates `.pio/PROJECT/*.md` documentation accordingly, with shared PROJECT file knowledge extracted into a reusable skill.

## Prerequisites

- GOAL.md must exist and define the finalize-goal requirements (already done)
- The 7 `.pio/PROJECT/*.md` files must exist (they do — created by project-context capability)
- A goal must have completed (COMPLETED marker exists) with DECISIONS.md in at least one step folder

## Steps

## Step 1: Create pio-project-knowledge skill

**Description:** Create `src/skills/pio-project-knowledge/SKILL.md` as a shared knowledge source for the 7 PROJECT files. This skill documents: (1) canonical file paths under `.pio/PROJECT/`, (2) purpose and section structure of each file, (3) what types of decisions map to which file — providing update rules that both `project-context` (for creation) and `finalize-goal` (for updates) can reference. The skill follows the existing SKILL.md format with YAML frontmatter (`name`, `description`) and structured markdown sections.

This eliminates duplication: currently `project-context.md` encodes PROJECT file structure in Phase 2 analysis questions. The finalize-goal prompt needs similar knowledge (update rules). A single skill serves both.

**Acceptance criteria:**
- [ ] `src/skills/pio-project-knowledge/SKILL.md` exists with YAML frontmatter (`name: pio-project-knowledge`, descriptive description)
- [ ] Skill documents all 7 PROJECT files with canonical paths, purpose, and section structure
- [ ] Skill includes "Update Rules" mapping decision categories to target PROJECT files (e.g., new dependency → DEPENDENCIES.md, naming convention → CONVENTIONS.md)
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/skills/pio-project-knowledge/SKILL.md` — new file: shared PROJECT file knowledge skill

## Step 2: Register pio-project-knowledge skill and update project-context prompt

**Description:** Register the new skill so it appears in `<available_skills>` by adding its directory to `skillPaths` in the `resources_discover` handler in `src/index.ts`. Update `src/prompts/project-context.md` to load the pio-project-knowledge skill (add a loading instruction referencing `src/skills/pio-project-knowledge/SKILL.md`) and reference it for PROJECT file structure details instead of encoding everything inline. This reduces prompt size and centralizes knowledge.

**Acceptance criteria:**
- [ ] `src/index.ts` includes the pio-project-knowledge skill path in `skillPaths` array (`src/skills/pio-project-knowledge`)
- [ ] `src/prompts/project-context.md` includes instructions to load the pio-project-knowledge skill before proceeding
- [ ] Project-context prompt still functions correctly — all 7 files are documented via the skill reference
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/index.ts` — add pio-project-knowledge skill to `skillPaths`
- `src/prompts/project-context.md` — add skill-loading instruction for pio-project-knowledge, defer file structure details to the skill

## Step 3: Create finalize-goal prompt

**Description:** Create `src/prompts/finalize-goal.md` as the system prompt for the Finalize Goal Agent. The prompt instructs the agent to: (1) load the pio-project-knowledge skill for PROJECT file knowledge, (2) read the final DECISIONS.md from a completed goal (path provided in initial message), (3) evaluate each decision against the update rules from the pio-project-knowledge skill, (4) read existing PROJECT files before modifying (preserve content, insert at appropriate sections), (5) skip decisions that don't map to any update rule, and (6) produce a summary output listing files modified, changes made, and which decisions triggered each change.

**Acceptance criteria:**
- [ ] `src/prompts/finalize-goal.md` exists and is non-empty
- [ ] Prompt instructs the agent to load the pio-project-knowledge skill for PROJECT file knowledge
- [ ] Prompt covers the full workflow: read DECISIONS.md → evaluate against update rules → read PROJECT files → write updates → produce summary
- [ ] Prompt instructs the agent to skip decisions that don't map to any update rule
- [ ] Prompt instructs the agent to produce a summary output (files modified, changes made, triggering decisions; explicit statement if no updates needed)
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/prompts/finalize-goal.md` — new file: system prompt for Finalize Goal Agent

## Step 4: Add lastStepDecisions() to GoalState

**Description:** Add a `lastStepDecisions()` method to `GoalState` in `src/goal-state.ts`. This method scans step folders (S01/, S02/, etc.) in the goal workspace, finds the highest-numbered folder, reads `DECISIONS.md` from it, and returns the file contents as a string. Returns `undefined` if no step folders exist or no DECISIONS.md is found. Follows the existing lazy-evaluated pattern — reads fresh from disk on every call, no internal caching.

**Acceptance criteria:**
- [ ] `GoalState` interface in `src/goal-state.ts` includes `lastStepDecisions: () => string | undefined`
- [ ] Method returns DECISIONS.md content from the highest-numbered step folder (e.g., S05/ > S04/ > S03/)
- [ ] Method returns `undefined` when no step folders exist
- [ ] Method returns `undefined` when highest step folder has no DECISIONS.md
- [ ] Existing tests in `src/goal-state.test.ts` still pass (no regressions)
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/goal-state.ts` — add `lastStepDecisions()` to GoalState interface and factory implementation

## Step 5: Create finalize-goal capability module

**Description:** Create `src/capabilities/finalize-goal.ts` following the established 4-part capability pattern:

1. **CAPABILITY_CONFIG:** Prompt `"finalize-goal.md"`, `writeAllowlist` for all 7 `.pio/PROJECT/*.md` files, no validation (output is a summary), `defaultInitialMessage` provides goal name and path to final DECISIONS.md
2. **Tool (`pio_finalize_goal`):** Parameter `name` (goal name). Validates that `<goalDir>/COMPLETED` exists using `GoalState.goalCompleted()`, finds DECISIONS.md via `GoalState.lastStepDecisions()`. Launches a finalize-goal sub-session via `launchCapability()`. Returns error if goal is not complete or has no DECISIONS.md.
3. **Command handler (`/pio-finalize-goal <name>`):** User-callable in the TUI. Same validation as tool, launches session directly.
4. **`setupFinalizeGoal(pi)`:** Registers both tool and command with the pi API

The capability module must use `resolveCapabilityConfig()` for config resolution (same pattern as create-plan, evolve-plan). The `workingDir` for this capability is the goal workspace directory (`.pio/goals/<name>/`), following the convention where `goalName` is provided in params. However, the `writeAllowlist` paths (`.pio/PROJECT/*.md`) are relative to the repo root, not the goal directory — follow how `project-context.ts` handles this (it uses `cwd` as workingDir, not a goal dir).

**Acceptance criteria:**
- [ ] `src/capabilities/finalize-goal.ts` exists with all 4 capability parts (CAPABILITY_CONFIG, tool, command, setup)
- [ ] Tool validates COMPLETED marker exists before launching session (uses GoalState.goalCompleted())
- [ ] Tool uses GoalState.lastStepDecisions() to find DECISIONS.md content
- [ ] Tool returns error if goal is not complete or has no DECISIONS.md
- [ ] Command handler validates goal name argument, same validation logic as tool
- [ ] `writeAllowlist` includes all 7 `.pio/PROJECT/*.md` files
- [ ] `setupFinalizeGoal(pi)` registers both tool and command
- [ ] Follows established patterns: `defineTool`, TypeBox parameters, `launchCapability`, `resolveCapabilityConfig`
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/capabilities/finalize-goal.ts` — new file: complete capability module

## Step 6: Modify state machine transitions, register in index.ts, verify compilation

**Description:** Complete the integration with three sub-changes:

1. **State machine transitions** (`src/state-machine.ts`): In `transitionEvolvePlan()`, when `state.goalCompleted()` is true, return `{ capability: "finalize-goal", params: { goalName } }` instead of returning `undefined`. This auto-enqueues a finalize-goal sub-session after the last step is specified. Add a `case "finalize-goal"` to `resolveTransition()` that returns `undefined` (no outgoing transition).
2. **Registration** (`src/index.ts`): Import `setupFinalizeGoal` from the new capability module and call it during extension setup alongside all other capabilities.
3. **Project context update** (`.pio/PROJECT/OVERVIEW.md`): Add `finalize-goal.ts` to repository structure, mention finalize-goal in workflow lifecycle, add pio-project-knowledge skill to skills section.
4. **Verify**: Full TypeScript compilation with no errors, all existing tests pass.

**Acceptance criteria:**
- [ ] `transitionEvolvePlan()` returns `{ capability: "finalize-goal", params: { goalName } }` when `state.goalCompleted()` is true (instead of `undefined`)
- [ ] `resolveTransition("finalize-goal", ...)` returns `undefined` (no outgoing transition)
- [ ] Existing tests in `src/state-machine.test.ts` still pass (update completion detection test to expect finalize-goal instead of undefined)
- [ ] `src/index.ts` imports and calls `setupFinalizeGoal(pi)`
- [ ] `.pio/PROJECT/OVERVIEW.md` repository structure includes `finalize-goal.ts` under `src/capabilities/`
- [ ] `.pio/PROJECT/OVERVIEW.md` workflow description mentions finalize-goal in the lifecycle steps
- [ ] `.pio/PROJECT/OVERVIEW.md` skills section includes `pio-project-knowledge/SKILL.md`
- [ ] `npx tsc --noEmit` reports no errors
- [ ] All existing tests pass: `npx vitest run`

**Files affected:**
- `src/state-machine.ts` — modify `transitionEvolvePlan()` and add `case "finalize-goal"` in `resolveTransition()`
- `src/state-machine.test.ts` — update existing test expecting `undefined` from evolve-plan completion to expect `{ capability: "finalize-goal" }`
- `src/index.ts` — import and register `setupFinalizeGoal`
- `.pio/PROJECT/OVERVIEW.md` — update repository structure, workflow description, and skills section

## Notes

- **writeAllowlist path resolution:** The 7 PROJECT files are under `.pio/PROJECT/` relative to the repo root, not the goal workspace. Study how `project-context.ts` handles this — it uses `cwd` as workingDir (not a goal dir) since it's project-scoped. The finalize-goal capability may need a similar approach: either use `cwd` as workingDir with `.pio/PROJECT/*.md` paths, or compute absolute paths in the writeAllowlist callback. Verify how `resolveCapabilityConfig()` resolves workingDir and how the guard enforces writeAllowlist paths.

- **DECISIONS.md may not exist for all goals:** If a goal had only 1 step (or no steps), DECISIONS.md won't exist since evolve-plan writes it starting from Step 2+. The capability should handle this gracefully — either launch with a message indicating no decisions to process, or skip finalization with an appropriate message.

- **State machine test update:** The existing test `"returns undefined when goal is completed"` in `src/state-machine.test.ts` will need updating to expect `{ capability: "finalize-goal" }` instead of `undefined`. Ensure the test also verifies that goalName is propagated in params.

- **No validation needed:** Unlike create-plan (which validates PLAN.md frontmatter), finalize-goal produces a summary output, not structured artifacts. No file-existence validation is required since the writes are documentation updates.

- **Backwards compatibility:** The COMPLETED marker behavior changes slightly — after this plan, evolve-plan will route to finalize-goal instead of terminating. Manual tool/command invocation remains available for re-running finalization on-demand.

- **pio-project-knowledge skill registration:** Adding a new skill path in `resources_discover` means the skill appears in `<available_skills>` for all sub-sessions. This is intentional — the knowledge is useful broadly, not just for project-context and finalize-goal sessions.
