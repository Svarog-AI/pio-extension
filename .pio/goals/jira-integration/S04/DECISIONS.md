# Decisions (carried from Steps 1–3)

## Context

Steps 1–2 built TypeScript capability code that is superseded by the skill-only approach. Step 3 created the `pio-jira` skill. This step (Step 4) is the final cleanup — no downstream steps remain.

## Key Decisions

- **Skill-only architecture:** All Jira operations are handled via agents running `acli` through `bash`, guided by `src/skills/pio-jira/SKILL.md`. No TypeScript capability code for Jira should remain.
- **Superseded files to delete:** `src/jira-utils.ts`, `src/jira-utils.test.ts`, `src/capabilities/jira-to-issue.ts`, `src/capabilities/jira-to-issue.test.ts` — all created in Steps 1–2, now obsolete.
- **Index restoration:** Remove `setupJiraToIssue` import and call from `src/index.ts`. The only Jira-related artifact is the skill from Step 3.
- **`createIssue` export:** `src/capabilities/create-issue.ts` exports `createIssue` (made public in Step 2). No remaining code imports it externally — leaving the export is harmless and within scope to leave as-is.
