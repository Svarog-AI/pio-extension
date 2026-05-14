# Add goal-from-jira tool/command to create a pio goal from a Jira issue

# Add a `goal-from-jira` tool and command

Introduce a new capability — `goal-from-jira` — that takes a Jira issue key (e.g. `PROJ-123`) and creates a structured pio goal workspace from it. This bridges Jira issue tracking with the pio goal-driven workflow.

## Motivation

Teams using Jira need to translate issue descriptions into pio goals manually today. A dedicated tool eliminates this friction: given a Jira key, fetch the issue data (summary, description, labels, story points, etc.) and seed a `GOAL.md` with the relevant content. The user or agent can then refine it through the normal goal-definition workflow.

## What it does

- A new tool `pio_goal_from_jira` (callable by agents) and command `/pio-goal-from-jira <issue-key>` (callable by users).
- Fetches issue metadata from Jira via a CLI tool (see Open Questions below).
- Creates `.pio/goals/<derived-name>/GOAL.md` pre-populated with the Jira issue content.
- Optionally enqueues a `create-goal` sub-session so the Goal Definition Assistant can refine the draft.

## Files to create/modify

- **New:** `src/capabilities/goal-from-jira.ts` — capability implementation, tool/command registration
- **Modify:** `src/index.ts` — wire up the new capability
- **Modify:** `.pio/` configuration or docs — document Jira CLI requirements, authentication setup

## Open questions

- **Which Jira CLI to use?** Need to investigate available options:
  - [`@jupiterio/jira-cli`](https://www.npmjs.com/package/@jupiterio/jira-cli) — npm-based Jira CLI
  - [`jq`](https://github.com/jkubersky/jq) — lightweight Go-based Jira CLI
  - [`jira`](https://github.com/ankitpokhrel/jira-cli) — another Go-based option
  - Raw `curl` against the Jira REST API (no extra dependency, but requires auth setup)
  - Decision needed: evaluate ease of installation, output format (JSON?), auth handling, and whether it fits as a soft dependency or hard requirement.
- Should the goal name be auto-derived from the issue key (`PROJ-123` → `proj-123`) or allow override?
- Do we fetch just the issue, or also sub-tasks, comments, linked issues?
- Authentication: expect the CLI to be pre-configured (e.g. via its own config file), or pass credentials as parameters?

## Category

feature

## Context

Relevant files:
- `src/capabilities/create-goal.ts` — reference for how goals are created, tool/command pattern to follow
- `src/capabilities/goal-from-issue.md` (if it exists in `.pio/issues/`) — analogous local-issue-to-goal workflow
- `src/index.ts` — extension entry point wiring
- `src/utils.ts` — shared utilities (`resolveGoalDir`, `goalExists`)
