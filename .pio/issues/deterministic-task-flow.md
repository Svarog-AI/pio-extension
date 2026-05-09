# Deterministic task flow: auto-enqueue next task on completion

`/pio-next-task` is currently a manual step — the agent or user has to call it after each session completes. This introduces non-determinism (agent might forget, might call wrong task, etc.) and unnecessary friction.

The flow should be: when `pio_mark_complete` succeeds for a capability, the *next* task is automatically enqueued.

**The core problem:** a single capability can have multiple valid next steps. For example, after `create-goal` completes, the next step could be:
- `create-plan` (happy path)
- `revise-goal` (if the goal needs work — not yet built but conceptually valid)

So each capability has a hardcoded list of *possible* next tasks, but the system needs a way to decide which one to actually enqueue. This is the open question for planning.

Possible approaches:
- Default/happy path: most capabilities have one obvious next step; use that unless told otherwise
- Agent-guided: the agent calling `pio_mark_complete` can optionally specify which next capability it wants
- Conditional rules: each capability declares conditions under which each next step applies (e.g., "if PLAN.md exists → evolve-plan, else → create-plan")
- Explicit user choice via UI prompt when multiple options exist

This is worth discussing before implementation.

## Category

improvement

## Context

Relevant files: src/capabilities/validation.ts (pio_mark_complete), src/utils.ts (enqueueTask), all session capabilities that use task queuing
Current flow: session completes → agent calls /pio-next-task → reads queue → launches sub-session. Target: session completes → pio_mark_complete auto-enqueues the next task.
