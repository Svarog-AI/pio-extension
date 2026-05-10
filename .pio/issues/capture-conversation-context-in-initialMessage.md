# Capture conversation context in initialMessage when enqueuing sub-session tasks

# Capture conversation context in `initialMessage` when enqueuing sub-session tasks

When pio tool calls enqueue new sub-sessions (via `enqueueTask`), the `initialMessage` sent to the new session is often a generic template string with no information about *why* the sub-session was requested or what specific problem it should solve. This forces the sub-session agent to re-discover context by reading files from scratch instead of understanding the intent behind the task.

## Current state

Looking at all places that call `enqueueTask` or resolve capability config:

| Capability | Passes `initialMessage`? | Default message quality |
|---|---|---|
| **create-goal (tool)** | Only if caller provides it explicitly | `"Created goal workspace at ${goalDir}"` — generic |
| **create-plan (tool)** | Never | `"Goal workspace is at ${goalDir}. GOAL.md exists..."` — generic |
| **evolve-plan (tool)** | Never | Step-specific but no conversation context |
| **execute-task (tool)** | Never | Step-specific but no conversation context |
| **project-context (tool)** | Never | `"Please explore this project..."` — generic |
| **goal-from-issue (tool/command)** | Yes, references issue file | Better than others — at least names the source artifact |
| **validation auto-transition** | Never | Enqueues next capability with only `goalName`, no message |

Command handlers (non-tool paths) that call `launchCapability` directly also never pass `initialMessage`, relying entirely on `defaultInitialMessage`.

## The problem

When an agent calls `pio_create_goal("fix-login-bug")` because the user said "Create a goal to fix the login bug where users get stuck in an infinite redirect", the sub-session receives `"Created goal workspace at /path"` — losing all the rich context about what specific problem to solve. The sub-session agent then has to read GOAL.md (which doesn't exist yet) or guess what to write.

Even worse: after a `pio_mark_complete` auto-transition, the next capability is enqueued with zero context — just `{ goalName }`. The new session has no idea whether the previous step completed successfully, encountered edge cases, or left follow-up items.

## Proposed approach

There are two complementary fixes needed:

### 1. Tool callers should pass conversation context as `initialMessage`

When the LLM agent calls a pio tool, it has the full conversation context. The tool's `execute` function should be able to capture this and pass it through. Options:
- Add a `context` parameter to each tool that the caller is expected to fill (prompt the agent to do this in capability prompts)
- Automatically capture the last user message or recent conversation summary from the calling session

### 2. Auto-transitions should propagate completion context

When `pio_mark_complete` enqueues the next capability, it should include context about what was just completed — e.g., files that were produced, decisions made, edge cases encountered. This could come from reading the output files (GOAL.md, PLAN.md, SUMMARY.md) and summarizing relevant parts.

### 3. `defaultInitialMessage` should read source files for context

As a fallback, `defaultInitialMessage` functions should include excerpts from relevant files:
- **create-plan:** Include the contents of GOAL.md (scope is typically small enough)
- **evolve-plan:** Include the relevant step description from PLAN.md
- **execute-task:** Already reads TASK.md/TEST.md paths, but could summarize constraints

## Scope

This affects all session-launching code paths:
- Tool `execute` handlers that call `enqueueTask`
- Command handlers that call `launchCapability` directly  
- The auto-transition in `validation.ts` (`pio_mark_complete`)
- All `defaultInitialMessage` implementations

## Open questions

- Should there be a maximum length for `initialMessage` to avoid bloating sub-session context?
- Is automatic conversation summarization feasible, or should this rely on the calling agent explicitly providing context?
- Should `defaultInitialMessage` read file contents inline, or should reading happen at session start in `session-capability.ts` and be injected separately?
- How do we ensure consistency — e.g., a convention/prompt rule that tells agents to always include relevant context when calling pio tools?

## Category

improvement

## Context

Relevant files:
- `src/capabilities/session-capability.ts` — `launchCapability` sends `config.initialMessage` as user message
- `src/utils.ts` — `resolveCapabilityConfig` derives `initialMessage` from params or `defaultInitialMessage`
- `src/types.ts` — `StaticCapabilityConfig.defaultInitialMessage` signature, `CapabilityConfig.initialMessage`
- `src/capabilities/create-goal.ts` — only tool that accepts explicit `initialMessage` param
- `src/capabilities/goal-from-issue.ts` — passes context referencing the issue file
- `src/capabilities/validation.ts` — auto-transition enqueues next capability without any message
- All other capability files: `create-plan.ts`, `evolve-plan.ts`, `execute-task.ts`, `project-context.ts`, `execute-plan.ts`


## Category

improvement
