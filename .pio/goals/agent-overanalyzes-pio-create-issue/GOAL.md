# Prevent over-analysis when creating issues with pio_create_issue

When agents call `pio_create_issue`, they should perform a fast, lightweight capture — title, short description, and relevant file references (if obvious). The tool description should explicitly instruct agents to skip deep analysis at issue-creation time. Root-cause investigation and detailed analysis belong in the later goal/planning/execution workflow, not when filing the initial issue.

## Current State

`pio_create_issue` is registered as a direct tool in `src/capabilities/create-issue.ts`. It does **not** launch a sub-session — there is no prompt injection point like the capability-driven tools (`create-goal`, `create-plan`, etc.) that use `launchCapability()` from `session-capability.ts`.

The current tool description is minimal and provides no behavioral guidance:

> "Create a new issue as a markdown file under .pio/issues/. Use this tool directly — no bash commands or manual file creation needed."

This tells agents *how* to call the tool but not *what level of effort* to invest before calling it. With no instruction, agents default to their general research behavior: reading files, tracing code paths, and writing detailed root-cause analysis before invoking `pio_create_issue`. This is wasteful because the issue creation step is meant only as a quick capture — the real analysis happens later when `goal-from-issue` converts the issue into a structured goal (via the Goal Definition Assistant in `src/prompts/create-goal.md`).

There is no `AGENTS.md` at the project root with general conventions for agent behavior.

## To-Be State

The `pio_create_issue` tool description in `src/capabilities/create-issue.ts` is enhanced to include explicit behavioral guidance. The updated description should communicate:

1. **Issue creation is a quick capture, not an investigation.** Agents should skip code tracing, root-cause analysis, and fix proposals at issue-creation time.
2. **Minimum viable content:** Title + short description + relevant file references (if immediately obvious from the error or context).
3. **Deep analysis happens later.** The goal/planning workflow (`goal-from-issue` → Goal Definition Assistant) is where detailed research and structured GOAL.md authoring occur.
4. **Keep it brief.** If more than 1-2 reads would be needed to understand the issue, create the issue with what's known and let the goal workflow handle the rest.

The scope of this change is limited to the tool description string in `createIssueTool` within `src/capabilities/create-issue.ts`. No new files, no prompts, no AGENTS.md — just a clearer description that shapes agent behavior through the tool metadata they read before calling it.
