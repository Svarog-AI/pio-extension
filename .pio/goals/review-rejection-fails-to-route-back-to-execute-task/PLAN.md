# Plan: Fix Review Rejection Routing

Introduce explicit state management for rejected steps so the rejection → re-execution loop works correctly, with automated cleanup and proper feedback context for the implementation agent.

## Prerequisites

None.

## Steps

### Step 1: Extend TransitionResult with cleanup fields and update review-code resolver

**Description:** Add `filesToDelete` and `filesToCreate` optional fields to the `TransitionResult` interface in `src/utils.ts`. This allows transition resolvers to declare file-side effects declaratively, without mixing IO into transition logic. Update the `review-code` entry in `CAPABILITY_TRANSITIONS` to return cleanup instructions on the rejection path: delete `S{NN}/COMPLETED` and create `S{NN}/REJECTED`. The approval path remains unchanged.

Interface shape after change (type stub only):
```typescript
interface TransitionResult {
  capability: string;
  params?: Record<string, unknown>;
  filesToDelete?: string[];   // absolute paths to delete
  filesToCreate?: string[];   // absolute paths to create as empty files
}
```

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] `TransitionResult` interface includes optional `filesToDelete` and `filesToCreate` fields
- [ ] The `review-code` transition resolver returns `filesToDelete: [COMPLETED path]` and `filesToCreate: [REJECTED path]` when `APPROVED` does not exist
- [ ] The approval path (when `APPROVED` exists) still returns only `capability: "evolve-plan"` with no cleanup fields

**Files affected:**
- `src/utils.ts` — Extend `TransitionResult`, update `CAPABILITY_TRANSITIONS["review-code"]` resolver

### Step 2: Execute cleanup in pio_mark_complete after resolveNextCapability

**Description:** In `src/capabilities/validation.ts`, inside the `pio_mark_complete` tool's execute handler, perform file cleanup declared by the transition resolver. After calling `resolveNextCapability()` and obtaining a result, check for `filesToDelete` and `filesToCreate` on the result object. Delete listed files with `fs.rmSync` and create empty files with `fs.writeFileSync`. This runs before enqueuing the next task, so the destination capability sees clean state (e.g., `COMPLETED` is gone before `execute-task` validates readiness).

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] After validation passes and `resolveNextCapability` returns cleanup fields, the files are actually deleted/created on disk
- [ ] Cleanup happens before task enqueuing (COMPLETED is gone when execute-task readiness is checked)
- [ ] No change to behavior when transition result has no cleanup fields (happy path for approval still works)

**Files affected:**
- `src/capabilities/validation.ts` — Add cleanup execution after `resolveNextCapability()` call in `pio_mark_complete`

### Step 3: Update execute-task readiness logic, re-execution message, and read-only files

**Description:** Three changes to `src/capabilities/execute-task.ts`:

1. **`isStepReady`:** Allow a step to be considered ready when `REJECTED` exists, even if `COMPLETED` somehow persists (defense in depth — after Step 2's cleanup, `COMPLETED` should already be gone, but this guards against edge cases). Logic: treat presence of `S{NN}/REJECTED` as an override that ignores `COMPLETED`.

2. **`validateExplicitStep`:** Allow explicit re-execution (`/pio-execute-task <name> <step>`) when a rejection indicator exists — either `REVIEW.md` contains a REJECTED decision, or `S{NN}/REJECTED` marker file exists. If `COMPLETED` exists alongside a rejection indicator, allow it (don't return the "already marked as COMPLETED" error).

3. **`defaultInitialMessage`:** Detect rejection context at launch time by checking for `REJECTED` marker or a REJECTED decision in `REVIEW.md`. When detected, produce a different initial message that instructs the agent to read `S{NN}/REVIEW.md` for reviewer feedback and address the identified issues. First-time execution keeps the existing message unchanged.

4. **`resolveExecuteReadOnlyFiles`:** Add `S{NN}/REVIEW.md` to the read-only files list when it exists, so the implementation agent can reference reviewer feedback but cannot modify it during re-execution.

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] `isStepReady` returns `true` for a step with `TASK.md` + `TEST.md` + `REJECTED` even if `COMPLETED` also exists
- [ ] `validateExplicitStep` allows execution when `REJECTED` marker exists, regardless of `COMPLETED`
- [ ] `defaultInitialMessage` produces a re-execution message (mentioning REVIEW.md and addressing issues) when `REJECTED` exists for the step
- [ ] `defaultInitialMessage` produces the existing first-execution message when `REJECTED` does not exist
- [ ] `resolveExecuteReadOnlyFiles` includes `S{NN}/REVIEW.md` in the returned list when the file exists

**Files affected:**
- `src/capabilities/execute-task.ts` — Update `isStepReady`, `validateExplicitStep`, `defaultInitialMessage`, `resolveExecuteReadOnlyFiles`

### Step 4: Add REJECTED to review-code write allowlist and update review prompt

**Description:** Two changes to complete the rejection flow on the review side:

1. **`src/capabilities/review-code.ts`:** Add `${folder}/REJECTED` to the array returned by `resolveReviewWriteAllowlist`, so the review agent can write the `S{NN}/REJECTED` file using the write tool (no bash required).

2. **`src/prompts/review-code.md`:** In Step 8, replace "Delete the `S{NN}/COMPLETED` marker using bash: `rm S{NN}/COMPLETED`" with "Write an empty file at `S{NN}/REJECTED`." Remove any mention of bash-based deletion. The cleanup of `COMPLETED` is now handled automatically by infrastructure (Step 1 + Step 2) — the prompt should reflect that the agent only needs to write REJECTED, not delete COMPLETED.

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] `resolveReviewWriteAllowlist` includes `${folder}/REJECTED` alongside `REVIEW.md` and `APPROVED`
- [ ] Review prompt Step 8 (rejection) instructs the agent to write an empty `S{NN}/REJECTED` file
- [ ] Review prompt Step 8 no longer mentions bash deletion or `rm COMPLETED`
- [ ] Review prompt Step 8 (approval) is unchanged — still writes `APPROVED`, leaves `COMPLETED` intact

**Files affected:**
- `src/capabilities/review-code.ts` — Add REJECTED to write allowlist
- `src/prompts/review-code.md` — Update Step 8 rejection instructions

## Notes

- **Step ordering:** Steps 1 and 2 must be done in order (validation.ts consumes the extended TransitionResult from utils.ts). Step 3 depends on Step 1 (execute-task needs to understand REJECTED as a valid state, which is created by the transition resolver from Step 1). Step 4 can be done after Step 1 but is independent of Steps 2 and 3.
- **No backwards-compatibility risk:** The `filesToDelete`/`filesToCreate` fields are optional on `TransitionResult`. Existing transitions (create-goal, create-plan, evolve-plan) don't use them — no change to their behavior.
- **REJECTED lifecycle:** Created by the transition resolver on rejection, consumed by execute-task's readiness logic. After a successful re-execution (new COMPLETED written), REJECTED will coexist with COMPLETED — this is acceptable since `isStepReady` checks for absence of COMPLETED (not presence of REJECTED) in the success case, and a new review will trigger fresh cleanup. If desired, Step 3 could also delete REJECTED when starting a clean execution, but this is not required by GOAL.md scope.
