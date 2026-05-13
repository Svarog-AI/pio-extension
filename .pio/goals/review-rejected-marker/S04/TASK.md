# Task: Add re-execution feedback channel in `execute-task`

When a step is re-executed after review rejection, the implementation agent receives an initial message instructing it to read `S{NN}/REVIEW.md` for feedback before implementing.

## Context

Currently, when `review-code` rejects and transitions back to `execute-task`, the re-execution session receives the generic initial message: `"Read TASK.md and TEST.md ... write tests first, then implement."` There is no mention of rejection, no reference to `REVIEW.md`, and no summary of what needs fixing. The implementation agent starts blind.

Step 3 implemented explicit `REJECTED` marker routing in `CAPABILITY_TRANSITIONS["review-code"]`. The transition does **not** pass a param flag — the REJECTED file on disk is the single source of truth. This step detects that signal and adapts the initial message accordingly.

## What to Build

Modify `CAPABILITY_CONFIG.defaultInitialMessage` in `src/capabilities/execute-task.ts` to detect when a step is being re-executed after rejection by checking for the `S{NN}/REJECTED` file on disk, and if present, prepend instructions referencing `S{NN}/REVIEW.md`.

### Code Components

#### Modified `defaultInitialMessage` callback

**Current behavior:** Always returns the same generic message regardless of execution context.

**New behavior:** Before constructing the message, check if `S{NN}/REJECTED` exists (using `fs.existsSync`). If it does, prepend a rejection-aware instruction block. If not, use the existing message unchanged.

The callback signature remains `(workingDir: string, params?: Record<string, unknown>) => string`. The function already imports `fs` and uses `stepFolderName()` — both are available for this change.

**Detection logic:**
- Extract `stepNumber` from `params` (already done)
- Construct path: `path.join(workingDir, stepFolderName(stepNumber), "REJECTED")`
- Check existence with `fs.existsSync(rejectedPath)`

**Message format when REJECTED exists:** Prepend a paragraph instructing the agent to read REVIEW.md for feedback. Example structure (natural language description, not exact text):
> "This step was previously rejected. Read `S{NN}/REVIEW.md` for detailed review feedback before implementing. Address all critical and high-priority issues identified in the review."

Followed by the existing standard message about reading TASK.md and TEST.md.

**Message format when REJECTED does not exist:** Unchanged from current behavior — generic "read TASK.md and TEST.md, write tests first" message.

### Approach and Decisions

- **File-based detection (not param flag):** Step 3 decided the REJECTED file is the single source of truth. The `defaultInitialMessage` reads the filesystem directly rather than checking a hypothetical `params.rejectedAfterReview` flag. This keeps params minimal and avoids stale-state if markers change between transition resolution and session startup.
- **Use existing imports:** `fs` and `path` are already imported in `execute-task.ts`. `stepFolderName()` is already imported from `../utils`. No new imports needed.
- **Non-blocking check:** If the filesystem read fails for any reason, fall through to the normal message. The rejection feedback is an enhancement, not a requirement.
- **Message clarity:** The prepended text must explicitly name `REVIEW.md` and make it clear this is a re-execution scenario. The agent should know to prioritize review feedback over starting fresh.

## Dependencies

- **Step 3 (completed):** `CAPABILITY_TRANSITIONS["review-code"]` now checks for `REJECTED` and routes to `execute-task`. This step consumes the REJECTED marker created by Step 7's automation.
- **Note:** During development (before Step 7 is implemented), the REJECTED marker won't be created automatically. The feedback channel still works correctly — it simply won't trigger until Step 7 creates the file at `pio_mark_complete`.

## Files Affected

- `src/capabilities/execute-task.ts` — modify `defaultInitialMessage` to detect REJECTED file and include rejection-aware initial message

## Acceptance Criteria

- [ ] `defaultInitialMessage` detects the `S{NN}/REJECTED` file on disk and includes a rejection-aware message referencing `S{NN}/REVIEW.md`
- [ ] Normal first-time execution message is unchanged when no REJECTED marker exists
- [ ] The rejection-aware message explicitly instructs the agent to read `S{NN}/REVIEW.md` for feedback
- [ ] The rejection-aware message mentions this is a re-execution (not a fresh start)
- [ ] No new imports required beyond what already exists in `execute-task.ts`
- [ ] `npm run check` reports no type errors

## Risks and Edge Cases

- **Timing gap:** Between Step 3 (transition routing) and Step 7 (automatic marker creation), the REJECTED file won't exist on disk. The feedback channel won't trigger during this window. This is acceptable — the feature activates end-to-end once all steps are complete.
- **Stale state:** If a developer manually creates/deletes REJECTED outside the normal lifecycle, the message might show rejection context incorrectly. This is an edge case of manual intervention, not a code bug.
- **Filesystem availability:** `fs.existsSync` is synchronous and fast. No timeout or error handling needed for local files — it returns false on any error naturally.
