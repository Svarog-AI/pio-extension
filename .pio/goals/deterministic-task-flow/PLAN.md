# Plan: Deterministic Task Flow — Auto-enqueue Next Task on Completion

When `pio_mark_complete` validation passes, automatically enqueue the next pipeline step so `/pio-next-task` is always ready.

## Prerequisites

None. The current codebase already has all required infrastructure (`enqueueTask`, `launchCapability`, `SessionQueueTask`, validation framework). Only two source files need changes.

## Steps

### Step 1: Add capability transition map and planning helpers to utils.ts

**Description:** Centralize the "happy path" capability transitions in `src/utils.ts`. Each entry maps a current capability (identified by its `systemPromptName`) to a configuration builder function that returns the `SessionQueueTask` for the next step — or `undefined` if the pipeline is complete.

Three transition rules are needed:
- `create-goal.md` → `create-plan` task for the same goal
- `create-plan.md` → `evolve-plan` task for the same goal (Step 1)
- `evolve-plan.md` → another `evolve-plan` task for the next step number, or nothing if all steps in PLAN.md are complete

Add a new exported type and the transition map:

```ts
/** Context needed to build the next task. */
export interface NextTaskContext {
  cwd: string;
  workingDir: string;   // absolute path to goal workspace (.pio/goals/<name>/)
}

/** A builder that returns the next queued task, or undefined when the pipeline is complete. */
export type NextTaskBuilder = (ctx: NextTaskContext) => SessionQueueTask | undefined;

/** Maps systemPromptName → config builder for the next capability in the happy path. */
export const CAPABILITY_TRANSITIONS: Record<string, NextTaskBuilder>;
```

Also add two helper functions:
- `extractGoalName(workingDir: string): string` — derives the goal name from an absolute workingDir path by finding the segment after `/goals/`. Example: `/home/user/project/.pio/goals/my-feature/` → `"my-feature"`.
- `countPlanSteps(goalDir: string): number` — reads `{goalDir}/PLAN.md`, counts lines matching `/^###\s+Step\s+\d+/`, and returns the total. Returns 0 if PLAN.md doesn't exist or no steps are found.

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) reports no errors
- [ ] `CAPABILITY_TRANSITIONS` is exported from `src/utils.ts` with exactly 3 keys: `"create-goal.md"`, `"create-plan.md"`, `"evolve-plan.md"`
- [ ] `extractGoalName("/home/x/proj/.pio/goals/my-goal/")` returns `"my-goal"`
- [ ] `countPlanSteps(goalDir)` correctly counts steps for the existing `.pio/goals/recursive-project-context-discovery/PLAN.md` (returns 3)

**Files affected:**
- `src/utils.ts` — add `NextTaskContext` type, `NextTaskBuilder` type, `CAPABILITY_TRANSITIONS` map, `extractGoalName()` helper, `countPlanSteps()` helper

---

### Step 2: Wire auto-enqueue into validation.ts mark_complete success path

**Description:** Modify the `pio_mark_complete` tool in `src/capabilities/validation.ts` so that when validation passes (all declared output files exist), it automatically determines and enqueues the next capability task.

The implementation adds a new module-level variable to capture the `pi` reference during setup (needed for auto-enqueue access to cwd), then augments the success return in `markCompleteTool.execute`:

1. **Store `pi` reference on setup:** Add a module-level `let piInstance: ExtensionAPI | undefined;` and assign it in `setupValidation(pi)`. This is safe because the extension runs as a single process per workspace.

2. **Read session config from pio-config entry:** The custom entry already contains `systemPromptName` and `workingDir`. Use these to identify the current capability and goal context.

3. **Lookup next task builder:** Consult `CAPABILITY_TRANSITIONS[systemPromptName]` from utils.ts. If no entry exists (unknown capability or pipeline terminus like `execute-plan.md`), skip auto-enqueue and return normal success message.

4. **Build and enqueue:** Call the builder with `{ cwd, workingDir }`. If it returns a task, call `enqueueTask(cwd, task)` to write the queue file. Capture the returned file path for the user notification.

5. **Append notification to return message:** After the success text, add an auto-enqueue notification line:
   - On enqueue: `"Next task enqueued: {capability}. Run /pio-next-task to start it."` (plus alternatives if relevant — e.g., after `create-plan`: "...or override with /pio-evolve-plan directly.")
   - On pipeline complete (evolve-plan, all steps done): `"All plan steps are complete. No further tasks enqueued."`

6. **Graceful degradation:** If `piInstance` is not available or cwd cannot be determined, log a warning to console and proceed with the normal success message without auto-enqueue. Never throw or block validation from completing.

Key detail for evolve-plan transitions: The builder must parse the validated file paths (e.g., `"S03/TASK.md"`) to determine which step just completed, then compute the next step number. If `currentStep >= countPlanSteps(goalDir)`, return `undefined` (pipeline complete).

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) reports no errors
- [ ] After successful validation of a `create-goal` session, the tool return message includes "Next task enqueued: create-plan" and `.pio/session-queue/` contains a new JSON file with `capability: "create-plan"` and correct `workingDir`
- [ ] After successful validation of a `create-plan` session, the tool return message includes "Next task enqueued: evolve-plan" and the queue file references Step 1 configuration
- [ ] After successful validation of an `evolve-plan` session where more steps remain (e.g., completed S02 of 3), the tool return message includes "Next task enqueued: evolve-plan" for the next step number
- [ ] After successful validation of the last evolve-plan step (all steps complete), the tool return message includes a completion notification and NO new queue file is written
- [ ] Validation failure path (missing files) is unchanged — no auto-enqueue attempted
- [ ] Exit-gate behavior (`session_before_switch`) is unchanged — still blocks premature switches

**Files affected:**
- `src/capabilities/validation.ts` — add `piInstance` module-level variable, assign in `setupValidation`, modify mark_complete success path to call transition map and enqueue

---

## Notes

- **No changes to capability files needed.** `create-goal.ts`, `create-plan.ts`, `evolve-plan.ts`, and `execute-plan.ts` are untouched. The auto-enqueue logic lives entirely in validation.ts + utils.ts.
- **No changes to next-task.ts needed.** The queue file format (`SessionQueueTask`) is unchanged — the transition builders construct tasks using the existing type and `enqueueTask()`.
- **The `pio-config` custom entry does not currently store `capability` as a field.** We derive it from `systemPromptName` via `CAPABILITY_TRANSITIONS`. This avoids changing the CapabilityConfig interface or all call sites.
- **execute-plan has no transition entry.** It is the terminal capability in the pipeline — when implementation completes, no further task should be auto-enqueued.
- **Multiple mark_complete calls:** If an agent calls pio_mark_complete multiple times after validation passes, a queue file will be written each time (with different timestamps). This is acceptable behavior — /pio-next-task will process them sequentially. An improvement to deduplicate could be added later.
- **cwd availability:** In the tool execute handler, `ctx` provides `cwd`. We also need it for `enqueueTask(cwd, task)`. The pi instance stored from setup is not needed for cwd — `ctx.cwd` is available directly in the tool handler. However, we may want `piInstance` for potential future use (e.g., sending user notifications proactively).
- **No unit tests exist** in this project. Verification is via type checking and code review per project conventions.
