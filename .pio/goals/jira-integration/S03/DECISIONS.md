# Decisions (carried from Steps 1–2)

## Context

Steps 1 and 2 built TypeScript capability code (`src/jira-utils.ts`, `src/capabilities/jira-to-issue.ts`) that is now superseded by the skill-only approach. All such code will be deleted in Step 4. The only Jira-related artifact remaining after this goal is `src/skills/pio-jira/SKILL.md` from Step 3.

## Downstream-Relevant Notes

- **Step 4 cleanup:** Agents should not import or reference `jira-utils` or `jira-to-issue` modules — these files are scheduled for deletion.
- **Auth error string:** Confirmed in GOAL.md that the unauthenticated error contains `"unauthorized: use 'acli jira auth login' to authenticate"`. Skill should instruct agents to check stderr/output for "unauthorized".
- **Slug derivation:** Jira keys map to slug `jira-<project>-<number>` (lowercase, hyphenated). The skill should document this convention.
