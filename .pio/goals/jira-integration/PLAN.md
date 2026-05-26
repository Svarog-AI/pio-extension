---
totalSteps: 5
steps:
  - name: jira-utils
    complexity: task
  - name: jira-to-issue
    complexity: task
  - name: pio-jira-skill
    complexity: task
  - name: cleanup-and-verify
    complexity: task
  - name: document-jira-to-goal-workflow
    complexity: task
---

# Plan: Jira Integration via Atlassian CLI (acli)

Document the "Jira → local issue → goal" workflow in the `pio-jira` skill by adding `pio_goal_from_issue` cross-link documentation to SKILL.md and REFERENCE.md.

## Prerequisites

- `npm run check` passes with no errors
- `npm test` passes with no regressions

## Steps

### Step 1: Jira Utilities Module [COMPLETED]

**Description:** Created `src/jira-utils.ts` with shared `acli` utilities (`runAcli`, `readJiraConfig`, `jiraKeyToSlug`) and tests. This code was later superseded by the skill-only approach and deleted in Step 4.

**Status:** COMPLETED — implementation approved, do not modify.

### Step 2: jira-to-issue Capability [COMPLETED]

**Description:** Created `src/capabilities/jira-to-issue.ts` with the `pio_jira_to_issue` tool and `/pio-jira-to-issue` command, plus tests. Exported `createIssue` from `create-issue.ts`. Wired into `src/index.ts`. This code was later superseded by the skill-only approach and deleted in Step 4.

**Status:** COMPLETED — implementation approved, do not modify.

### Step 3: Create the pio-jira Skill [COMPLETED]

**Description:** Created `src/skills/pio-jira/SKILL.md` (64 lines) and `src/skills/pio-jira/REFERENCE.md` covering all five operation areas: auth status check, pull Jira → local issue, push local issue → Jira, search with JQL, and error handling. Followed pio-git skill format with progressive disclosure via REFERENCE.md.

**Status:** COMPLETED — implementation approved, do not modify.

### Step 4: Cleanup Superseded Code and Verify [COMPLETED]

**Description:** Deleted the TypeScript capability code from Steps 1–2 (`src/jira-utils.ts`, `src/jira-utils.test.ts`, `src/capabilities/jira-to-issue.ts`, `src/capabilities/jira-to-issue.test.ts`). Restored `src/index.ts` by removing the `setupJiraToIssue` import and call. Verified clean build and tests.

**Status:** COMPLETED — implementation approved, do not modify.

### Step 5: Document Jira-to-Goal Workflow

**Description:**

Update `src/skills/pio-jira/SKILL.md` and `src/skills/pio-jira/REFERENCE.md` to document the "Jira → local issue → goal" workflow. After pulling a Jira ticket into a local issue via `pio_create_issue`, agents can immediately create a goal from it using `pio_goal_from_issue <slug>`. This is the most common "Jira → code" workflow and should be explicitly documented as the natural next step.

Changes to SKILL.md:
- After the "Pull Jira → Local Issue" section, add a new section titled "Goal Creation from Pulled Issue" (or similar) explaining that `pio_goal_from_issue <slug>` converts the local issue into a goal workspace, launching the Goal Definition Assistant. Briefly describe what this enables: turning a Jira ticket into a full pio goal with its own plan, steps, and implementation lifecycle.
- Keep SKILL.md under 100 lines total (currently 64 lines — budget ~20 lines for new content, trimming elsewhere if needed).

Changes to REFERENCE.md:
- Add an execution section covering the workflow: after `pio_create_issue` creates `.pio/issues/jira-proj-123.md`, call `pio_goal_from_issue jira-proj-123` to spawn a child goal workspace. Show example commands and expected outcomes.
- Note that the derived goal name comes from the issue slug (e.g., `jira-proj-123`).
- Add an edge case entry for what happens when a goal with that name already exists.

Follow existing skill conventions: YAML frontmatter, progressive disclosure, consistent formatting with other sections. Reference the `pio` skill (`src/skills/pio/SKILL.md`) for accurate descriptions of `pio_goal_from_issue` behavior — it converts an issue into a structured goal workspace and queues a create-goal session.

**Acceptance criteria:**
- [ ] `npm run check` reports no errors
- [ ] `npm test` passes with no regressions
- [ ] SKILL.md contains a section describing the "Jira → local issue → goal" workflow after pulling a ticket
- [ ] SKILL.md mentions `pio_goal_from_issue` as the next step after `pio_create_issue`
- [ ] REFERENCE.md contains an execution section with example commands for the goal-from-issue workflow
- [ ] SKILL.md remains under 100 lines total
- [ ] New content follows existing formatting conventions (consistent headings, markdown structure)

**Files affected:**
- `src/skills/pio-jira/SKILL.md` — add "Goal Creation from Pulled Issue" section after "Pull Jira → Local Issue"
- `src/skills/pio-jira/REFERENCE.md` — add execution section for the goal-from-issue workflow and edge case entry

## Notes

- **Skill-only approach confirmed:** The architectural pivot to a skill-only approach (no TypeScript capabilities) was completed in Steps 1–4. This step only adds documentation to existing skill files.
- **Referencing pio_goal_from_issue behavior:** Read `src/skills/pio/SKILL.md` or `src/capabilities/goal-from-issue.ts` for accurate descriptions of what the tool does — it converts an existing issue into a structured goal workspace by queuing a create-goal session.
- **No code changes:** This step modifies only markdown files under `src/skills/`. No TypeScript, no tests needed.
- **SKILL.md line budget:** Currently 64 lines with a 100-line limit. Trim any verbose existing content if necessary to stay within bounds after adding the new section.
