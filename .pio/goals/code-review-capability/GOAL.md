# Code Review Capability

Add a new `review-code` capability that runs after `execute-task` and before `evolve-plan`. It reviews the implementation produced by execute-task, writes a `REVIEW.md` with categorized issues, and makes a conditional decision: approve (proceed to next step) or reject (re-execute same step with review feedback).

## Current State

The pio workflow has a fixed linear capability chain enforced by `CAPABILITY_TRANSITIONS` in `src/utils.ts`:

```
create-goal → create-plan → evolve-plan → execute-task → evolve-plan (repeat)
```

After `execute-task` completes and the agent calls `pio_mark_complete`, the validation tool in `src/capabilities/validation.ts` automatically enqueues the next capability from `CAPABILITY_TRANSITIONS`. Currently `"execute-task": "evolve-plan"`, meaning there is no review gate — as soon as a step's `SUMMARY.md` passes validation, the next spec generation starts immediately.

Each capability follows a consistent pattern established across `src/capabilities/`:

- **Capability module** (e.g., `execute-task.ts`) exports `CAPABILITY_CONFIG` (prompt name, default message) and a `setupXxx(pi)` function that registers a tool (`defineTool` with TypeBox params) and optionally a command.
- **Prompt file** (e.g., `src/prompts/execute-task.md`) contains the system prompt injected via `before_agent_start` in `session-capability.ts`. It instructs the agent what to do, what files to read/write, and when to call `pio_mark_complete`.
- **Session launch** is handled by `launchCapability()` from `session-capability.ts`, which creates a sub-session with custom entry `pio-config` containing: capability name, prompt file, working directory, validation rules, read-only files, and write allowlist.
- **Validation** is defined in `src/capabilities/validation.ts`. The `pio_mark_complete` tool checks that expected files exist (from config.validation), then auto-enqueues the next task via `CAPABILITY_TRANSITIONS[capability]`. File protection (`readOnlyFiles`/`writeAllowlist`) is enforced via the `tool_call` event handler.
- **Transition** happens automatically — no conditional logic exists today. The next capability is always determined by the hard-coded map in `utils.ts`.

Relevant files:
- `src/utils.ts` — `CAPABILITY_TRANSITIONS`, `enqueueTask`, `resolveCapabilityConfig`
- `src/capabilities/validation.ts` — `pio_mark_complete` tool with auto-enqueue logic, file protection
- `src/capabilities/execute-task.ts` — reference for capability structure, validation override, read-only setup
- `src/capabilities/evolve-plan.ts` — reference for finding next step
- `src/types.ts` — `CapabilityConfig`, `StaticCapabilityConfig` interfaces
- `src/index.ts` — capability registration (imports + `setupXxx(pi)` calls)

## To-Be State

A new capability module `src/capabilities/review-code.ts` and prompt `src/prompts/review-code.md` are added. The capability sits between `execute-task` and `evolve-plan`.

### New files

1. **`src/capabilities/review-code.ts`** — Capability module following the existing pattern:
   - Exports `CAPABILITY_CONFIG` with prompt `"review-code.md"` and a `defaultInitialMessage` referencing the goal workspace and step number.
   - Exports `setupReviewCode(pi)` that registers `pio_review_code` tool and `/pio-review-code` command.
   - Tool validates: goal exists, step N has `COMPLETED` marker (step was executed), `SUMMARY.md` exists. If valid, enqueues the review task with `{ capability: "review-code", params: { goalName, stepNumber } }`.
   - Command handler validates same preconditions, resolves config via `resolveCapabilityConfig`, sets validation to require `S{NN}/REVIEW.md`, and launches capability.
   - The command must also pass the step's review feedback context when re-running after a rejection (see conditional decision below).

2. **`src/prompts/review-code.md`** — System prompt for the Code Review Agent:
   - Reads `GOAL.md`, `PLAN.md`, `S{NN}/TASK.md`, `S{NN}/TEST.md`, and `S{NN}/SUMMARY.md`.
   - Uses `SUMMARY.md` to find which files were created/modified, then reads those implementation files.
   - Analyzes: test coverage vs requirements, implementation correctness, simplicity, anti-patterns, gaps between PLAN↔implementation and GOAL↔TASK↔TESTS.
   - For each issue, labels criticality: low, medium, high, or critical.
   - **High and critical issues must never be ignored.** Low and medium are at the reviewer's discretion — when in doubt, use `ask_user` to decide.
   - Decides approve or reject. When in doubt, uses `ask_user`.
   - Writes `S{NN}/REVIEW.md` with structured sections: issues by criticality, gaps found, approval decision, and reasoning.

3. **`src/skills/review-code/SKILL.md`** — Skill description file so the capability appears in `<available_skills>` (follows pattern of existing skill directories).

### Conditional decision mechanism

The key requirement: after review completes, the next task depends on the approval decision.

- **If approved:** `pio_mark_complete` auto-enqueues `evolve-plan` (next step) via `CAPABILITY_TRANSITIONS`. The transition map gets a new entry: `"review-code": "evolve-plan"`.
- **If rejected:** The review prompt must instruct the agent to enqueue `execute-task` for the same step explicitly before calling `pio_mark_complete`. This is done by having the agent write rejection details into a file (e.g., `S{NN}/REVIEW_REJECTED`) that the re-enqueued execute-task session can read as additional context. The prompt instructs: use the available tools to enqueue the task directly via a mechanism like writing the review feedback, or the REVIEW.md itself serves as the feedback — the next execute-task session will read REVIEW.md if it exists alongside TASK.md/TEST.md.

The simplest approach matching existing patterns: on rejection, the agent uses `ask_user` to confirm, then writes REVIEW.md with decision REJECTED. The prompt instructs the agent to manually enqueue execute-task (same step) before calling `pio_mark_complete`, since `CAPABILITY_TRANSITIONS["review-code"]` defaults to `evolve-plan`. This requires either:
- A small modification to allow dynamic transitions per-session, OR
- The review prompt instructs the agent to write a queue file directly when rejecting (bypassing the auto-transition) before calling `pio_mark_complete`, OR
- `CAPABILITY_TRANSITIONS["review-code"]` maps to `execute-task` by default (so rejected goes back), and on approval the agent enqueues `evolve-plan` explicitly.

**Recommended approach:** Default `CAPABILITY_TRANSITIONS["review-code"]` to `"execute-task"` (the rejection/re-do path). On approval, the review prompt instructs the agent to enqueue `evolve-plan` explicitly before calling `pio_mark_complete`, overriding the default. This keeps the auto-transition safe (re-execution) and only requires explicit override on the happy path. The review prompt must also instruct: delete or rename any `COMPLETED` marker so execute-task knows this step needs re-execution (since `isStepReady` checks for no COMPLETED marker).

### Changes to existing files

- **`src/utils.ts`:** Add `"review-code": "execute-task"` to `CAPABILITY_TRANSITIONS`. This makes the default transition after review be a re-execution of the same step.
- **`src/index.ts`:** Import and call `setupReviewCode(pi)`. Add the skill path for `review-code` to the skill paths array.
- **`src/capabilities/validation.ts`:** No changes needed — the auto-enqueue mechanism works as-is with the new transition entry.

### Review.md structure

The prompt will produce a file with this structure:

```markdown
# Code Review: <Step Title> (Step N)

## Decision
APPROVED or REJECTED

## Summary
<Brief assessment of overall quality>

## Critical Issues
- [CRITICAL] <description> — <file reference>

## High Issues
- [HIGH] <description> — <file reference>

## Medium Issues
- [MEDIUM] <description> — <file reference>

## Low Issues
- [LOW] <description> — <file reference>

## Test Coverage Analysis
<Are all acceptance criteria covered by tests? Any gaps?>

## Gaps Identified
<Discrepancies between GOAL ↔ PLAN ↔ TASK ↔ TESTS ↔ Implementation>

## Recommendations
<Suggestions for improvement on re-execution, if rejected>
```

### Acceptance criteria

1. `src/capabilities/review-code.ts` exists with `CAPABILITY_CONFIG`, tool (`pio_review_code`), command (`/pio-review-code`), and `setupReviewCode`.
2. `src/prompts/review-code.md` exists with the Code Review Agent prompt (reads all context files, analyzes issues by criticality, conditional approve/reject, writes REVIEW.md).
3. `src/skills/review-code/SKILL.md` exists for skill discovery.
4. `"review-code": "execute-task"` added to `CAPABILITY_TRANSITIONS` in `src/utils.ts`.
5. `setupReviewCode(pi)` called in `src/index.ts`.
6. `npm run check` passes (no type errors).
