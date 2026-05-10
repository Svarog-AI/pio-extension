# Consolidate PIO Skills into a Single Global Skill

Replace the 7 scattered per-capability SKILL.md files under `src/skills/` with a single consolidated `src/skills/pio/SKILL.md`. This produces one source of truth that describes the entire pio workflow lifecycle, command reference, and sub-session mechanics — making it easier to maintain and giving agents better cross-cutting context about how steps chain together.

## Current State

There are 7 separate skill directories under `src/skills/`, each containing a single SKILL.md of only ~4–10 lines:

- **`src/skills/create-goal/SKILL.md`** — Describes the Goal Definition Assistant session, usage (`/pio-create-goal <name>`), and output (`.pio/goals/<name>/GOAL.md`).
- **`src/skills/create-plan/SKILL.md`** — Describes the Planning Agent session, usage (`/pio-create-plan <name>`), and output (`.pio/goals/<name>/PLAN.md`).
- **`src/skills/evolve-plan/SKILL.md`** — Describes the Specification Writer session, usage (`/pio-evolve-plan <name>`), and outputs (`TASK.md`, `TEST.md` in `S{NN}/`).
- **`src/skills/execute-task/SKILL.md`** — Describes the Execute Task Agent (single-step TDD), usage (`/pio-execute-task <goal-name> [step-number]`), outputs (`COMPLETED`/`BLOCKED` markers + `SUMMARY.md`), and mentions the workflow cycle with evolve-plan.
- **`src/skills/execute-plan/SKILL.md`** — Describes the Implementation Agent (all steps in one session), usage (`/pio-execute-plan <name>`, command only), and that it requires both GOAL.md and PLAN.md.
- **`src/skills/review-code/SKILL.md`** — Describes the Code Review Agent, usage (`/pio-review-code <goal-name> [step-number]`), outputs (`REVIEW.md`, `APPROVED` marker), and the conditional workflow cycle (approve advances to next step; reject deletes COMPLETED and re-executes).
- **`src/skills/project-context/SKILL.md`** — Describes the Project Context Analyzer session, usage (`/pio-project-context`), and output (`.pio/PROJECT.md` injected into every session).

These files are documentation-only: they are injected at `before_agent_start` (see `src/capabilities/session-capability.ts`) alongside capability-specific prompts. Each file is essentially a stub — description, one-line usage, one-line output. The value of pio comes from understanding how these capabilities chain together (goal → plan → evolve → execute → review), but that cross-cutting context is lost in siloed files.

Skills are registered by the pi framework via `package.json` — each directory under `src/skills/` with a `SKILL.md` is discovered automatically. The skill metadata lives in frontmatter (`name`, `description`).

## To-Be State

A single file `src/skills/pio/SKILL.md` replaces all 7 existing skill files. It covers the complete pio workflow as one cohesive document, approximately 50–80 lines:

1. **Overview** — What pio does (goal-driven sub-session workflow with validation gates), how it fits into the pi agent framework.
2. **Workflow lifecycle** — How steps connect and depend on each other: `create-goal` produces GOAL.md → `create-plan` reads GOAL.md and produces PLAN.md → `evolve-plan` finds next incomplete step and produces TASK.md + TEST.md → `execute-task` implements one step (TDD) → `review-code` reviews (approve advances, reject re-executes) → cycle continues. Also covers `execute-plan` as the all-in-one alternative to the evolve/execute/review loop.
3. **Command reference** — A table of all commands and tools: name (`/pio-...` prefix), corresponding tool name (`pio_...`), description, input parameters, and output files. Covers all 7 capabilities plus shared tools (`pio_mark_complete`, `/pio-next-task`, `/pio-parent`, `/pio-delete-goal`, `/pio-init`).
4. **Common conventions** — `<name>` always refers to a goal workspace under `.pio/goals/<name>/`; file protections (readOnly/writeOnly) enforced via `tool_call` events; exit-gate validation blocks session switch when expected outputs are missing; step folders follow `S{NN}/` naming convention.
5. **Sub-session mechanics** — How `launchCapability()` in `src/capabilities/session-capability.ts` creates sub-sessions with custom `pio-config`; context injection order (`.pio/PROJECT.md` first, then capability-specific prompt); one-shot validation with hard cap of 3 warnings; queue files use timestamps for FIFO processing.

**Migration:**
- Delete all 7 directories: `src/skills/{create-goal,create-plan,evolve-plan,execute-plan,execute-task,review-code,project-context}/`
- Create `src/skills/pio/SKILL.md` with the consolidated content
- No changes to capability code (`src/capabilities/`) or prompt templates (`src/prompts/`) — skills are documentation-only
