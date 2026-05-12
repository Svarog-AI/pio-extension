# Review rejection fails to route back to execute-task (COMPLETED marker blocks re-execution)

## Problem

When the review-code capability writes `REVIEW.md` with status REJECTED, the workflow should automatically route back to `execute-task` for the same step. However, the rejection path fails to complete this loop in practice.

### What happens today

1. `execute-task` implements step N, writes `S{NN}/COMPLETED` marker → calls `pio_mark_complete`
2. Transition routes to `review-code` for step N
3. Review agent writes `REVIEW.md` with status REJECTED
4. **Prompt says:** "Delete the COMPLETED marker using bash: `rm S{NN}/COMPLETED`" and then call `pio_mark_complete`
5. Transition checks for `S{NN}/APPROVED` — doesn't exist → routes back to `execute-task` (correct)

### Where it breaks

The review prompt instructs the agent to delete `COMPLETED` via bash (`rm`). But this creates several failure modes:

1. **Agent forgets or refuses to use bash:** The review agent is a text-generation agent — it may write REVIEW.md and call `pio_mark_complete` without deleting COMPLETED, since that step requires a bash tool invocation that doesn't fit the normal write pattern.
2. **COMPLETED still exists after rejection:** Even if the transition routes back to execute-task (via `pio_mark_complete` → `resolveNextCapability`), any *manual* invocation of `/pio-execute-task <name> <step>` or `pio_execute_task` tool will fail validation because `isStepReady` returns false when COMPLETED exists:

```typescript
// execute-task.ts — isStepReady blocks re-execution
return hasTask && hasTest && !hasCompleted && !hasBlocked;
```

3. **Dead end:** The step is stuck in a "completed but rejected" state. Manual re-execution is blocked by validation. The only path forward is to manually delete the COMPLETED file and re-run.

### Root cause

The review-code rejection flow requires deleting `COMPLETED` as a side effect, but:
- There's no marker file mechanism for rejection (only absence of `APPROVED`, which the transition reads)
- The deletion depends on the agent executing a bash command — not reliable
- No REJECTED/REREVIEW marker exists to signal "needs rework"

## Proposed solution

Introduce explicit state management for rejected steps:

### Option A: REJECTED marker file (simplest)

Add `REJECTED` as an allowed write target alongside `APPROVED`. Review prompt updated to:
- **On APPROVE:** Write empty `S{NN}/APPROVED`, delete `COMPLETED` → call `pio_mark_complete`
- **On REJECT:** Write empty `S{NN}/REJECTED`, delete `COMPLETED` → call `pio_mark_complete`

The `COMPLETED` deletion could be automated: when `execute-task` enqueues (via transition or tool), check for `REJECTED` and auto-delete both `REJECTED` and `COMPLETED` before launching. This removes the bash dependency from the review agent entirely.

### Option B: Automated state transitions in validation.ts

Instead of relying on the agent to delete COMPLETED, have `pio_mark_complete` or the transition resolver handle it:
- When `resolveNextCapability` detects a rejection (no APPROVED file), auto-delete `COMPLETED` and create a `REJECTED` marker
- The next `execute-task` session starts with clean state (no COMPLETED, has REVIEW.md for context)

### Option C: Allow re-execution despite COMPLETED when REVIEW.md is REJECTED

Modify `isStepReady` to detect rejection via REVIEW.md content:
```typescript
// If REVIEW.md exists and contains "REJECTED", allow re-execution
const reviewPath = path.join(stepDir, REVIEW_FILE);
if (fs.existsSync(reviewPath)) {
  const content = fs.readFileSync(reviewPath, "utf-8");
  if (content.includes("REJECTED")) return true; // allow re-execution
}
```

## Recommended approach

**Option A + B combined:** Use explicit `REJECTED` marker + automate cleanup in the transition resolver. The review agent only needs to write two files (`REVIEW.md` + marker) and call `pio_mark_complete`. All state transitions (COMPLETED deletion, marker management) happen programmatically.

## Implementation details

- Add `S{NN}/REJECTED` to the review-code writeAllowlist
- Update review prompt Step 8: replace "delete COMPLETED via bash" with "write S{NN}/REJECTED"
- Modify `resolveNextCapability` for review-code rejection path: auto-delete COMPLETED, create REJECTED marker
- Modify `execute-task` validation or launch to clean up REJECTED marker (start fresh)

## Category

bug

## Context

Related to issue `execute-task-react-to-review-blockers.md` — this is a prerequisite fix. The blocker skill workflow assumes re-execution works; it doesn't if COMPLETED blocks the step.

## Category

bug
