# Plan: Fix Agent Degenerate Looping

Remove misleading timestamp documentation from SKILL.md, add behavioral guidance to use `pio_*` tools directly, and improve all tool descriptions so agents stop running bash commands instead of calling available tools.

## Prerequisites

- The `.pio/PROJECT.md` file is intentionally left untouched — it is runtime-generated and will be correct on next regeneration after the SKILL.md fix propagates.
- Run `npm install` if dependencies are not already present (needed for `npm run check`).

## Steps

### Step 1: Fix timestamp bug and add behavioral guidance to SKILL.md

**Description:** Update `src/skills/pio/SKILL.md` with two changes:

1. **Remove the misleading timestamp claim.** In the "Sub-session mechanics" section, replace the paragraph stating "Queue files use timestamps: Task filenames in `.pio/session-queue/` are `{timestamp}-{capability}.json`. Lexicographic sort = chronological order for FIFO processing." with an accurate description matching the actual code in `src/utils.ts`: per-goal task slots (`task-{goalName}.json`), one pending task per goal, overwrites on enqueue.

2. **Add a behavioral guidance section.** Insert a new section (e.g., "## Agent Usage Guidelines" or similar) before or after "Common conventions" that explicitly instructs agents to:
   - Always use `pio_*` tools for pio workflow operations — these tools handle all filesystem operations internally
   - Never manually create files in `.pio/` via bash (`date`, `ls`, `mkdir`) or the `write` tool when a pio tool exists for that purpose
   - Call tools directly; no bash commands are needed for pio workflow tasks

3. **Review other SKILL.md content for staleness.** Check the "Command reference" table and "Workflow lifecycle" section against the current codebase. Update any references to outdated patterns (e.g., missing capabilities like `create-issue`, `goal-from-issue`, `list-goals` if not already present, stale command names). The SKILL.md should accurately reflect all current tools and commands.

**Acceptance criteria:**
- [ ] `src/skills/pio/SKILL.md` contains no reference to `{timestamp}-{capability}.json` or "Queue files use timestamps"
- [ ] `src/skills/pio/SKILL.md` contains an accurate description of the per-goal task slot system (`task-{goalName}.json`) matching `src/utils.ts`
- [ ] `src/skills/pio/SKILL.md` contains a behavioral guidance section explicitly instructing agents to use `pio_*` tools directly instead of bash commands
- [ ] The command reference table in SKILL.md includes all current tools/commands (verify against files in `src/capabilities/`)
- [ ] `npm run check` reports no TypeScript errors

**Files affected:**
- `src/skills/pio/SKILL.md` — remove timestamp claim, add behavioral guidance section, update stale references

### Step 2: Improve all tool descriptions to discourage bash alternatives

**Description:** Update the `description` field in every `defineTool` call across the capabilities directory. Each description should be more actionable and self-contained, making clear that the tool handles filesystem operations internally and no bash commands are needed.

The pattern is: keep the existing functional description but append guidance like "Use this tool directly — all filesystem operations are handled internally." For example, `pio_create_issue` currently reads `"Create a new issue as a markdown file under .pio/issues/"` and should read `"Create a new issue as a markdown file under .pio/issues/. Use this tool directly — no bash commands or manual file creation needed."`

Update tools in the following files:
- `src/capabilities/init.ts` — `pio_init`
- `src/capabilities/create-goal.ts` — `pio_create_goal`
- `src/capabilities/create-plan.ts` — `pio_create_plan`
- `src/capabilities/evolve-plan.ts` — `pio_evolve_plan`
- `src/capabilities/execute-task.ts` — `pio_execute_task`
- `src/capabilities/review-code.ts` — `pio_review_code`
- `src/capabilities/delete-goal.ts` — `pio_delete_goal`
- `src/capabilities/project-context.ts` — `pio_create_project_context`
- `src/capabilities/validation.ts` — `pio_mark_complete`
- `src/capabilities/create-issue.ts` — `pio_create_issue`
- `src/capabilities/goal-from-issue.ts` — `pio_goal_from_issue`
- `src/capabilities/list-goals.ts` — `pio_list_goals`

**Acceptance criteria:**
- [ ] Every `defineTool` call in `src/capabilities/*.ts` has a description that makes clear the tool handles filesystem operations internally (no bash needed)
- [ ] No existing functionality or parameter schemas are changed — only the `description` string is modified
- [ ] `npm run check` reports no TypeScript errors

**Files affected:**
- `src/capabilities/init.ts` — update `pio_init` tool description
- `src/capabilities/create-goal.ts` — update `pio_create_goal` tool description
- `src/capabilities/create-plan.ts` — update `pio_create_plan` tool description
- `src/capabilities/evolve-plan.ts` — update `pio_evolve_plan` tool description
- `src/capabilities/execute-task.ts` — update `pio_execute_task` tool description
- `src/capabilities/review-code.ts` — update `pio_review_code` tool description
- `src/capabilities/delete-goal.ts` — update `pio_delete_goal` tool description
- `src/capabilities/project-context.ts` — update `pio_create_project_context` tool description
- `src/capabilities/validation.ts` — update `pio_mark_complete` tool description
- `src/capabilities/create-issue.ts` — update `pio_create_issue` tool description
- `src/capabilities/goal-from-issue.ts` — update `pio_goal_from_issue` tool description
- `src/capabilities/list-goals.ts` — update `pio_list_goals` tool description

## Notes

- **PROJECT.md is intentionally excluded.** The existing `.pio/PROJECT.md` already contains the timestamp misinformation but will be regenerated correctly after SKILL.md is fixed. No manual edit of PROJECT.md is needed or included here.
- **Step independence:** Step 1 (SKILL.md) and Step 2 (tool descriptions) are independent — they modify different file sets and could theoretically be done in parallel. They are ordered sequentially for convenience.
- **No test suite exists.** All verification relies on `npm run check` (TypeScript type checking) and manual review of file contents. An executor should read the modified files to confirm changes look correct.
- **Staleness in SKILL.md:** During Step 1, if the executor discovers additional stale references beyond timestamps (e.g., outdated command names, missing capabilities), include those fixes as part of Step 1's scope. The goal is a fully accurate SKILL.md.
