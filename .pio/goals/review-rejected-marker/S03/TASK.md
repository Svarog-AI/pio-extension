# Task: Update `review-code` transition with explicit `REJECTED` check

Modify the `CAPABILITY_TRANSITIONS["review-code"]` resolver in `src/utils.ts` to explicitly detect a `S{NN}/REJECTED` marker file and route back to `execute-task` for re-execution. No extra params needed — the REJECTED marker file itself is the signal that downstream code uses.

## Context

Currently, rejection is inferred implicitly — the review-code transition checks for `APPROVED`, and if absent, falls through to `execute-task` (re-execution). There's no way to distinguish "reviewed and rejected" from "not yet reviewed" or "agent crashed mid-review". Step 3 introduces an explicit `REJECTED` check so downstream code (Step 4: re-execution feedback channel) can detect intentional rejection by checking for the REJECTED file on disk.

This depends on Steps 1 and 2 being complete — the `prepareSession` lifecycle type and wiring are already in place.

## What to Build

Modify the `CAPABILITY_TRANSITIONS["review-code"]` resolver callback in `src/utils.ts` to:

1. **Check for `REJECTED` first:** When `stepNumber != null`, check if `S{NN}/REJECTED` exists on disk. If it does, return `{ capability: "execute-task", params: { goalName, stepNumber } }`. No extra flags — the REJECTED file itself is the single source of truth.
2. **Check `APPROVED` next:** If `REJECTED` does not exist, check for `APPROVED` as before. Route to `evolve-plan` with incremented stepNumber.
3. **Preserve existing fallback:** When neither `APPROVED` nor `REJECTED` exists, continue routing to `execute-task` with the same params as today. This path handles in-progress reviews or agent crashes.

### Code Components

The only change is inside the existing `CAPABILITY_TRANSITIONS["review-code"]` resolver. The logic becomes a three-way branch:

```
if stepNumber != null:
  folder = stepFolderName(stepNumber)
  if REJECTED exists:    → execute-task with { goalName, stepNumber }
  else if APPROVED exists: → evolve-plan with stepNumber + 1
  else:                  → execute-task (same as today)
else:
  → execute-task (plain string, unchanged)
```

### Approach and Decisions

- **REJECTED takes priority over APPROVED:** Check `REJECTED` first. If both somehow exist on disk, rejection wins — this is a safety preference (a rejected step should be re-executed rather than silently advanced). In practice both should never coexist (enforced by `prepareSession` cleanup in Step 5 and validateState in Step 7).
- **No redundant params:** The transition does not pass extra flags like `rejectedAfterReview`. The REJECTED marker file is the single source of truth. Step 4's feedback channel will detect re-execution by checking for this file on disk at config resolution time.
- **File path construction:** Follow the existing pattern — use `path.join(ctx.workingDir, folder, "REJECTED")`, mirroring how `approvedPath` is built today.
- **No new types needed:** The `TransitionResult.params` field is already `Record<string, unknown>`. We pass the same params shape as the current fallback (`{ goalName, stepNumber }`) — no schema changes required.

## Dependencies

- Step 1: `prepareSession` lifecycle type added to `StaticCapabilityConfig` (completed).
- Step 2: `prepareSession` wired into session lifecycle (completed).
- No runtime dependencies on Steps 4–7; this step is self-contained in `src/utils.ts`.

## Files Affected

- `src/utils.ts` — modify `CAPABILITY_TRANSITIONS["review-code"]` resolver callback

## Acceptance Criteria

- [ ] Transition resolver checks `REJECTED` file existence before the existing `APPROVED` check
- [ ] Rejection routes to `execute-task` with same step number (no extra flags)
- [ ] Approval still routes to `evolve-plan` with incremented step number (unchanged)
- [ ] Neither-exists fallback still routes to `execute-task` (unchanged)
- [ ] When both `APPROVED` and `REJECTED` exist, `REJECTED` takes precedence
- [ ] `npm run check` reports no type errors

## Risks and Edge Cases

- **Both APPROVED and REJECTED exist:** Theoretically impossible with proper lifecycle, but if both exist on disk, `REJECTED` takes precedence (checked first). Rejection is the safer default — a rejected step should be re-executed rather than silently advanced.
- **REJECTED exists without stepNumber:** The transition only checks markers when `stepNumber != null`. Without stepNumber, it falls through to the plain string `"execute-task"` — unchanged behavior.
- **Backwards compatibility:** Old reviews without explicit markers still route to `execute-task` via the fallback path. No breaking change for existing workflows.
- **Timing with Step 7 (marker creation):** Inside `pio_mark_complete`, review-code automation must run **before** `validateOutputs(rules, dir)`. The sequence: (1) parse frontmatter → create markers (APPROVED or REJECTED), (2) `validateOutputs` validates that exactly one of APPROVED/REJECTED exists (validation will fail if neither or both exist), (3) `resolveNextCapability` reads which marker exists for routing. If automation ran after validation, markers wouldn't exist yet and validation would fail. This ordering constraint is enforced by Step 7's implementation; the transition resolver in this step is pure — it just checks files on disk.
