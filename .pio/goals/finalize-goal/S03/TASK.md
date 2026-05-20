# Task: Create finalize-goal prompt

Create `src/prompts/finalize-goal.md` as the system prompt for the Finalize Goal Agent, instructing it to read accumulated decisions from a completed goal and update `.pio/PROJECT/*.md` files accordingly.

## Context

When a pio goal completes (marked by `<goalDir>/COMPLETED`), accumulated decisions in `DECISIONS.md` remain isolated to the goal workspace. The finalize-goal capability (Step 5) will launch a sub-session using this prompt. The agent must read DECISIONS.md, evaluate each decision against update rules from the pio-project-knowledge skill, and produce targeted documentation updates to `.pio/PROJECT/*.md` files.

**DECISIONS.md may be incomplete.** Not every step produces decisions, and some significant changes (new files created, architectural patterns adopted) might appear in `SUMMARY.md` or `PLAN.md` but not make it into `DECISIONS.md`. The agent must also analyze `PLAN.md` (for the overall scope and files affected) and each step's `SUMMARY.md` (for what was actually built, decisions made, and files created/modified) to get a complete picture of what changed during the goal.

The pio-project-knowledge skill (Step 1) provides canonical file paths, section structure, update rules, and decision filtering guidance. The project-context prompt (updated in Step 2) already demonstrates the pattern of loading this skill via a "Skill Loading Instructions" section.

## What to Build

A markdown system prompt (`src/prompts/finalize-goal.md`) that instructs an AI agent to:

1. Load the pio-project-knowledge skill for PROJECT file knowledge (paths, structure, update rules)
2. Read PLAN.md from the goal workspace — understand the overall scope, what was planned to change, and which files were targeted
3. Read each step's SUMMARY.md (S01/SUMMARY.md, S02/SUMMARY.md, etc.) — discover what was actually built, decisions made per step, and files created/modified/deleted
4. Read the final DECISIONS.md from the highest-numbered step folder — path provided in the initial user message
5. **Synthesize a complete picture:** combine insights from PLAN.md (intent), SUMMARY.md files (what was built), and DECISIONS.md (captured decisions). Use all three sources to identify PROJECT file updates — do not rely on DECISIONS.md alone since it may be incomplete
6. Evaluate findings against update rules from the pio-project-knowledge skill
7. Read existing PROJECT files before modifying — preserve content, insert updates at appropriate sections
8. Skip findings that don't map to any update rule (follow decision filtering guidance from the skill)
9. Produce a summary output listing: files modified, changes made, which source triggered each change; explicitly state if no updates were warranted

### Code Components

This step produces a single markdown file — no TypeScript code. The prompt must follow the structural conventions of existing prompts (`create-plan.md`, `review-task.md`, `project-context.md`):

- **Agent identity line:** First line identifies the agent role and its job
- **Completion statement:** Explicit "your work is complete when..." with scope boundary ("Do not implement code")
- **Setup section:** Describes input parameters (goal workspace path, DECISIONS.md path from initial message)
- **Process section:** Numbered steps the agent follows in order
- **Guidelines section:** Quality bar, constraints, best practices

### Approach and Decisions

- **Follow the project-context.md prompt as the primary style reference** — it's the closest analog (reads source of truth, writes to `.pio/PROJECT/`). Adapt its "Skill Loading Instructions" pattern: place skill loading between Setup and the main process steps.
- **Reference pio-project-knowledge by name only.** Do not re-encode update rules or section structure inline. The skill is the single source of truth (per accumulated decisions from Steps 1–2). Instruct the agent to load it using `<available_skills>` or `src/skills/pio-project-knowledge/SKILL.md`.
- **Decision Filtering:** Instruct the agent to follow the "Decision Filtering" section from the pio-project-knowledge skill. This prevents forced or low-value updates. The prompt should explicitly say: apply decision filtering before updating — skip implementation-only details, local design choices, and one-off decisions.
- **Write targets:** The only allowed write targets are the 7 `.pio/PROJECT/*.md` files. Make this explicit in both a Setup section note and a Guidelines bullet (matching the project-context.md pattern: "Write only to `.pio/PROJECT/`. No other files may be modified.").
- **Summary output format:** Instruct the agent to produce a structured summary at the end — list each file modified, what changed, which DECISIONS.md entry triggered it. If no updates were warranted, state this explicitly with reasoning.
- **Multi-source analysis (DECISIONS.md + PLAN.md + SUMMARY.md):** The prompt must instruct the agent to read all three source types:
  - **PLAN.md** — goal-level intent: what was planned, files affected, overall scope. Helps identify new capabilities, modules, or architectural changes that warrant PROJECT file updates.
  - **Per-step SUMMARY.md** — ground truth of what was built: files created/modified/deleted, decisions made per step, test coverage. This captures details DECISIONS.md might miss (e.g., a new test file pattern, a new module added).
  - **DECISIONS.md** — accumulated explicit decisions. Primary source but may be incomplete.
  
  Instruct the agent to scan the goal workspace for step folders (S01/, S02/, etc.) and read `SUMMARY.md` from each. Read `PLAN.md` from the goal workspace root. Cross-reference all three sources — if PLAN.md mentions a new capability module that SUMMARY.md confirms was created, but DECISIONS.md doesn't mention it, still evaluate it for PROJECT updates.
- **DECISIONS.md path from initial message:** The initial user message provides the path to the final DECISIONS.md (from `GoalState.lastStepDecisions()` or equivalent). Instruct the agent to read this path, not search for it.
- **Graceful handling of incomplete sources:** If DECISIONS.md is missing or empty, proceed using PLAN.md and SUMMARY.md files. If individual SUMMARY.md files don't exist for some steps, skip those gracefully. Produce a summary noting which sources were available.

## Dependencies

- Step 1: pio-project-knowledge skill must exist at `src/skills/pio-project-knowledge/SKILL.md` with update rules
- Step 2: Skill loading instruction pattern established in `project-context.md`

## Files Affected

- `src/prompts/finalize-goal.md` — new file: system prompt for Finalize Goal Agent

## Acceptance Criteria

- [ ] `src/prompts/finalize-goal.md` exists and is non-empty
- [ ] Prompt instructs the agent to load the pio-project-knowledge skill for PROJECT file knowledge
- [ ] Prompt instructs the agent to read PLAN.md from the goal workspace
- [ ] Prompt instructs the agent to read per-step SUMMARY.md files (S01/SUMMARY.md, S02/SUMMARY.md, etc.)
- [ ] Prompt covers the full workflow: read DECISIONS.md + PLAN.md + SUMMARY.md → evaluate against update rules → read PROJECT files → write updates → produce summary
- [ ] Prompt instructs the agent to skip decisions that don't map to any update rule
- [ ] Prompt instructs the agent to produce a summary output (files modified, changes made, triggering decisions; explicit statement if no updates needed)
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Prompt too verbose:** The project-context.md prompt is ~600 lines. Keep finalize-goal.md concise — it's simpler (evaluation + writing, not deep research). Target ~200-300 lines.
- **Re-encoding update rules:** Do not duplicate the pio-project-knowledge skill content inline. This would create drift and violate the single-source-of-truth decision from Step 1.
- **Missing graceful handling:** The prompt should handle cases where DECISIONS.md is empty, has no relevant decisions, or a PROJECT file doesn't exist yet.
