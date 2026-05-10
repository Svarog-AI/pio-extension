# Plan: Execute Task

Add a new `execute-task` capability that implements a single plan step using a test-first workflow, closing the pio loop: goal → plan → spec (evolve-plan) → implement + verify (execute-task).

## Prerequisites

- Goal workspace `.pio/goals/execute-task/` exists with `GOAL.md` already defined.
- Existing capabilities (`evolve-plan`, `execute-plan`, `create-goal`) are stable and serve as reference patterns.

## Steps

### Step 1: Create `src/capabilities/execute-task.ts` — core capability module

**Description:** Implement the execute-task capability following the pattern from `evolve-plan.ts`. This file is the core of the new feature and establishes all the types, config, helpers, tool, command handler, and setup function that other steps depend on.

The module must contain:

- **`CAPABILITY_CONFIG`** (`StaticCapabilityConfig`) with `prompt: "execute-task.md"` and a `defaultInitialMessage` that references the goal workspace dir and resolved step number/folder name.
- **Constants:** `TASK_FILE = "TASK.md"`, `TEST_FILE = "TEST.md"`, `COMPLETED_MARKER = "COMPLETED"`, `BLOCKED_MARKER = "BLOCKED"`, `SUMMARY_FILE = "SUMMARY.md"`.
- **`stepFolderName(stepNumber: number): string`** — formats step number as zero-padded folder (`S01`, `S02`). Reuse the same logic from `evolve-plan.ts`.
- **`isStepReady(goalDir, stepNumber): boolean`** — checks that both `TASK.md` and `TEST.md` exist in `S{NN}/` but neither `COMPLETED` nor `BLOCKED` exists yet. A step is "ready for execution" when specs are present but no completion marker exists.
- **`validateAndFindNextStep(name, cwd)`** — validates the goal workspace exists with both `GOAL.md` and `PLAN.md`, then scans `S01/`, `S02/`, … returning the first step number where `isStepReady` is true. Returns `{ goalDir, ready: true, stepNumber }` on success or `{ goalDir, ready: false, error }` on failure.
- **`validateExplicitStep(name, cwd, stepNumber)`** — validates that an explicitly requested step has both `TASK.md` and `TEST.md` in `S{NN}/`. Returns the same shape as above.
- **Tool (`pio_execute_task`)** accepting `name` (required string) and optional `stepNumber` (optional number). When step number is omitted, calls `validateAndFindNextStep`; when provided, calls `validateExplicitStep`. On success, enqueues via `enqueueTask()` with `{ capability: "execute-task", params: { goalName, stepNumber } }`. Returns confirmation text.
- **Command handler (`handleExecuteTask`)** — parses args for `<goal-name> [step-number]`, resolves the target step (auto or explicit), creates the step directory if needed, resolves config via `resolveCapabilityConfig()`, overrides validation to expect `{ files: [`${folder}/COMPLETED`, `${folder}/SUMMARY.md`] }` (COMPLETED is one of two valid end-states; BLOCKED is handled by agent writing it instead — validation checks for presence of COMPLETED or validates SUMMARY.md exists alongside either marker), sets `readOnlyFiles` to include the step's `TASK.md` and `TEST.md`, then calls `launchCapability()`.
- **`setupExecuteTask(pi)`** — registers both tool and command.

The validation approach: since the agent may write either COMPLETED or BLOCKED, use validation `{ files: [`${folder}/SUMMARY.md`] }` and rely on the prompt instructing the agent to write one of the two markers. The `pio_mark_complete` tool checks declared files; the marker presence is enforced by the prompt contract.

**Acceptance criteria:**
- [ ] `npm run check` (TypeScript type checking) reports no errors after this file is created
- [ ] The module exports `CAPABILITY_CONFIG` matching `StaticCapabilityConfig` interface from `src/types.ts`
- [ ] The module exports `setupExecuteTask` as a function accepting `ExtensionAPI`
- [ ] `stepFolderName(1)` returns `"S01"`, `stepFolderName(12)` returns `"S12"`
- [ ] Tool parameters schema correctly defines `name` as required string and `stepNumber` as optional number (verified via type checking against TypeBox types)

**Files affected:**
- `src/capabilities/execute-task.ts` — new file: core capability implementation

---

### Step 2: Create `src/prompts/execute-task.md` — system prompt for the Execute Task Agent

**Description:** Write the system prompt that defines the test-first workflow. Follow the structure and tone of `src/prompts/evolve-plan.md` (the closest existing reference). The prompt must instruct the agent to:

1. Read `GOAL.md` and `PLAN.md` for context from the goal workspace root.
2. Read `TASK.md` and `TEST.md` from the assigned step folder (`S{NN}/`).
3. Determine which test cases can be implemented as actual tests (`.test.ts` files) vs. command-based verification (shell checks, type checking).
4. **Write tests first** — TDD red phase: create test files or define verification commands before feature code. Tests should fail initially.
5. Implement the `TASK.md` specification to make tests pass (green phase).
6. Run all verification: execute tests, run `npm run check`, perform command-based checks from `TEST.md`.
7. Iterate if tests fail — fix implementation or adjust tests until all pass.
8. Verify non-test acceptance criteria from `TASK.md` are met.
9. On success: write `COMPLETED` marker (empty file) into `S{NN}/`, produce `SUMMARY.md` changelog, call `pio_mark_complete`.
10. On failure (blocking issues): write `BLOCKED` marker with explanation text and `SUMMARY.md` documenting what was attempted. Call `pio_mark_complete`.
11. Guidelines: stay within scope, reference real files, follow existing patterns, no unplanned work.

**Acceptance criteria:**
- [ ] File exists at `src/prompts/execute-task.md` with non-empty content
- [ ] The prompt references reading `TASK.md` and `TEST.md` from the step folder
- [ ] The prompt instructs writing tests first (TDD red-green pattern)
- [ ] The prompt instructs writing `COMPLETED` or `BLOCKED` marker files plus `SUMMARY.md`
- [ ] The prompt instructs calling `pio_mark_complete` on completion
- [ ] The prompt follows the style/structure of existing prompts (Setup, Process steps, Guidelines sections)

**Files affected:**
- `src/prompts/execute-task.md` — new file: system prompt for the execute-task agent

---

### Step 3: Create `src/skills/execute-task/SKILL.md` — skill registration

**Description:** Create a skill registration file following the pattern of `src/skills/evolve-plan/SKILL.md`. This makes the capability discoverable by pi's `<available_skills>` system. The YAML frontmatter should declare `name: execute-task` and a concise description. The body should explain usage (`/pio-execute-task <name> [step]`), output artifacts, and its place in the workflow cycle.

**Acceptance criteria:**
- [ ] File exists at `src/skills/execute-task/SKILL.md` with YAML frontmatter containing `name: execute-task`
- [ ] Description mentions test-first implementation of a single plan step
- [ ] Usage references both `/pio-execute-task <goal-name>` and `pio_execute_task` tool
- [ ] Follows the same format as existing skills (frontmatter + short prose body)

**Files affected:**
- `src/skills/execute-task/SKILL.md` — new file: skill registration for execute-task

---

### Step 4: Update `src/utils.ts` — add capability transitions

**Description:** Modify `CAPABILITY_TRANSITIONS` in `src/utils.ts` to add two new entries:
- `"evolve-plan": "execute-task"` — after evolve-plan produces specs, auto-transition to execute-task for implementation
- `"execute-task": "evolve-plan"` — after execute-task completes a step, auto-transition back to evolve-plan which will find the *next* incomplete step (since current now has COMPLETED marker)

This creates the cycle: evolve-plan → execute-task → evolve-plan → execute-task … processing one step at a time.

**Acceptance criteria:**
- [ ] `npm run check` reports no errors
- [ ] `CAPABILITY_TRANSITIONS` contains `"evolve-plan": "execute-task"` and `"execute-task": "evolve-plan"`
- [ ] Existing transitions (`"create-goal": "create-plan"`, `"create-plan": "evolve-plan"`) are preserved

**Files affected:**
- `src/utils.ts` — modify: add two entries to `CAPABILITY_TRANSITIONS`

---

### Step 5: Update `src/index.ts` — wire execute-task into the extension

**Description:** Integrate the new capability into the extension entry point:

1. **Import:** Add `import { setupExecuteTask } from "./capabilities/execute-task";` alongside other capability imports.
2. **Skill path:** Add `path.join(SKILLS_DIR, "execute-task")` to the `skillPaths` array so pi discovers the skill on `resources_discover`.
3. **Setup call:** Add `setupExecuteTask(pi);` in the main export function alongside other `setupXxx(pi)` calls.

**Acceptance criteria:**
- [ ] `npm run check` reports no errors (import resolves correctly)
- [ ] `setupExecuteTask` is imported from `./capabilities/execute-task`
- [ ] `execute-task` appears in the `skillPaths` array
- [ ] `setupExecuteTask(pi)` is called in the exported function

**Files affected:**
- `src/index.ts` — modify: add import, skill path, and setup call for execute-task

---

### Step 6: Final integration verification

**Description:** Run a comprehensive type check to ensure all modules compile together correctly. Verify there are no circular dependencies introduced by the new module (which imports from `session-capability`, `utils`, and `types` — all existing and already used by other capabilities).

This step also verifies that `resolveCapabilityConfig()` in `utils.ts` can dynamically import `"execute-task"` from the capabilities directory (it uses dynamic import convention `./capabilities/${cap}` which matches our new filename).

**Acceptance criteria:**
- [ ] `npm run check` reports zero TypeScript errors across the entire project
- [ ] No new files outside the scope of this goal were created or modified
- [ ] All five expected files exist: `src/capabilities/execute-task.ts`, `src/prompts/execute-task.md`, `src/skills/execute-task/SKILL.md`, and both modified files (`src/utils.ts`, `src/index.ts`) contain the expected changes

**Files affected:**
- (verification only — no file changes)

## Notes

- **Validation for COMPLETED vs BLOCKED:** The agent may produce either marker. Since `validateOutputs` checks for specific file existence, we validate `SUMMARY.md` (always required) and rely on the prompt contract to enforce writing one of the two markers. An alternative would be to add custom validation logic that checks for OR conditions, but that's out of scope — the current single-file validation with SUMMARY.md is sufficient since both COMPLETED and BLOCKED paths require SUMMARY.md.
- **Transition change impact:** Changing `CAPABILITY_TRANSITIONS` means after evolve-plan completes its first step, it will auto-enqueue execute-task instead of enqueuing nothing (previously there was no transition after evolve-plan). This changes the default workflow but is intentional per the goal.
- **Step resolution difference from evolve-plan:** evolve-plan finds the first step where TASK.md or TEST.md is *missing*. execute-task finds the first step where both exist but COMPLETED/BLOCKED is *missing*. These are complementary scans — they won't conflict.
- **`readOnlyFiles` for spec protection:** The command handler should set `readOnlyFiles` to include the step's `TASK.md` and `TEST.md` paths so the agent can't modify its input specs. This follows the pattern used by `validation.ts` for file protection.
- **No test runner in this project:** The execute-task agent needs to handle projects without formal test runners gracefully. The prompt should instruct falling back to command-based verification from TEST.md when real tests aren't feasible.
