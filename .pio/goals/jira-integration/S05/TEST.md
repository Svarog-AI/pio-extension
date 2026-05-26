# Tests: Jira-to-Goal Workflow Documentation

This verifies that SKILL.md and REFERENCE.md correctly document the "Jira → local issue → goal" workflow, including the `pio_goal_from_issue` tool as the natural next step after pulling a ticket.

## Unit Tests

No unit tests apply — this step modifies only markdown documentation files. Per TDD conventions, content-based tests for documentation are not written as unit tests since they break on rewording without indicating behavioral regressions.

## Programmatic Verification

Given the TypeScript project when `npm run check` is run then it exits with code 0.
Given the test suite when `npm test` is run then all tests pass with no regressions.
Given SKILL.md when searched for `pio_goal_from_issue` then the tool is mentioned as the next step after `pio_create_issue`.
Given SKILL.md when searched for a "Goal Creation" or "goal" section after "Pull Jira" then a dedicated section describing the workflow exists.
Given SKILL.md when `wc -l` is run then the line count is under 100.
Given REFERENCE.md when searched for `pio_goal_from_issue` then an execution section with example commands exists.
Given REFERENCE.md when searched for "already exists" or "Goal workspace already exists" then the edge case for existing goal workspaces is documented.
Given SKILL.md when checked for heading consistency then new sections use the same heading level as existing sections (##).
Given the `pio_goal_from_issue` description in SKILL.md when compared to `src/capabilities/goal-from-issue.ts` then behavior is accurately described (derives goal name from issue slug, queues create-goal session, user runs `/pio-next-task`).
