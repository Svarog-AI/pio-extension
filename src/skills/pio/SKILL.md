---
name: pio
description: Goal-driven project management workflow for the pi coding agent. Use when pio is explicitely mentioned, or when breaking complex work into structured sub-sessions with validation gates, prompt templates, and explicit output requirements. Covers the full lifecycle - goal definition → planning → specification → implementation → review.
---

## Overview

pio is an extension for the pi coding agent framework that provides a goal-driven project management workflow. It enables developers and AI agents to break complex work into structured sub-sessions with validation gates, prompt templates, and explicit output requirements. Each workflow step runs in its own isolated sub-session, ensuring focused execution and verifiable outputs.

## Workflow lifecycle

Steps chain together in a dependency pipeline:

1. **create-goal** — Interviews about a feature/fix, produces `GOAL.md` (current state + target description)
2. **create-plan** — Reads `GOAL.md`, produces `PLAN.md` (numbered steps with acceptance criteria)
3. **evolve-plan** — Finds next incomplete step in `PLAN.md`, produces `TASK.md` in `S{NN}/` (or spawns a subgoal for composite steps)
4. **execute-task** — Reads specs from `S{NN}/`, implements step (test-first/TDD), writes `COMPLETED`/`BLOCKED` marker + `SUMMARY.md`
5. **review-task** — Reviews completed step, writes `REVIEW.md`. Approve → advances to next step. Reject → deletes `COMPLETED`, re-executes same step.

Steps 3–5 form a cycle: `evolve-plan` → `execute-task` → `review-task` → repeat until all plan steps are done.

**Plan revision:** During specification, `evolve-plan` can divert to `revise-plan` when the `REVISE_PLAN_NEEDED` marker is present (decisions make future steps impossible, require changes to completed implementations, or need additional steps). `revise-plan` archives the current `PLAN.md`, deletes incomplete step folders, and writes a fresh plan. After revision, control returns to `evolve-plan`.

**Alternative:** `execute-plan` runs all plan steps in a single session (no evolve/execute/review loop). Requires both `GOAL.md` and `PLAN.md`.

**Nested subgoals:** When a plan step has `complexity: "subgoal"` in the PLAN.md frontmatter `steps` array, `evolve-plan` spawns a child goal workspace at `S{NN}/subgoals/<name>/` instead of producing TASK.md. The subgoal runs through the full pio lifecycle recursively: `create-goal` → `create-plan` → `evolve-plan` → `execute-task` → `review-task` → `finalize-goal`. Recursive nesting is supported — each level adds `subgoals/<name>/` to the path. After the subgoal's `finalize-goal`, completion propagates back to the parent's `evolve-plan` for the next step. The subgoal's `COMPLETED` marker is the authoritative signal — subgoal completion equals parent step completion.

## Command reference

| Command | Tool | Description | Parameters | Output |
|---------|------|-------------|------------|--------|
| `/pio-init` | `pio_init` | Bootstrap `.pio/` directory structure | none | `.pio/` with subdirs |
| `/pio-create-goal --workspace-prefix <prefix>` | `pio_create_goal` | Create a workspace and queue goal definition session | `--workspace-prefix` (optional `--session-name`, `--initial-message`) | Workspace directory with `GOAL.md` |
| `/pio-delete-goal <name>` | `pio_delete_goal` | Remove a goal workspace directory | `name` | — |
| `/pio-create-plan --workspace-prefix <prefix>` | `pio_create_plan` | Queue planning session to produce PLAN.md | `--workspace-prefix` (optional `--session-name`, `--initial-message`) | `<workspace>/PLAN.md` |
| `/pio-evolve-plan --workspace-prefix <prefix> --step-number <n>` | `pio_evolve_plan` | Find/evolve a plan step, queue specification session | `--workspace-prefix`, `--step-number` (optional `--session-name`, `--initial-message`) | `<workspace>/TASK.md` |
| `/pio-execute-task --workspace-prefix <prefix>` | `pio_execute_task` | Queue task execution (TDD) | `--workspace-prefix` (optional `--session-name`, `--initial-message`) | `<workspace>/COMPLETED` or `BLOCKED`, `SUMMARY.md` |
| `/pio-review-task --workspace-prefix <prefix>` | `pio_review_task` | Queue step review, approve or reject | `--workspace-prefix` (optional `--session-name`, `--initial-message`) | `<workspace>/REVIEW.md`, optionally `APPROVED` |
| `/pio-revise-plan --workspace-prefix <prefix>` | `pio_revise_plan` | Archive plan and queue fresh planning session | `--workspace-prefix` (optional `--session-name`, `--initial-message`) | `<workspace>/PLAN.md` (rewritten) |
| `/pio-execute-plan --workspace-prefix <prefix>` | — (command only) | Execute all plan steps in one session | `--workspace-prefix` | All code changes from PLAN.md |
| `/pio-project-context` | `pio_create_project_context` | Analyze project, produce 7-file project context | none | `.pio/PROJECT/` (7 files) |
| `/pio-create-issue <slug> <title>` | `pio_create_issue` | Create a new issue as a markdown file under `.pio/issues/` | `slug`, `title`, optional `description`, `category`, `context` | `.pio/issues/<slug>.md` |
| `/pio-goal-from-issue <issue>` | `pio_goal_from_issue` | Convert an existing issue into a structured goal workspace | `issuePath` | Queues create-goal session |
| `/pio-list-goals` | — (command only) | List all goal workspaces with inferred phase and last task | none | Table of goals, phases, last tasks |
| `/pio-next-task` | — (command only) | Dequeue and start the oldest queued sub-session task | none | Launches appropriate sub-session |
| `/pio-parent` | — (command only) | Switch back to parent session | none | — |
| `pio_mark_complete` | — (shared tool) | Validate expected outputs exist, signal session done | none | Pass/fail + auto-enqueue next task |

## Common conventions

- **Workspace prefix:** Capabilities declare paths relative to a workspace prefix (e.g., `goals/my-feature`, `research/proj-x`). The prefix tells path resolution where within `.pio/` to resolve contract files. Pio-workflow uses `goals/<name>/` as the conventional prefix; other state machines choose their own.
- **Step folders** follow `S{NN}/` naming (e.g., `S01/`, `S02/`) inside the goal workspace.
- **Subgoal directories** live at `S{NN}/subgoals/<name>/` inside parent step directories. The `subgoals/` marker prevents naming collisions with the step scanner regex (`/^S(\d+)$/`). Recursive nesting is supported — each level adds `subgoals/<name>/` to the path. Example: `.pio/goals/parent/S03/subgoals/nested-feature/`.
- **File protections:** `readOnlyFiles` and `writeAllowlist` are enforced via the `tool_call` event handler. Reads-only prevent modification of input docs; write-allowlists restrict output to expected files. Writes to `.pio/` outside the session's own goal workspace are blocked by default.
- **Exit-gate validation:** When expected outputs are declared, the agent must call `pio_mark_complete` to validate before switching sessions. This auto-enqueues the next workflow task (single-slot FIFO queue).
- **No source code in planning docs:** `GOAL.md`, `PLAN.md`, `TASK.md` contain descriptions and interface signatures only — never full implementations.
- **Programmatic verification preferred:** Acceptance criteria should be verifiable via `npm run check`, file existence checks, or similar automated means.
- **Plan revision:** `REVISE_PLAN_NEEDED` marker inside an `S{NN}/` folder signals that the plan requires restructuring. `evolve-plan` auto-detects this marker and routes to `revise-plan` via the state machine.
- **Plan archive:** Archived plans live in `PLAN_ARCHIVE/` inside the goal workspace, with timestamped filenames (e.g., `PLAN-{YYYYMMDDTHHMMSSZ}.md`). The `revise-plan` agent reads these for context when writing a fresh plan.
- **ask_user inline display mode:** When calling `ask_user` inside a pio sub-session, always pass `{ displayMode: "inline" }` so that questions appear with surrounding context visible rather than as an overlay. Example: `ask_user({ question: "...", displayMode: "inline" })`. The ask_user skill already documents this option — pio agents should use it by default in sub-sessions.

## Sub-session mechanics

- **`launchCapability()`** (in `session-capability.ts`) creates sub-sessions with a custom `pio-config` entry containing: capability name, working directory, validation rules, file protections, session parameters, and an optional initial message.
- **Context injection order:** On `before_agent_start`, `.pio/PROJECT/OVERVIEW.md` is loaded first (cached module-level), then the capability-specific prompt from `src/prompts/`. Both are concatenated as a custom conversation message — this preserves pi's default system prompt while layering role-specific instructions on top.
- **One-shot validation with cap:** The exit-gate blocks only the *first* attempted switch when validation fails (tracked by `warnedOnce`). A hard cap of 3 warnings per session (`MAX_WARNINGS`) prevents infinite blocking loops. The gate resets on each `turn_start`.
- **Generalized task queue:** `enqueueTask(cwd, queueKey, task)` accepts arbitrary string keys. Each state machine instance gets its own queue slot at `.pio/session-queue/task-{queueKey}.json`. Pio-workflow uses goal-scoped keys; other state machines use their own naming convention. One pending task per key — enqueueing overwrites.
- **`launchCapability` consumes context:** After calling it, the command context is stale. All pre-launch work (validation, filesystem setup) must happen before the call.

## Agent Usage Guidelines

**Always use `pio_*` tools for pio workflow operations.** These tools handle all filesystem operations internally — you never need to manually create files, generate timestamps, or run bash commands for pio workflow tasks.

- **Call tools directly:** Use `pio_create_goal`, `pio_create_plan`, `pio_evolve_plan`, etc. instead of trying to set up workspace files yourself with bash or the write tool.
- **No manual file creation in `.pio/`:** Never use `bash` (`date`, `ls`, `mkdir`) or the `write` tool to create files under `.pio/` when a pio tool exists for that purpose. The tools manage the directory structure automatically.
- **No bash workarounds:** Commands like `date +%Y%m%d_%H%M%S` or `ls .pio/issues/` are unnecessary. Use the appropriate pio tool directly.
- **Capabilities require workspace prefix, not goal names:** All pio capability tools accept `--workspace-prefix` (e.g., `goals/my-feature`). The framework resolves paths within `.pio/` using this prefix — capabilities themselves don't know about goals or directories.
- **No manual step selection via execute/review commands:** `/pio-execute-task` and `/pio-review-task` require `--workspace-prefix` (not a step number). Use `/pio-next-task` for step-aware auto-advance or rely on mark-complete to automatically enqueue the next workflow step. For manual step specification, use `pio_evolve_plan` which handles step discovery.
- **Never auto-start queued tasks:** After calling a `pio_*` tool that queues work, report completion and wait for the user to run `/pio-next-task`. Do not attempt to execute `/pio-next-task` or any variant of it programmatically — it is an interactive TUI command for human use only.
