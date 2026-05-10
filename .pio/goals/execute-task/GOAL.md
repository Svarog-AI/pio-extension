# Execute Task

Add a new `execute-task` capability that implements a single plan step using a test-first workflow. After `evolve-plan` produces `TASK.md` and `TEST.md` for a step, `execute-task` reads those specs, writes and runs tests first, then implements the feature code to make them pass. On completion it writes status markers (`COMPLETED` or `BLOCKED`) and a `SUMMARY.md` changelog into the step folder.

This capability closes the loop in the pio workflow: goal → plan → spec (evolve-plan) → implement + verify (execute-task), running one step at a time with explicit pass/fail signaling.

## Current State

The pio extension provides these capabilities under `src/capabilities/`:

- **create-goal** (`create-goal.ts`) — Creates `.pio/goals/<name>/` and launches a Goal Definition Assistant sub-session. Exposes both tool (`pio_create_goal`) and command (`/pio-create-goal`). Uses `CAPABILITY_CONFIG`, `launchCapability()`, and `setupCreateGoal(pi)` to register with the extension API.
- **create-plan** (`create-plan.ts`) — Launches a Planning Agent to produce `PLAN.md`. Tool + command pattern.
- **evolve-plan** (`evolve-plan.ts`) — Finds the next incomplete step by scanning `S01/`, `S02/`, etc. for both `TASK.md` and `TEST.md`. Launches a Specification Writer that produces those two files into `S{NN}/`. Exposes tool (`pio_evolve_plan`) + command (`/pio-evolve-plan`). The tool path enqueues via `enqueueTask()`; the command calls `launchCapability()` directly.
- **execute-plan** (`execute-plan.ts`) — Command-only. Launches an Implementation Agent that executes all steps from PLAN.md in a single session. No per-step status tracking or test-first workflow.
- **validation** (`validation.ts`) — Provides `pio_mark_complete` tool, exit-gate logic, and file protection (read-only/write-only). Validates output files against `ValidationRule.files`.
- **session-capability** (`session-capability.ts`) — Shared launcher (`launchCapability()`) and event handlers (`resources_discover`, `before_agent_start`). Injects `.pio/PROJECT.md` + capability-specific prompt from `src/prompts/`.

Shared types live in `src/types.ts`: `ValidationRule`, `CapabilityConfig`, `StaticCapabilityConfig`, `SessionQueueTask`. Shared utilities in `src/utils.ts`: `resolveGoalDir`, `enqueueTask`, `resolveCapabilityConfig`, `stepFolderName`-adjacent logic, and `CAPABILITY_TRANSITIONS` mapping capability names to next-step transitions (currently `create-goal → create-plan → evolve-plan`).

The extension entry point (`src/index.ts`) wires all capabilities by importing setup functions and calling them on the `ExtensionAPI`. Skills are registered under `src/skills/` with one directory per capability.

**No test runner exists.** The project relies on `npm run check` (TypeScript type checking) for verification. There is no Jest, Vitest, or similar framework configured.

**Capability transitions are linear:** `CAPABILITY_TRANSITIONS` in `utils.ts` maps `"create-goal" → "create-plan"` and `"create-plan" → "evolve-plan"`. After evolve-plan completes, there is no automatic transition to an implementation step.

## To-Be State

A new `execute-task` capability will exist alongside the current capabilities. It provides both a tool (`pio_execute_task`) and a command (`/pio-execute-task <goal-name> [step-number]`). When step number is omitted, it finds the next step with `TASK.md` + `TEST.md` present but no `COMPLETED` or `BLOCKED` marker (mirroring how evolve-plan finds the next incomplete step).

### New files

- **`src/capabilities/execute-task.ts`** — Capability implementation following conventions from `evolve-plan.ts` and `execute-plan.ts`:
  - `CAPABILITY_CONFIG` with prompt `"execute-task.md"` and a `defaultInitialMessage` that references the goal workspace and step number.
  - Tool (`pio_execute_task`) accepting `name` (goal name) and optional `stepNumber` parameters. The tool resolves the target step, enqueues via `enqueueTask()`, and returns confirmation text.
  - Command handler (`/pio-execute-task <goal-name> [step-number]`) that validates inputs, resolves the step, calls `launchCapability()` with appropriate config (validation rules for `S{NN}/COMPLETED` or `S{NN}/BLOCKED`).
  - Step resolution logic: scan `S01/`, `S02/`, etc. — find first folder where both `TASK.md` and `TEST.md` exist but neither `COMPLETED` nor `BLOCKED` exists yet. If a step number is provided explicitly, validate that `TASK.md` and `TEST.md` exist in that folder instead.
  - `setupExecuteTask(pi)` registering both tool and command.

- **`src/prompts/execute-task.md`** — System prompt for the Execute Task Agent defining:
  1. Read `GOAL.md` and `PLAN.md` for context.
  2. Read `TASK.md` and `TEST.md` from the assigned step folder (`S{NN}/`).
  3. Determine which test cases from `TEST.md` can be implemented as actual unit/integration tests (e.g., `.test.ts` files) vs. command-based verification (shell checks, type checking).
  4. **Write tests first** — create test files or define verification commands before implementing feature code. This is TDD-style: tests should fail initially (red phase).
  5. Implement the `TASK.md` specification to make tests pass (green phase).
  6. Run all verification: execute tests, run `npm run check`, perform command-based checks from `TEST.md`.
  7. If tests fail, iterate — fix implementation or adjust tests if they were incorrect, until all pass.
  8. Verify non-test acceptance criteria from `TASK.md` are met (file existence, integration points, etc.).
  9. On success: write `COMPLETED` marker file into `S{NN}/` and produce `SUMMARY.md` (changelog of files created/modified/deleted with brief descriptions). Call `pio_mark_complete`.
  10. On failure (blocking issues that cannot be resolved): write `BLOCKED` marker with explanation text and `SUMMARY.md` documenting what was attempted and why it's blocked. Call `pio_mark_complete`.

- **`src/skills/execute-task/SKILL.md`** — Skill registration file so pi surfaces this capability in `<available_skills>`. Follows the pattern of existing skills (e.g., `src/skills/evolve-plan/SKILL.md`).

### Modified files

- **`src/utils.ts`** — Add `"evolve-plan": "execute-task"` and `"execute-task": "evolve-plan"` to `CAPABILITY_TRANSITIONS`. This creates the cycle: evolve-plan produces specs → execute-task implements step → evolve-plan moves to next step.

- **`src/index.ts`** — Import and call `setupExecuteTask(pi)`. Add `execute-task` to the skill paths array.

### Workflow integration

After `evolve-plan` completes (TASK.md + TEST.md written), `pio_mark_complete` auto-enqueues the next capability from `CAPABILITY_TRANSITIONS`. With the new transition, it will enqueue `execute-task` for the same step. After `execute-task` writes `COMPLETED` and calls `pio_mark_complete`, the transition enqueues `evolve-plan` again — which finds the *next* incomplete step (since current step now has COMPLETED).

The command accepts an optional step number: `/pio-execute-task my-goal` finds next uncompleted step, while `/pio-execute-task my-goal 3` targets `S03/` explicitly.

### Output artifacts (per step)

- **`S{NN}/COMPLETED`** — Empty marker file written when all tests pass and acceptance criteria are met. Signals the step is done.
- **`S{NN}/BLOCKED`** — Text file containing a human-readable explanation of why execution was blocked (e.g., external dependency unavailable, ambiguous requirements). Written when the agent cannot proceed despite iteration.
- **`S{NN}/SUMMARY.md`** — Changelog of what was accomplished. Lists files created, modified, or deleted with brief descriptions. Includes any decisions made during implementation and notes on test coverage.

### Validation rules

The execute-task session configures `validation.files` to expect either `S{NN}/COMPLETED` or `S{NN}/BLOCKED`, plus `S{NN}/SUMMARY.md`. The `writeOnlyFiles` should be left open (not restricted) since the agent needs to write source code across the project, not just files in the step folder. The step spec files (`TASK.md`, `TEST.md`) may be marked read-only to prevent the agent from modifying its own input specs.

### Design decisions

- **Both tool + command** — Allows agents (e.g., after evolve-plan) to auto-queue execution while users can invoke directly.
- **Step-aware resolution** — The tool and command handle step resolution consistently: find next uncompleted step or use explicit step number.
- **Test-first with flexibility** — Agent writes real test files when the project has (or can reasonably add) a test runner, but falls back to command-based verification from TEST.md for checks that don't need formal test infrastructure.
- **Status markers in step folder** — `COMPLETED`, `BLOCKED`, and `SUMMARY.md` live alongside `TASK.md` and `TEST.md` in `S{NN}/`. This keeps all artifacts for a step co-located.
- **Transition cycle** — `evolve-plan → execute-task → evolve-plan` creates an alternating flow that processes one step at a time through the full spec-implement cycle.
