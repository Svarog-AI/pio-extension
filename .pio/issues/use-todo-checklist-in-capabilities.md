# Capabilities should use the todo checklist tool to avoid infinite loops as context grows

## Problem

As agent sessions progress, conversation context grows — tool calls, file contents, intermediate outputs all accumulate. Without an explicit tracking mechanism, agents can lose sight of what remains to be done. This leads to:

1. **Infinite refinement loops:** The agent revisits completed work instead of moving forward, because it no longer remembers which sub-tasks are done.
2. **Missing deliverables:** The agent ships incomplete output because it forgot a required file or section buried earlier in the conversation.
3. **Context bloat:** Without a compact progress tracker, the agent re-reads the full task description every turn instead of glancing at a checklist.

The `todo` tool already exists and provides exactly this: a structured checklist (`list`, `add`, `toggle`, `clear`) that persists across turns regardless of context window size.

## Proposed solution

Integrate the todo checklist into capability workflow prompts so agents track sub-tasks explicitly:

1. **At session start:** The agent creates a todo list from task requirements (e.g., "write GOAL.md", "write PLAN.md sections", "create TASK.md + TEST.md for step 1").
2. **During work:** After completing each sub-task, the agent toggles it done. New todos are added if scope evolves.
3. **Before completion:** The agent checks `todo list` — all items must be toggled before calling `pio_mark_complete`.

This gives the agent a compact progress signal that survives context window pressure: even when early conversation turns fall off, the todo list state remains accessible via one tool call.

## Implementation options

- **Prompt-based (low effort):** Add explicit instructions to each capability prompt (`create-goal.md`, `create-plan.md`, `evolve-plan.md`, `execute-plan.md`):
  - "Use the `todo` tool at the start of your session to track sub-tasks."
  - "Toggle items as you complete them. Review the list before calling `pio_mark_complete`."
- **Enforced (higher effort):** Add a validation rule in `validation.ts` that checks todos are cleared before allowing completion. Risk: agents might create todos but forget to clear, causing false blocks.
- **Both:** Prompt guidance as default + optional enforcement flag per capability.

## Scope

Apply to all capabilities that produce multi-file or multi-step output:

| Capability | Benefits |
|---|---|
| `create-goal` | Track sections: problem statement, success criteria, scope boundaries |
| `create-plan` | Track steps: analysis, step decomposition, dependencies, risks |
| `evolve-plan` | Track per step: TASK.md, TEST.md, acceptance criteria |
| `execute-plan` | Track per step: test writing, implementation, verification |
| `project-context` | Track file categories: config, structure, conventions, build |

## Category

improvement

## Context

Related to issue `detect-agent-refinement-loops.md` (symptom) — this tackles the root cause: lack of explicit progress tracking. The `todo` tool is available since early in agent sessions; the gap is that capability prompts don't instruct agents to use it.

## Category

improvement
