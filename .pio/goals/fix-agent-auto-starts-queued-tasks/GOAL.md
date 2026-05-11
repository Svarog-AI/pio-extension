# Fix agent auto-starting queued tasks from tool descriptions

Reword tool descriptions and response messages so agents no longer misinterpret "Run /pio-next-task to start it" as an instruction for themselves. Add an explicit guideline in `SKILL.md` prohibiting agents from auto-starting queued sub-sessions.

## Current State

Seven capability files register tools with descriptions containing imperative phrasing that reads like an instruction directed at the agent:

- **Tool descriptions** — The `description:` field of these 6 tools ends with "Run /pio-next-task to start it." or "Queues the task — run /pio-next-task to start it.":
  - `src/capabilities/create-goal.ts` (line 47)
  - `src/capabilities/goal-from-issue.ts` (line 42)
  - `src/capabilities/create-plan.ts` (line 60)
  - `src/capabilities/evolve-plan.ts` (line 113)
  - `src/capabilities/execute-task.ts` (line 212)
  - `src/capabilities/review-code.ts` (line 240)

- **Response messages** — After successfully queuing a task, 6 capability files return text responses telling the caller to "run /pio-next-task":
  - `src/capabilities/create-goal.ts` (line 66)
  - `src/capabilities/goal-from-issue.ts` (line 64)
  - `src/capabilities/create-plan.ts` (line 78)
  - `src/capabilities/evolve-plan.ts` (line 135)
  - `src/capabilities/execute-task.ts` (line 237)
  - `src/capabilities/review-code.ts` (line 265)

- **Validation notification** — `src/capabilities/validation.ts` (line 143) appends "Run /pio-next-task to start it." to the `pio_mark_complete` success notification.

- **SKILL.md** (`src/skills/pio/SKILL.md`) contains agent guidelines about using `pio_*` tools directly and avoiding bash workarounds, but does not explicitly tell agents never to auto-start queued tasks after calling a queuing tool.

When an agent calls e.g. `pio_create_goal`, it sees the description phrase "Run /pio-next-task to start it" as a directive aimed at itself, and attempts to execute `pi pio-next-task` from bash — which fails because `/pio-next-task` is a TUI command for interactive human use, not something agents should invoke programmatically.

## To-Be State

All tool descriptions and response messages are reworded so the phrase "run /pio-next-task" is clearly informational (directed at the human reader) rather than imperative (an instruction for the agent).

**Tool descriptions:** Change from imperative to declarative. For example:
- Before: `"Run /pio-next-task to start it."`
- After: `"The user can run `/pio-next-task` to start the sub-session."`

Apply this pattern consistently across all 6 tool descriptions listed above.

**Response messages:** Change from imperative to declarative. For example:
- Before: `"Task queued — run /pio-next-task to start it."`
- After: `"Task queued. Use `/pio-next-task` to start the sub-session."`

Apply this pattern across all 6 response messages listed above plus the validation notification in `validation.ts`.

**SKILL.md:** Add an explicit guideline under the "Agent Usage Guidelines" section (or as a new subsection): **Never auto-start queued tasks. After calling a `pio_*` tool that queues work, report completion and wait for the user to run `/pio-next-task`.** This gives agents an unambiguous rule overriding any ambiguous phrasing they might encounter elsewhere.

Files changed:
- `src/capabilities/create-goal.ts` — description + response
- `src/capabilities/goal-from-issue.ts` — description + response
- `src/capabilities/create-plan.ts` — description + response
- `src/capabilities/evolve-plan.ts` — description + response
- `src/capabilities/execute-task.ts` — description + response
- `src/capabilities/review-code.ts` — description + response
- `src/capabilities/validation.ts` — notification message
- `src/skills/pio/SKILL.md` — new agent guideline
