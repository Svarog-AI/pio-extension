# Plan: Consolidate PIO Skills into a Single Global Skill

Replace 7 scattered per-capability SKILL.md files with one consolidated `src/skills/pio/SKILL.md`, then remove old directories and update skill registration.

## Prerequisites

None.

## Steps

### Step 1: Create consolidated `src/skills/pio/SKILL.md`

**Description:** Create a new directory `src/skills/pio/` and write a single `SKILL.md` that covers the complete pio workflow as one cohesive document (~50–80 lines). The frontmatter must use `name: pio` (matching the parent directory per Agent Skills spec) and a concise description explaining what pio does and when to use it.

The file must contain these sections:
1. **Overview** — What pio does (goal-driven sub-session workflow with validation gates), how it fits into the pi agent framework.
2. **Workflow lifecycle** — How steps chain together: `create-goal` → `create-plan` → `evolve-plan` → `execute-task` → `review-code` cycle, plus `execute-plan` as the all-in-one alternative.
3. **Command reference** — A table of all commands and tools: `/pio-*` command name, `pio_*` tool name, description, input parameters, and output files. Must cover all 7 capabilities plus shared entries (`pio_mark_complete`, `/pio-next-task`, `/pio-parent`, `/pio-delete-goal`, `/pio-init`).
4. **Common conventions** — `<name>` refers to `.pio/goals/<name>/`; file protections (readOnly/writeOnly) via `tool_call` events; exit-gate validation blocks session switch when expected outputs are missing; step folders use `S{NN}/` naming.
5. **Sub-session mechanics** — How `launchCapability()` creates sub-sessions with `pio-config`; context injection order (`.pio/PROJECT.md` first, then capability prompt); one-shot validation with hard cap of 3 warnings; queue files use timestamps for FIFO.

Content should be synthesized from the existing 7 SKILL.md files, the capability code (`src/capabilities/session-capability.ts`, `validation.ts`), and `src/index.ts` to ensure accuracy about mechanics like injection order and validation caps.

**Acceptance criteria:**
- [ ] `src/skills/pio/SKILL.md` exists with valid frontmatter (`name: pio`)
- [ ] The file contains all 5 required sections (overview, lifecycle, command reference, conventions, sub-session mechanics)
- [ ] The command reference table covers all 7 capabilities plus shared tools/commands
- [ ] `npm run check` reports no TypeScript errors

**Files affected:**
- `src/skills/pio/SKILL.md` — new file: consolidated pio skill documentation

### Step 2: Delete old skill directories and update `src/index.ts`

**Description:** Remove the 7 existing skill directories and update the skill registration in `src/index.ts` so only the new consolidated path is returned.

Specifically:
- Delete these directories: `src/skills/create-goal/`, `src/skills/create-plan/`, `src/skills/evolve-plan/`, `src/skills/execute-task/`, `src/skills/execute-plan/`, `src/skills/review-code/`, `src/skills/project-context/`
- In `src/index.ts`, replace the `skillPaths` array (currently 7 entries) with a single entry: `path.join(SKILLS_DIR, "pio")`

This ensures pi discovers only one pio skill instead of seven siloed ones. No other code changes are needed — capabilities and prompts are unaffected.

**Acceptance criteria:**
- [ ] All 7 old directories are deleted (verified with `ls src/skills/`)
- [ ] `src/index.ts` `skillPaths` array contains exactly one entry pointing to `pio`
- [ ] `npm run check` reports no TypeScript errors
- [ ] No other files reference the deleted skill paths (grep confirms clean removal)

**Files affected:**
- `src/skills/create-goal/` — deleted
- `src/skills/create-plan/` — deleted
- `src/skills/evolve-plan/` — deleted
- `src/skills/execute-task/` — deleted
- `src/skills/execute-plan/` — deleted
- `src/skills/review-code/` — deleted
- `src/skills/project-context/` — deleted
- `src/index.ts` — update `skillPaths` array from 7 entries to 1

## Notes

- Skill name must match parent directory per Agent Skills spec: `name: pio` in frontmatter must match `src/skills/pio/` directory name.
- The consolidated description should be specific enough for the agent to load the skill on relevant tasks — follow the "Good" examples from the skills spec (describe what it does and when to use it).
- No capability code or prompt templates are affected — this is purely a documentation consolidation plus registration change.
- After consolidation, only one skill entry will appear in `<available_skills>` instead of seven, giving agents better cross-cutting context about how pio steps chain together.
