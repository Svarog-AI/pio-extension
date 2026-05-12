# Rename review-code to review-task and adjust prompts

# Rename review-code to review-task

Rename the `review-code` capability to `review-task` across all files, tools, commands, transitions, and documentation. The name "review-code" is inconsistent with `execute-task` — both operate on plan steps (tasks), so both should use "task" terminology.

## File renames

- `src/capabilities/review-code.ts` → `src/capabilities/review-task.ts`
- `src/prompts/review-code.md` → `src/prompts/review-task.md`

## Changes to make

### `src/capabilities/review-task.ts` (renamed from `review-code.ts`)
- Change capability name from `"review-code"` to `"review-task"` in:
  - `CAPABILITY_CONFIG.prompt` → `"review-task.md"`
  - Error messages (3 occurrences)
  - Tool definition (`pio_review_code` → `pio_review_task`, label, description)
  - Command registration (`pio-review-code` → `pio-review-task`)
  - Function names (`handleReviewCode` → `handleReviewTask`, `setupReviewCode` → `setupReviewTask`)
  - `defaultInitialMessage` error string
  - Transition capability references (enqueue next task)

### `src/prompts/review-task.md` (renamed from `review-code.md`)
- Rename "Code Review Agent" to "Task Review Agent" or similar throughout
- Update any self-references to "review-code" → "review-task"

### `src/utils.ts` — CAPABILITY_TRANSITIONS
- `"execute-task"` → `"review-code"` transition target: change to `"review-task"`
- `"review-code"` key in transitions map: change to `"review-task"`
- Comment referencing `review-code` → `review-task`
- Type doc example mentioning `"review-code"` → `"review-task"`

### `src/index.ts`
- Import: `setupReviewCode` from `./capabilities/review-code` → `setupReviewTask` from `./capabilities/review-task`
- Call site: `setupReviewCode(pi)` → `setupReviewTask(pi)`

### `src/skills/pio/SKILL.md`
- All mentions of `review-code` in workflow lifecycle, command table, and sub-session mechanics

### Open questions
- Should the README.md be updated too if it references `/pio-review-code`? (Check current content)
- Any session queue files or existing goal state that might reference the old capability name? (Likely no stale data to worry about, but worth noting)

## Category

refactor

## Context

Full list of files and line numbers referencing review-code:

**src/capabilities/review-code.ts** — 9 references (error messages, CAPABILITY_CONFIG.prompt, tool name, command name, function names, transition)
**src/utils.ts** — 5 references (TransitionContext doc comment, CAPABILITY_TRANSITIONS map keys/values, resolveNextCapability doc)
**src/index.ts** — 2 references (import and setup call)
**src/skills/pio/SKILL.md** — 3 references (workflow description, command table)

No references in: execute-task.ts, evolve-plan.ts, session-capability.ts
