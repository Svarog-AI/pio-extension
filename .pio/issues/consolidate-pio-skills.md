# Consolidate per-capability skills into a single global pio skill

## Problem

The extension currently ships 6 separate skills under `src/skills/`, one per capability:

- `create-goal` — `/pio-create-goal`
- `create-plan` — `/pio-create-plan`  
- `evolve-plan` — `/pio-evolve-plan`
- `execute-plan` — `/pio-execute-plan`
- `execute-task` — `/pio-execute-task` (single-step TDD)
- `project-context` — `/pio-project-context`

Each SKILL.md is only ~4–5 lines: a short description, usage syntax, and output location. This fragments knowledge that's naturally cohesive — the value of pio is understanding how these steps chain together (goal → plan → evolve → execute).

## Proposal

Replace the 6 files with a single `src/skills/pio/SKILL.md` covering the entire workflow:

1. **Overview** — what pio does (goal-driven sub-session workflow)
2. **Workflow lifecycle** — how steps connect and depend on each other
3. **Command reference** — all commands/tools in one table (command, tool, description, output)
4. **Common conventions** — `<name>` always = goal name under `.pio/goals/`, file protections, validation gates
5. **Sub-session mechanics** — how `launchCapability` works, context injection order, exit-gate validation

## Benefits

- Single source of truth — easier to maintain when commands or conventions change
- Explains relationships between steps (cross-cutting context is lost in siloed files)
- A consolidated ~50–80 line file is still easy to scan; no readability loss
- Removes 5 near-empty directories from the repo

## Migration

- Delete `src/skills/{create-goal,create-plan,evolve-plan,execute-plan,execute-task,project-context}/`
- Create `src/skills/pio/SKILL.md` with the consolidated content
- No changes needed to capability code or prompt templates — skills are documentation-only (injected at `before_agent_start`)

## Category

improvement

## Context

Current skill files: src/skills/create-goal/SKILL.md, src/skills/create-plan/SKILL.md, src/skills/evolve-plan/SKILL.md, src/skills/execute-plan/SKILL.md, src/skills/execute-task/SKILL.md, src/skills/project-context/SKILL.md
