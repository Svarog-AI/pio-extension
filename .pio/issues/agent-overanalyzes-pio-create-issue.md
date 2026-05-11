# Agent overanalyzes when calling pio_create_issue — should be a quick, minimal capture

When asked to create an issue (e.g., after encountering an error), the agent spends excessive time reading files, tracing code paths, and writing detailed root-cause analysis before calling `pio_create_issue`. 

`pio_create_issue` should be a fast, lightweight capture — just enough context for `create-goal` to pick up, interview, and turn into a structured GOAL.md. The deep analysis happens later in the goal/planning/execution workflow, not at issue-creation time.

The agent needs instructions/guidance to keep issue creation brief: title + short description + relevant file references (if obvious). No code tracing, no root-cause investigation, no fix proposals.

## Category

improvement
