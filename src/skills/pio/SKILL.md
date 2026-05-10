---
name: pio
description: Goal-driven project management workflow for the pi coding agent. Use when pio is explicitely mentioned, or when breaking complex work into structured sub-sessions with validation gates, prompt templates, and explicit output requirements. Covers the full lifecycle: goal definition → planning → specification → implementation → review.
---

## Overview

pio is an extension for the pi coding agent framework that provides a goal-driven project management workflow. It enables developers and AI agents to break complex work into structured sub-sessions with validation gates, prompt templates, and explicit output requirements. Each workflow step runs in its own isolated sub-session, ensuring focused execution and verifiable outputs.

## Workflow lifecycle

Steps chain together in a dependency pipeline:

1. **create-goal** — Interviews about a feature/fix, produces `GOAL.md` (current state + target description)
2. **create-plan** — Reads `GOAL.md`, produces `PLAN.md` (numbered steps with acceptance criteria)
3. **evolve-plan** — Finds next incomplete step in `PLAN.md`, produces `TASK.md` + `TEST.md` in `S{NN}/`
4. **execute-task** — Reads specs from `S{NN}/`, implements step (test-first/TDD), writes `COMPLETED`/`BLOCKED` marker + `SUMMARY.md`
5. **review-code** — Reviews completed step, writes `REVIEW.md`. Approve → advances to next step. Reject → deletes `COMPLETED`, re-executes same step.

Steps 3–5 form a cycle: `evolve-plan` → `execute-task` → `review-code` → repeat until all plan steps are done.

**Alternative:** `execute-plan` runs all plan steps in a single session (no evolve/execute/review loop). Requires both `GOAL.md` and `PLAN.md`.

## Command reference

| Command | Tool | Description | Parameters | Output |
|---------|------|-------------|------------|--------|
| `/pio-init` | `pio_init` | Bootstrap `.pio/` directory structure | none | `.pio/` with subdirs |
| `/pio-create-goal <name>` | `pio_create_goal` | Create goal workspace, launch Goal Definition Assistant | `name` (optional `initialMessage`) | `.pio/goals/<name>/GOAL.md` |
| `/pio-delete-goal <name>` | `pio_delete_goal` | Remove a goal workspace directory | `name` | — |
| `/pio-create-plan <name>` | `pio_create_plan` | Launch Planning Agent to produce PLAN.md from GOAL.md | `name` | `.pio/goals/<name>/PLAN.md` |
| `/pio-evolve-plan <name>` | `pio_evolve_plan` | Find next incomplete step, launch Specification Writer | `name` | `.pio/goals/<name>/S{NN}/TASK.md`, `TEST.md` |
| `/pio-execute-task <name> [step]` | `pio_execute_task` | Implement one plan step (TDD) | `name`, optional `stepNumber` | `.pio/goals/<name>/S{NN}/COMPLETED` or `BLOCKED`, `SUMMARY.md` |
| `/pio-review-code <name> [step]` | `pio_review_code` | Review completed step, approve or reject | `name`, optional `stepNumber` | `.pio/goals/<name>/S{NN}/REVIEW.md`, optionally `APPROVED` |
| `/pio-execute-plan <name>` | — (command only) | Execute all plan steps in one session | `name` | All code changes from PLAN.md |
| `/pio-project-context` | `pio_create_project_context` | Analyze project, produce PROJECT.md knowledge file | none | `.pio/PROJECT.md` |
| `/pio-next-task` | — (command only) | Dequeue and start the oldest queued sub-session task | none | Launches appropriate sub-session |
| `/pio-parent` | — (command only) | Switch back to parent session | none | — |
| `pio_mark_complete` | — (shared tool) | Validate expected outputs exist, signal session done | none | Pass/fail + auto-enqueue next task |

## Common conventions

- **`<name>`** always refers to a goal workspace under `.pio/goals/<name>/`.
- **Step folders** follow `S{NN}/` naming (e.g., `S01/`, `S02/`) inside the goal workspace.
- **File protections:** `readOnlyFiles` and `writeAllowlist` are enforced via the `tool_call` event handler. Reads-only prevent modification of input docs; write-allowlists restrict output to expected files. Writes to `.pio/` outside the session's own goal workspace are blocked by default.
- **Exit-gate validation:** When expected outputs are declared, the agent must call `pio_mark_complete` to validate before switching sessions. This auto-enqueues the next workflow task (single-slot FIFO queue).
- **No source code in planning docs:** `GOAL.md`, `PLAN.md`, `TASK.md` contain descriptions and interface signatures only — never full implementations.
- **Programmatic verification preferred:** Acceptance criteria should be verifiable via `npm run check`, file existence checks, or similar automated means.

## Sub-session mechanics

- **`launchCapability()`** (in `session-capability.ts`) creates sub-sessions with a custom `pio-config` entry containing: capability name, working directory, validation rules, file protections, session parameters, and an optional initial message.
- **Context injection order:** On `before_agent_start`, `.pio/PROJECT.md` is loaded first (cached module-level), then the capability-specific prompt from `src/prompts/`. Both are concatenated as a custom conversation message — this preserves pi's default system prompt while layering role-specific instructions on top.
- **One-shot validation with cap:** The exit-gate blocks only the *first* attempted switch when validation fails (tracked by `warnedOnce`). A hard cap of 3 warnings per session (`MAX_WARNINGS`) prevents infinite blocking loops. The gate resets on each `turn_start`.
- **Queue files use timestamps:** Task filenames in `.pio/session-queue/` are `{timestamp}-{capability}.json`. Lexicographic sort = chronological order for FIFO processing.
- **`launchCapability` consumes context:** After calling it, the command context is stale. All pre-launch work (validation, filesystem setup) must happen before the call.
