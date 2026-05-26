---
skills:
  mandatory:
    - pio
    - write-a-skill
---

# Task: Document Jira-to-Goal Workflow

Add "Jira → local issue → goal" workflow documentation to `src/skills/pio-jira/SKILL.md` and `REFERENCE.md`.

## Context

The `pio-jira` skill documents how agents use `acli` for Jira operations. Currently it covers pulling tickets into local issues (`pio_create_issue`) and pushing local issues to Jira. However, the most common "Jira → code" workflow continues: after pulling a ticket into `.pio/issues/`, the agent creates a goal from it via `pio_goal_from_issue <slug>`. This natural next step is undocumented.

## What to Build

Update two markdown files to document the end-to-end workflow: Jira ticket → local issue → pio goal workspace.

### Changes to SKILL.md

After the "Pull Jira → Local Issue" section (before "Push Local Issue → Jira"), insert a new section titled "Goal Creation from Pulled Issue":

- Explain that after pulling a Jira ticket into a local issue, use `pio_goal_from_issue <slug>` to convert it into a structured goal workspace
- Describe what this enables: the Goal Definition Assistant interviews about the feature, produces `GOAL.md`, which feeds into planning and implementation
- Mention the tool takes an issue identifier (slug or filename) and derives the goal name from the issue slug
- Note that the user runs `/pio-next-task` to start the session
- Keep SKILL.md under 100 lines total (currently 64 lines — budget ~36 lines for new content, trim existing verbose prose if needed)

### Changes to REFERENCE.md

Add a new execution section (after "Pull Jira → Local Issue — Execution") covering:

1. **Goal from Pulled Issue — Execution**: show the command sequence after `pio_create_issue` creates `.pio/issues/jira-proj-123.md`:
   - Call `pio_goal_from_issue jira-proj-123` (or `/pio-goal-from-issue jira-proj-123`)
   - This queues a create-goal session; user runs `/pio-next-task` to start it
   - Show expected outcome: goal workspace created at `.pio/goals/jira-proj-123/` with the issue content as initial context

2. **Edge case entry** in the existing "Pull Jira → Local Issue" edge case table (or a new subsection):
   - Goal workspace already exists for that name → `pio_goal_from_issue` returns error: "Goal workspace already exists at ..." — agent should advise using a different slug or deleting the existing goal first

## Skills

- **write-a-skill**: Ensures the documentation follows skill conventions (YAML frontmatter, progressive disclosure, consistent formatting). Reference `src/skills/write-a-skill/SKILL.md` for structure guidance.
- **pio** (mandatory): Provides context on `pio_goal_from_issue` behavior — it converts an issue into a structured goal workspace by queuing a create-goal session. The goal name is derived from the issue slug.

## Dependencies

- Step 3: `src/skills/pio-jira/SKILL.md` and `REFERENCE.md` must exist (created in Step 3, not modified since).
- Step 4: Superseded TypeScript code must be cleaned up (completed). No new capability code is needed for this step.

## Files Affected

- `src/skills/pio-jira/SKILL.md` — add "Goal Creation from Pulled Issue" section after "Pull Jira → Local Issue"
- `src/skills/pio-jira/REFERENCE.md` — add execution section for the goal-from-issue workflow and edge case entry

## Acceptance Criteria

- [ ] `npm run check` reports no errors (no TypeScript changes, but verify clean state)
- [ ] `npm test` passes with no regressions
- [ ] SKILL.md contains a section describing the "Jira → local issue → goal" workflow after pulling a ticket
- [ ] SKILL.md mentions `pio_goal_from_issue` as the next step after `pio_create_issue`
- [ ] REFERENCE.md contains an execution section with example commands for the goal-from-issue workflow
- [ ] REFERENCE.md documents the edge case: what happens when a goal with that name already exists
- [ ] SKILL.md remains under 100 lines total (verify with `wc -l`)
- [ ] New content follows existing formatting conventions (consistent heading levels, markdown structure)
- [ ] Description of `pio_goal_from_issue` behavior is accurate: derives goal name from issue slug, queues create-goal session, user runs `/pio-next-task` to start

## Risks and Edge Cases

- **SKILL.md line budget:** Adding a new section (estimated 15–20 lines) plus the existing 64 lines should stay under 100. If trimming is needed, target verbose prose in the Overview or Auth sections — not the execution protocols.
- **Accuracy of tool description:** Read `src/capabilities/goal-from-issue.ts` to verify exact behavior (goal name derivation, error messages, session queuing). Do not guess.
- **No code changes:** This step modifies only markdown files. Verify that no imports or TypeScript references are affected.
