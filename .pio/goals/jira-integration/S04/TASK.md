---
skills:
  mandatory:
    - pio-git
---

# Task: Cleanup Superseded Code and Verify

Delete the TypeScript capability code from Steps 1–2 and restore `src/index.ts`, completing the architectural pivot to a skill-only Jira integration.

## Context

The original plan built typed TypeScript capabilities (`jira-utils`, `jira-to-issue`) for Jira integration. During planning, it was determined that agents already have everything needed via `bash` + existing tools (`pio_create_issue`). A skill (`src/skills/pio-jira/SKILL.md`, created in Step 3) is the right abstraction. Steps 1–2 code must now be deleted to complete this pivot.

## What to Build

This is a cleanup step — no new code to write. Delete four files and remove two lines from `src/index.ts`, then verify the project builds and tests cleanly.

### Code Components

#### Files to Delete (4 files)

- `src/jira-utils.ts` — shared acli utilities created in Step 1
- `src/jira-utils.test.ts` — tests for jira-utils created in Step 1
- `src/capabilities/jira-to-issue.ts` — jira-to-issue capability created in Step 2
- `src/capabilities/jira-to-issue.test.ts` — tests for jira-to-issue created in Step 2

#### Files to Modify (1 file)

- **`src/index.ts`** — remove exactly two lines:
  - Line 24: `import { setupJiraToIssue } from "./capabilities/jira-to-issue";`
  - Line 87: `setupJiraToIssue(pi);`

After removal, verify no other references to `setupJiraToIssue`, `jira-to-issue`, or `jira-utils` remain in any source file.

### Approach and Decisions

From DECISIONS.md: The only Jira-related artifact remaining should be `src/skills/pio-jira/SKILL.md`. The `createIssue` export on `src/capabilities/create-issue.ts` (made public in Step 2) can remain — it's used internally within the file and no remaining external code imports it.

- Use `rm` or equivalent to delete files (not git rm — let pio-git handle staging/committing after verification).
- Edit `src/index.ts` to remove the two lines, preserving surrounding imports and calls in order.
- Run `npm run check` and `npm test` to verify no regressions.

## Skills

The mandatory `pio-git` skill is needed for committing the cleanup changes (file deletions + index.ts edit) following project conventions. No additional skills recommended beyond the mandatory `pio` and `pio-git` skills.

## Dependencies

- Step 3 (Create the pio-jira Skill) — must be completed first. The skill at `src/skills/pio-jira/SKILL.md` must exist before cleanup begins.

## Files Affected

- `src/jira-utils.ts` — delete
- `src/jira-utils.test.ts` — delete
- `src/capabilities/jira-to-issue.ts` — delete
- `src/capabilities/jira-to-issue.test.ts` — delete
- `src/index.ts` — remove `setupJiraToIssue` import (line 24) and call (line 87)

## Acceptance Criteria

- [ ] `src/jira-utils.ts` does not exist (deleted)
- [ ] `src/jira-utils.test.ts` does not exist (deleted)
- [ ] `src/capabilities/jira-to-issue.ts` does not exist (deleted)
- [ ] `src/capabilities/jira-to-issue.test.ts` does not exist (deleted)
- [ ] `src/index.ts` no longer imports `setupJiraToIssue` from `"./capabilities/jira-to-issue"`
- [ ] `src/index.ts` no longer calls `setupJiraToIssue(pi)`
- [ ] No references to `jira-to-issue` or `jira-utils` remain in any `.ts` file under `src/` (excluding goal workspace docs)
- [ ] `npm run check` (tsc --noEmit) exits with code 0 — no dangling imports or type errors
- [ ] `npm test` passes with no regressions (deleted test files are auto-excluded by vitest's `src/**/*.test.ts` glob)
- [ ] `src/skills/pio-jira/SKILL.md` still exists (not accidentally deleted during cleanup)

## Risks and Edge Cases

- **Accidental deletion of the skill:** Ensure `src/skills/pio-jira/SKILL.md` and `src/skills/pio-jira/REFERENCE.md` are NOT deleted — they are the sole Jira artifacts.
- **Dangling references in other files:** Check for any imports of `jira-utils` or `jira-to-issue` beyond the known files (mainly `src/index.ts` and the test files themselves). The grep research confirmed no external consumers exist.
- **Vitest cache:** Deleted test files should be auto-excluded since vitest discovers tests via glob. If stale test results appear, a clean test run should resolve it.
- **`createIssue` export in `create-issue.ts`:** This was made public in Step 2 for reuse by jira-to-issue. No remaining code imports it externally. Leaving the export is harmless — do not revert unless explicitly required.
