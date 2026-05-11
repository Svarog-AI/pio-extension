# Plan: Fix agent auto-starting queued tasks from tool descriptions

Reword tool descriptions, response messages, and SKILL.md so agents no longer misinterpret "Run /pio-next-task to start it" as a directive aimed at themselves.

## Prerequisites

None.

## Steps

### Step 1: Reword tool descriptions (imperative → declarative)

**Description:** Update the `description` field of 6 registered tools so phrases like "Run /pio-next-task to start it" are reworded to clearly informational language directed at the human reader. The pattern is:
- `"Run /pio-next-task to start it."` → `"The user can run `/pio-next-task` to start the sub-session."`
- `"Queues the task — run /pio-next-task to start it."` → `"Queues the task. The user can run `/pio-next-task` to start the sub-session."`

Changes are one-line text replacements in each file's `defineTool({ ... })` call. No logic, types, or structure changes.

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] All 6 tool descriptions no longer contain the phrase "Run /pio-next-task" (case-insensitive)
- [ ] Each description now uses declarative phrasing (e.g., "The user can run `/pio-next-task`...")

**Files affected:**
- `src/capabilities/create-goal.ts` — reword tool description (line ~47)
- `src/capabilities/goal-from-issue.ts` — reword tool description (line ~42)
- `src/capabilities/create-plan.ts` — reword tool description (line ~60)
- `src/capabilities/evolve-plan.ts` — reword tool description (line ~113)
- `src/capabilities/execute-task.ts` — reword tool description (line ~212)
- `src/capabilities/review-code.ts` — reword tool description (line ~240)

### Step 2: Reword response and notification messages

**Description:** Update the text returned to callers after successfully queuing a task. These are string literals in the `execute` function's return value (tool responses) and in the validation success notification. Change from imperative ("run /pio-next-task") to declarative ("Use `/pio-next-task`..." or "The user can run `/pio-next-task`...").

Specific changes:
- 6 tool execute functions: response text after `enqueueTask()` call
- 1 notification in `validation.ts`: the `notification` string appended to validation success output

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] All 7 response/notification strings no longer contain the phrase "run /pio-next-task" (lowercase, imperative)
- [ ] Each message uses declarative phrasing (e.g., "Use `/pio-next-task` to start..." or "The user can run...")

**Files affected:**
- `src/capabilities/create-goal.ts` — reword response after successful queueing (line ~66)
- `src/capabilities/goal-from-issue.ts` — reword response after successful queueing (line ~64)
- `src/capabilities/create-plan.ts` — reword response after successful queueing (line ~78)
- `src/capabilities/evolve-plan.ts` — reword response after successful queueing (line ~135)
- `src/capabilities/execute-task.ts` — reword response after successful queueing (line ~237)
- `src/capabilities/review-code.ts` — reword response after successful queueing (line ~265)
- `src/capabilities/validation.ts` — reword notification string appended on validation success (line ~143)

### Step 3: Add agent guideline to SKILL.md

**Description:** Add an explicit rule to `src/skills/pio/SKILL.md` under the "Agent Usage Guidelines" section. The new guideline should state: **Never auto-start queued tasks. After calling a `pio_*` tool that queues work, report completion and wait for the user to run `/pio-next-task`.**

Place it as a bullet point in the existing guidelines list or as a bold sub-heading with a short paragraph — matching the existing formatting style of the section.

**Acceptance criteria:**
- [ ] `src/skills/pio/SKILL.md` contains a new guideline explicitly prohibiting agents from auto-starting queued tasks
- [ ] The guideline uses clear, unambiguous language (e.g., "never", "do not")
- [ ] The file is still valid markdown (no formatting errors)

**Files affected:**
- `src/skills/pio/SKILL.md` — add new agent guideline under "Agent Usage Guidelines" section

## Notes

- All changes are text-only replacements — no logic, types, or control flow is modified. Type checking (`npm run check`) should pass trivially.
- Steps 1 and 2 touch the same files but non-overlapping regions (Step 1 edits the `description` field, Step 2 edits response strings inside `execute`). They could theoretically be combined into one step but are kept separate for cleaner review.
- No backwards-compatibility concerns: tool descriptions and response messages are cosmetic — they don't affect any API contracts or internal behavior.
