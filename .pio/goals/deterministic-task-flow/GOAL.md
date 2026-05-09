# Deterministic Task Flow: Auto-enqueue Next Task on Completion

When `pio_mark_complete` validates successfully, the system should automatically determine and **enqueue** the next logical capability task in the pipeline. This removes the burden on the agent to know about or manually call `/pio-next-task` — the queue is always prepared so the user only needs one command to advance. A default (happy path) next step is chosen per capability, and the user is notified of the enqueued task along with any alternative commands they could override with.

## Current State

The pio extension implements a goal-driven workflow where each stage runs in an isolated sub-session. The current chain of capabilities is:

1. **`create-goal`** (`src/capabilities/create-goal.ts`) — Creates `.pio/goals/<name>/`, launches a session that produces `GOAL.md`. Validates `[files: ["GOAL.md"]]`.
2. **`create-plan`** (`src/capabilities/create-plan.ts`) — Reads existing `GOAL.md`, produces `PLAN.md`. Validates `[files: ["PLAN.md"]]`. Has `readOnlyFiles: ["GOAL.md"]`.
3. **`evolve-plan`** (`src/capabilities/evolve-plan.ts`) — Scans for the first incomplete step (S01, S02, ...), produces `TASK.md` + `TEST.md` inside `S{NN}/`. Validates both files exist in that folder.
4. **`execute-plan`** (`src/capabilities/execute-plan.ts`) — Implementation agent that executes all plan steps in one session (command-only, no tool).

Each capability's **tool variant** uses `enqueueTask()` from `src/utils.ts` to write a JSON file into `.pio/session-queue/`, then tells the user to run `/pio-next-task`. The **command variant** directly calls `launchCapability()` from `src/capabilities/session-capability.ts`, which opens a new sub-session inline.

The manual bridge between sessions is `/pio-next-task` (`src/capabilities/next-task.ts`) — it reads the oldest JSON file from `.pio/session-queue/`, launches its sub-session, and deletes the queue file. This introduces non-determinism (the agent might forget to call it) and unnecessary friction.

Validation is handled by `src/capabilities/validation.ts`. The `pio_mark_complete` tool checks that declared output files exist. On `session_before_switch`, an exit-gate blocks the first switch attempt if validation fails (with a hard cap of 3 warnings). When validation passes, the tool returns success — but nothing else happens.

**Key data structures:**
- `SessionQueueTask` in `src/utils.ts` — `{ capability, systemPromptName, workingDir?, validation?, initialMessage, readOnlyFiles?, writeOnlyFiles? }`
- `CapabilityConfig` in `src/capabilities/session-capability.ts` — same shape, used to configure sub-sessions
- Queue files are stored as `.pio/session-queue/{timestamp}-{capability}.json`, sorted lexicographically for FIFO processing

## To-Be State

When `pio_mark_complete` validation passes in a capability session, the system automatically:

1. **Determines the next capability** using a hardcoded default (happy path) per current capability:
   - `create-goal` → `create-plan` (for the same goal name)
   - `create-plan` → `evolve-plan` (for the same goal name)
   - `evolve-plan` → `evolve-plan` again (next step number, for the same goal name), until all steps in PLAN.md are complete

2. **Enqueues the next task** by calling `enqueueTask()` with the appropriate `SessionQueueTask` configuration, so the queue is always ready for `/pio-next-task`.

3. **Notifies the user** that the next task has been auto-enqueued and suggests running `/pio-next-task`. If multiple valid next steps exist beyond the default, the message includes the alternatives (e.g., "Next task enqueued: create-plan. Run /pio-next-task to start it, or override with /pio-evolve-plan directly.")

4. **Includes goal context** in the enqueued task so it can be launched by `/pio-next-task` without the user re-typing the goal name. This means `SessionQueueTask` may need a new optional field (e.g., `goalName`) to carry this context forward.

**Implementation scope:**
- Modify `src/capabilities/validation.ts` — the `pio_mark_complete` tool's success path should determine and enqueue the next task, then include that info in the return message.
- Add a registry or mapping (likely in `src/utils.ts`) that declares each capability's default next step and its configuration. This keeps the logic centralized and easy to extend as new capabilities are added.
- The auto-enqueue logic must extract the goal name from the current session config (`pio-config` custom entry), which is already accessible in the validation module via `ctx.sessionManager.getEntries()`.
- When all steps of a plan are complete (evolve-plan's happy path end), no next task is enqueued — instead the user gets a completion message.
- `/pio-next-task` is still required to actually launch the enqueued task — it cannot be done automatically by the system.

**What stays the same:**
- The exit-gate behavior (`session_before_switch`) — validation still blocks premature session switches.
- File protection (`readOnlyFiles` / `writeOnlyFiles`) — unchanged.
- Tool vs. command distinction — capabilities continue to expose both (where applicable).
- `/pio-next-task` as a manual override option.
