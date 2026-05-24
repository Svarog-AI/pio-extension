# Task: Add user change tracking instructions to execute-task prompt

Insert instructions into `src/prompts/execute-task.md` so the executor recognizes, records, and incrementally updates `SUMMARY.md` with user-requested changes during a session.

## Context

Currently, when a user requests mid-session changes (e.g., "merge this step", "change the approach"), the executor applies code modifications but leaves `SUMMARY.md` stale — it only reflects the original `TASK.md` scope. This was observed during S08 of the `implement-subgoals` goal, where four separate user-requested changes were applied to source files but never reflected in `SUMMARY.md`.

The execute-task prompt (`src/prompts/execute-task.md`) is a Markdown file that defines the agent workflow (Steps 1–9). This is a **prompt-only change** — no TypeScript code or test modifications are required.

## What to Build

Modify `src/prompts/execute-task.md` with two targeted insertions:

### Insertion 1: New instructions after Step 8 (before Step 9)

Add a new section or guideline block between Steps 8 and 9 instructing the executor that:

- **User feedback detection:** After initial implementation is complete (i.e., after Step 6 "Implement the feature" onward), any user message requesting changes should be recognized as a *user-requested change* — distinct from the original `TASK.md` scope. Examples of user feedback include conversational requests like "can you also do X", "change this approach", "merge this with another file".

- **Incremental SUMMARY.md updates:** After applying each user-requested change, before proceeding to final verification (Step 7) or completion (Step 9), the executor must update `SUMMARY.md` to record:
  - What the user requested (brief description)
  - Which files were created, modified, or deleted as a result of that specific change

- **Guideline:** This ensures `SUMMARY.md` always reflects the final state of all files regardless of how many feedback iterations occur during the session.

### Insertion 2: Updated SUMMARY.md templates in Step 9

Both the success and BLOCKED templates must include a new "User-Requested Changes" section:

**Success template:** Add the "User-Requested Changes" section **between "Decisions Made" and "Test Coverage"**. Format:

```markdown
## User-Requested Changes
- (none)
```

When changes did occur, each entry describes the request and affected files, e.g.:

```markdown
## User-Requested Changes
- User requested merging file A into file B. Modified `src/a.ts` (deleted), `src/b.ts` (updated).
```

**BLOCKED template:** Add the same section for consistency — include it in the BLOCKED template after the "Files Created/Modified (before block)" section or at a logically equivalent position. Default to `(none)`.

### Code Components

This task modifies exactly one Markdown prompt file. The changes are:
1. A new instructional paragraph/block inserted between Steps 8 and 9.
2. Template edits to both the success and BLOCKED `SUMMARY.md` examples in Step 9.

No new functions, types, or runtime code are introduced.

### Approach and Decisions

- **Follow existing prompt style:** Match the tone, formatting, and structure of existing steps (numbered headings, bold labels, code fences for templates).
- **Preserve step numbering:** The new instructions go between existing Steps 8 and 9 — do not renumber subsequent steps.
- **Keep both templates consistent:** Apply the same "User-Requested Changes" section to both success and BLOCKED templates so the structure is predictable regardless of outcome.

## Dependencies

None. This is the only step in the plan.

## Files Affected

- `src/prompts/execute-task.md` — modified: add user feedback tracking instructions after Step 8; update both success and BLOCKED SUMMARY.md templates to include "User-Requested Changes" section

## Acceptance Criteria

1. `src/prompts/execute-task.md` contains instructions between Steps 8 and 9 telling the executor to recognize user feedback as distinct from the original `TASK.md` scope
2. The instructions require updating `SUMMARY.md` after each user-requested change, recording what was requested and which files were affected
3. The success `SUMMARY.md` template in Step 9 includes a "User-Requested Changes" section positioned between "Decisions Made" and "Test Coverage"
4. The "User-Requested Changes" section defaults to `(none)` when no user-requested changes occurred
5. The BLOCKED `SUMMARY.md` template also includes the "User-Requested Changes" section for consistency
6. Step numbering is preserved — Steps 1–9 remain numbered as before; the new content does not renumber existing steps
7. `npm run check` (`tsc --noEmit`) exits with code 0 (TypeScript correctness preserved)

## Risks and Edge Cases

- **Placement precision:** The instructions must be inserted between Steps 8 and 9 without disrupting the flow or renumbering steps. Verify the heading structure matches existing markdown conventions (e.g., `###` vs a guideline block).
- **Template consistency:** Both success and BLOCKED templates must include the new section — missing it from one template would create inconsistent executor behavior.
- **Prompt clarity:** The instructions should clearly distinguish user-requested changes from normal implementation work. Ambiguous language could cause the executor to over-track or under-track changes.
