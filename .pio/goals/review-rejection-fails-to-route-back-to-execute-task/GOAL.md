# Fix Review Rejection Routing (COMPLETED marker blocks re-execution)

When the `review-code` capability rejects a step, the workflow should route back to `execute-task` for the same step. Currently this fails because the `COMPLETED` marker file blocks re-execution, and relying on the review agent to delete it via bash is unreliable. This goal introduces explicit state management for rejected steps so the rejection → re-execution loop works correctly, with proper feedback context for the implementation agent.

## Current State

The pio workflow cycles through `execute-task` → `review-code`. After a step is implemented, `execute-task` writes a `S{NN}/COMPLETED` marker file. The transition system (`CAPABILITY_TRANSITIONS` in `src/utils.ts`) routes from `execute-task` to `review-code`, and from `review-code` checks for `S{NN}/APPROVED`:

- **If APPROVED exists:** route to `evolve-plan` (next step).
- **If APPROVED is absent:** route back to `execute-task` (re-execute same step).

However, the rejection path has multiple failure modes:

1. **The review prompt** (`src/prompts/review-code.md`, Step 8) instructs the agent to "Delete the `S{NN}/COMPLETED` marker using bash: `rm S{NN}/COMPLETED`" on rejection. This is unreliable — text-generation agents may forget or refuse to invoke bash for file deletion, since it doesn't fit their normal write-tool pattern.

2. **`isStepReady` blocks re-execution** (`src/capabilities/execute-task.ts`, `isStepReady`): Returns false when `COMPLETED` exists (`hasTask && hasTest && !hasCompleted && !hasBlocked`). If COMPLETED still exists after rejection, any manual invocation of `/pio-execute-task` or the `pio_execute_task` tool will fail validation — the step appears "already completed."

3. **`validateExplicitStep` blocks explicit re-execution** (`src/capabilities/execute-task.ts`): Returns error `"Step N is already marked as COMPLETED"` when `COMPLETED` exists. No exception for rejected steps.

4. **Write allowlist doesn't include REJECTED** (`src/capabilities/review-code.ts`, `resolveReviewWriteAllowlist`): Only allows writing `S{NN}/REVIEW.md` and `S{NN}/APPROVED`. There's no `REJECTED` marker in the system.

5. **No cleanup mechanism exists:** The transition resolver (`resolveNextCapability` in `src/utils.ts`) doesn't perform any file cleanup on rejection. The `fileCleanup` config option (processed in `validation.ts`) isn't used by review-code for rejections.

6. **Dead end state:** A step with `COMPLETED` + `REVIEW.md` (containing REJECTED) but no `APPROVED` is stuck. The transition routes to `execute-task`, but `isStepReady` returns false, so the step can never be re-executed without manual intervention (deleting COMPLETED by hand).

7. **No rejection context in re-execution:** When `execute-task` is re-run after rejection, the initial message (`CAPABILITY_CONFIG.defaultInitialMessage` in `src/capabilities/execute-task.ts`) always says "Read TASK.md and TEST.md" — identical to a first-time execution. The agent has no indication that this is a re-execution, nor does it know to read `S{NN}/REVIEW.md` for the reviewer's feedback and recommendations.

8. **REVIEW.md not in execute-task read-only files** (`src/capabilities/execute-task.ts`, `resolveExecuteReadOnlyFiles`): Only TASK.md and TEST.md are listed as read-only. REVIEW.md is not included, so it won't be explicitly protected from modification during re-execution.

## To-Be State

The rejection flow will use explicit state markers, automated cleanup, and proper feedback context — no bash dependency on the review agent.

### New marker file: `S{NN}/REJECTED`

- **Added as an allowed write target** in `review-code` write allowlist (`src/capabilities/review-code.ts`, `resolveReviewWriteAllowlist`).
- On rejection, the review agent writes an empty `S{NN}/REJECTED` file instead of relying on bash deletion.
- On approval, behavior is unchanged: write `S{NN}/APPROVED`.

### Automated state transitions in `resolveNextCapability` (`src/utils.ts`)

When the transition resolver detects a rejection from `review-code`:

1. **On rejection path** (APPROVED absent): Auto-delete `S{NN}/COMPLETED` and create `S{NN}/REJECTED` as explicit state. This ensures `isStepReady` will return true for the step on re-execution.
2. The cleanup should happen at transition time, not in the review agent session — this makes the flow deterministic and agent-independent.

### Updated `execute-task` readiness logic (`src/capabilities/execute-task.ts`)

- **`isStepReady`** checks if a step can be executed. After rejection cleanup (COMPLETED deleted), it should naturally return true since `!hasCompleted` will be satisfied.
- **`validateExplicitStep`** should allow re-execution when REVIEW.md exists with REJECTED status OR when a `REJECTED` marker file exists, even if `COMPLETED` somehow persists (defense in depth).

### Updated review prompt (`src/prompts/review-code.md`)

- **Step 8 (rejection):** Replace "Delete the `S{NN}/COMPLETED` marker using bash: `rm S{NN}/COMPLETED`" with "Write an empty file at `S{NN}/REJECTED`." Remove any mention of bash-based deletion.
- **Step 8 (approval):** Keep existing behavior — write `S{NN}/APPROVED`, leave COMPLETED intact.

### Updated execute-task initial message on re-execution (`src/capabilities/execute-task.ts`)

The `defaultInitialMessage` for `execute-task` should detect rejection context and produce a different message on re-execution:

- **First execution:** Current behavior — "Read TASK.md and TEST.md inside the `S{NN}/` directory, write tests first, then implement."
- **Re-execution after rejection:** The message should indicate this is a re-execution, instruct the agent to read `S{NN}/REVIEW.md` for reviewer feedback, and emphasize addressing the issues found.

This requires detecting rejection context at launch time — either by checking for `REJECTED`/`REVIEW.md` during config resolution, or by propagating rejection context through transition params (e.g., `_rejected: true`) so `defaultInitialMessage` can branch on it.

### Updated execute-task read-only files (`src/capabilities/execute-task.ts`)

- Add `S{NN}/REVIEW.md` to the read-only files list when it exists, so the implementation agent can reference reviewer feedback but cannot modify it during re-execution.

### Files to modify

1. **`src/capabilities/review-code.ts`** — Add `S{NN}/REJECTED` to write allowlist.
2. **`src/utils.ts`** — Update `CAPABILITY_TRANSITIONS["review-code"]` resolver: on rejection, auto-delete `COMPLETED`, create `REJECTED` marker.
3. **`src/capabilities/execute-task.ts`** — Update `isStepReady` and `validateExplicitStep` to handle rejection state. Update `defaultInitialMessage` to detect rejection context and produce a re-execution message. Update `resolveExecuteReadOnlyFiles` to include `S{NN}/REVIEW.md` when it exists.
4. **`src/prompts/review-code.md`** — Update Step 8 instructions: replace bash deletion with writing REJECTED marker.

### Acceptance criteria

- After a review rejection, the `COMPLETED` marker is automatically removed (no manual intervention needed).
- The transition system correctly routes back to `execute-task` for the same step after rejection.
- Manual invocation of `/pio-execute-task <name> <step>` succeeds for a rejected step (COMPLETED deleted, REJECTED exists or review indicates rejection).
- The review agent never needs to use bash for file deletion — only write-tool operations.
- The `REJECTED` marker is cleaned up when `execute-task` starts (or at transition time), so re-execution begins with clean state.
- On re-execution after rejection, the initial message instructs the implementation agent to read `S{NN}/REVIEW.md` for reviewer feedback (different from the first-execution message).
- `S{NN}/REVIEW.md` is readable but not writable during re-execution of a rejected step.
