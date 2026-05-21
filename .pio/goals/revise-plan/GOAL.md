# Revise Plan Capability

Add a `revise-plan` capability to the pio workflow that archives the current `PLAN.md`, automatically deletes incomplete step folders, and writes a fresh plan for remaining work. Completed steps are immutable — preserved as historical anchors with new steps continuing from where they left off. Planning methodology is extracted from `create-plan.md` into a shared skill so both capabilities use identical conventions.

## Current State

**Capability pattern:** Each capability lives in `src/capabilities/<name>.ts` and exports a `CAPABILITY_CONFIG` (prompt filename, validation rules, file protections) plus a `setup<Name>()` function registering a tool (`defineTool`) and command (`pi.registerCommand`). The tool enqueues tasks via `enqueueTask()` from `src/queues.ts`; the command launches sub-sessions via `launchCapability()` from `src/capabilities/session-capability.ts`. All capabilities are wired in `src/index.ts`.

**State machine:** Transitions are resolved by `resolveTransition()` in `src/state-machine.ts`. Current flow: `create-goal → create-plan → evolve-plan → execute-task → review-task → (evolve-plan)`. After all steps complete, routes to `finalize-goal`. The state machine is pure — no filesystem I/O; it queries a `GoalState` from `src/goal-state.ts`.

**GoalState** (`src/goal-state.ts`) tracks step status via marker files: `APPROVED` (fully done), `REJECTED`, `BLOCKED`, `COMPLETED` (implemented, pending review). `currentStepNumber()` returns the first non-APPROVED step. `steps()` scans `S{NN}/` folders.

**Prompt:** `src/prompts/create-plan.md` contains all planning methodology — structure conventions, step design rules, acceptance criteria guidelines, research instructions, and user interaction patterns. This is capability-specific (tells the agent "you are creating a fresh plan"). There is no shared knowledge artifact between create-plan and any future planning-related capabilities.

**Skill system:** Skills live under `src/skills/` as `SKILL.md` files. Currently registered: `pio/SKILL.md` (workflow reference), `test-driven-development/SKILL.md` (TDD methodology), `pio-project-knowledge/SKILL.md` (PROJECT file knowledge). Skills are discovered via `resources_discover` in `src/index.ts`. Prompts inject skill-loading instructions from `src/prompts/_skill-loading.md`.

**Evolve-plan** (`src/capabilities/evolve-plan.ts`) generates `TASK.md` + `TEST.md` per step. It reads PLAN.md, finds the next incomplete step, and produces specs in `S{NN}/`. It has no mechanism to signal that the remaining plan needs revision. If decisions during specification make future steps invalid, there's no way to trigger a plan restructure.

**Queues:** Per-goal FIFO slot at `.pio/session-queue/task-{goalName}.json` (`src/queues.ts`). One pending task per goal. Enqueuing overwrites existing tasks. User invokes `/pio-next-task` to consume.

## To-Be State

**New capability: `revise-plan`** in `src/capabilities/revise-plan.ts`, registered as tool `pio_revise_plan` and command `/pio-revise-plan <goal-name>`. Follows existing capability pattern:

- **CAPABILITY_CONFIG:** Prompt = `revise-plan.md`, validation ensures `PLAN.md` exists, readOnlyFiles guards completed step folders, writeAllowlist permits creating a new PLAN.md. Uses `prepareSession` lifecycle hook to automatically archive old PLAN.md to `PLAN_ARCHIVE/` and delete incomplete step folders before the agent starts.
- **Validation:** Goal workspace must exist, must have `GOAL.md` and `PLAN.md`, must have at least one completed step (APPROVED marker). Prevents running on a fresh plan with no progress.
- **Transition:** `revise-plan → evolve-plan` (return to specifying steps after revision). Reachable from `evolve-plan` (auto-enqueued) or user invocation. In `src/state-machine.ts`, add `revise-plan` as a case in `resolveTransition()`.

**Shared planning skill:** New `src/skills/planning/SKILL.md` containing all methodology currently in `src/prompts/create-plan.md` — step structure, acceptance criteria rules, research approach, file conventions (frontmatter with `totalSteps`, step headings format, no source code policy). Both prompts reference this skill:
- `src/prompts/create-plan.md` shrinks to capability-specific instructions ("you are creating a fresh plan from GOAL.md") + reference to the shared planning skill for methodology.
- New `src/prompts/revise-plan.md` contains revise-specific instructions ("archive is handled automatically, identify completed steps from remaining S{NN}/ folders, write a fresh PLAN.md continuing numbering after last completed step") + same skill reference.
- Register the skill in `src/index.ts` under `skillPaths`.

**Automatic cleanup before the agent session:** A `prepareSession` lifecycle hook handles all mechanical filesystem I/O. The agent is responsible for planning only — it never manually deletes files or edits the old plan in-place.

1. **Archive current PLAN.md** — Move to `PLAN_ARCHIVE/PLAN-{YYYYMMDDTHHMMSSZ}.md`. Creates `PLAN_ARCHIVE/` if needed. Prior revisions are preserved and available under this directory for reference.
2. **Delete incomplete step folders** — Scan all `S{NN}/` folders. Those without an `APPROVED` marker are deleted — they contain stale specs (TASK.md, TEST.md) that no longer match the plan.

The agent session begins with only completed step folders and an archived plan (no current PLAN.md). The agent writes a fresh PLAN.md from scratch.

**Revise-plan behavior (prompt-driven):**
1. Read `GOAL.md` and the most recent archived plan from `PLAN_ARCHIVE/` for context
2. Identify completed steps from the remaining `S{NN}/` folders (those with `APPROVED` markers)
3. Write a fresh PLAN.md containing completed step entries (as historical anchor, marked immutable) plus newly planned future steps
4. Number new steps continuing after last completed step (e.g., if steps 1–3 are APPROVED, new steps start at Step 4)
5. Set `totalSteps` in frontmatter to reflect actual count of all entries (completed + new)
6. If changes to already-completed code are needed, add NEW future steps ("revert X using git and replace with Y") rather than modifying completed step entries

**Revise-plan marker file:** `REVISE_PLAN_NEEDED` inside the triggering step's folder (`S{NN}/REVISE_PLAN_NEEDED`). This is necessary because evolve-plan's working directory is the step directory, not the goal root — writeAllowlist restrictions prevent writing outside `S{NN}/`. The marker contains context: reasons for revision, decisions made, constraints discovered. Format: markdown with YAML frontmatter containing structured fields (e.g., `reason`: enum of trigger conditions, `decisions`: array of strings).

When evolve-plan auto-enqueues revise-plan, it passes the triggering step number as a param (`revisionTriggerStep`). The `prepareSession` hook for revise-plan uses this to locate and clean up the marker file. Combined with automatic step-folder cleanup (deleting non-APPROVED folders), the marker is naturally removed when its containing `S{NN}/` folder is deleted — unless the revision was triggered from an already-approved step, in which case explicit cleanup is needed.

**evolve-plan integration:** The `src/prompts/evolve-plan.md` prompt is updated to instruct the Specification Writer to evaluate whether decisions during specification impact remaining steps. Criteria for writing `REVISE_PLAN_NEEDED` (inside the current `S{NN}/`) and auto-enqueuing revise-plan:
- Decisions make at least one future step impossible as-planned
- Decisions require changes to implementations in already-completed previous steps
- Decisions require additional steps beyond what the plan accounts for
- The next step's spec diverges significantly from the original plan, making it confusing to read both side by side

Criteria for NOT enqueuing:
- Only minor descriptive changes needed in a single future step
- All steps stay roughly the same with minor additions/removals (file descriptions, test counts, constraints)

**Validation of completed steps:** The `revisionTriggerStep` param provides a validation boundary. After cleanup and re-planning, revise-plan validates that all steps before `revisionTriggerStep` are preserved as completed/immutable in the new PLAN.md. Any step numbered below `revisionTriggerStep` must have an `APPROVED` marker — if not, the revision is invalid.

**State machine transitions:**
- `evolve-plan → revise-plan` (auto-enqueued when marker conditions met)
- `revise-plan → evolve-plan` (after successful revision, continue specifying)
- User can always invoke `/pio-revise-plan <name>` directly (explicit override), bypassing auto-detection

**Updated pio skill:** `src/skills/pio/SKILL.md` updated to document revise-plan in the workflow lifecycle, command reference table, and common conventions section.

**Files created:**
- `src/capabilities/revise-plan.ts` — capability implementation (tool + command + config)
- `src/prompts/revise-plan.md` — system prompt for the revision session
- `src/skills/planning/SKILL.md` — shared planning methodology skill

**Files modified:**
- `src/prompts/create-plan.md` — extract methodology into shared skill, keep capability-specific instructions
- `src/prompts/evolve-plan.md` — add revise-plan trigger criteria and marker file protocol
- `src/state-machine.ts` — add revise-plan transition case + evolve-plan → revise-plan routing
- `src/skills/pio/SKILL.md` — document revise-plan in workflow
- `src/index.ts` — wire revise-plan capability + register planning skill
