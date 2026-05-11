# Agent misinterprets "run /pio-next-task" in tool descriptions as an instruction to auto-start sub-sessions

# Agent auto-starts queued pio tasks via bash instead of letting user control them

## Problem

When the agent calls `pio_goal_from_issue` (or similar tools like `pio_create_goal`, `pio_create_plan`, etc.), the tool description includes the phrase **"Queues the task — run /pio-next-task to start it."** The agent interprets this as an instruction *for itself* to execute, and attempts to launch the sub-session via bash:

```bash
pi pio-next-task 2>&1 || true
```

This command aborts or fails because `/pio-next-task` is a pi TUI command meant for interactive use — not something the agent should auto-execute after queuing.

## Root cause

Tool descriptions in `src/index.ts` contain phrasing that reads like an imperative instruction:

- `pio_goal_from_issue`: `"Create a new goal workspace under .pio/goals/<name> and queue a session with the create-goal system prompt. Use this tool directly — no bash commands or manual file creation needed. Run /pio-next-task to start it."`
- `pio_create_goal`: `"Run /pio-next-task to start it."`
- `pio_create_plan`, `pio_evolve_plan`, etc.: Same pattern.

The phrase **"Run /pio-next-task to start it"** is intended for the human user reading the description — informing them how to proceed after the agent queues a task. But the agent reads it as an instruction directed at itself.

## Impact

- The agent wastes time making failed bash calls
- Confuses the user with error output from aborted commands
- Undermines the explicit separation between queuing (agent-controlled) and launching (user-controlled)

## Suggested fix

Reword tool descriptions to make it clear the phrase is a note for the human, not an instruction for the agent. For example:

> "Queues the task. The user can run `/pio-next-task` to start the sub-session."

Or frame it as informational rather than imperative:

> "Queues the task — use `/pio-next-task` to start the queued sub-session."

Additionally, the `SKILL.md` could add an explicit guideline: **Never auto-start queued tasks. After calling a `pio_*` tool that queues work, report completion and wait for the user to run `/pio-next-task`.**

## Category

bug

## Context

Observed after calling `pio_goal_from_issue(name: "fix-goal-from-issue-directory-name", issuePath: "goal-from-issue-wrong-directory-name.md")`. The tool queued the task successfully, but the agent then attempted `pi pio-next-task` from bash, which was aborted. Tool descriptions in `src/index.ts` for `pio_goal_from_issue`, `pio_create_goal`, `pio_create_plan`, `pio_evolve_plan`, `pio_execute_task`, and `pio_review_code` all contain "Run /pio-next-task to start it."
