---
totalSteps: 3
steps:
  - name: move-cleanup-to-postexecute
    complexity: task
  - name: update-prompt-and-messages
    complexity: task
  - name: integration-verification
    complexity: task
---

# Plan: Defer incomplete step folder cleanup to postExecute during revise-plan

Split `prepareSession()` into pre-session archival only, deferring non-APPROVED step folder deletion to a new `postExecute` hook so the Plan Revision Agent can inspect trigger step content.

## Prerequisites

None.

## Steps

### Step 1: Move step folder deletion from prepareSession to postExecute

In `src/capabilities/revise-plan.ts`, extract the non-APPROVED step folder deletion and `REVISE_PLAN_NEEDED` marker cleanup from `prepareSession()` into a new `cleanupIncompleteSteps()` function. Wire this as the `postExecute` callback in `CAPABILITY_CONFIG`. After this change, `prepareSession()` performs only PLAN.md archival — step folders remain on disk during the agent session.

`cleanupIncompleteSteps(goalDir, params)` should:
- Read step list from PLAN.md frontmatter (via `createGoalState`). But since PLAN.md may have been replaced by the revision agent, fall back to scanning `S{NN}/` folders on disk using the `STEP_FOLDER_RE` pattern (`/^S(\d+)$/`).
- For each `S{NN}/` folder found, delete it if it does not contain an `APPROVED` marker.
- Delete `REVISE_PLAN_NEEDED` marker from the trigger step folder (if `revisionTriggerStep` param is present and folder still exists — though in practice `postExecute` runs after session completion, so the marker may already be cleaned; handle gracefully if missing).

Update `CAPABILITY_CONFIG.postExecute` to call this function. Update existing tests in `revise-plan.test.ts`: `prepareSession` tests should assert that step folders are **preserved**; new tests should assert that `postExecute` (or `cleanupIncompleteSteps`) deletes non-APPROVED folders.

**Acceptance criteria:**
- `prepareSession()` no longer deletes any `S{NN}/` folders — only archives PLAN.md
- `CAPABILITY_CONFIG.postExecute` is defined and calls `cleanupIncompleteSteps()`
- `cleanupIncompleteSteps()` scans disk for `S{NN}/` folders (not just frontmatter) to handle the post-revision state where the new PLAN.md may differ from archived one
- Non-APPROVED `S{NN}/` folders are deleted by `cleanupIncompleteSteps()`; APPROVED folders are preserved
- `REVISE_PLAN_NEEDED` marker is cleaned up when trigger step folder still exists at cleanup time
- `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/capabilities/revise-plan.ts` — extract deletion logic, wire as `postExecute`
- `src/capabilities/revise-plan.test.ts` — update prepareSession tests to assert folder preservation; add cleanupIncompleteSteps/postExecute tests

### Step 2: Update prompt and initial message to reflect preserved step folders

The revise-plan prompt (`src/prompts/revise-plan.md`) currently states "incomplete step folders have already been deleted" in Step 3. Update the prompt so the agent knows these folders are still available for inspection during the session. Also update `defaultInitialMessage` in `CAPABILITY_CONFIG` — it currently says "incomplete step folders have been cleaned up," which will no longer be true at session start.

Specifically:
- **Step 3** of the prompt: Replace "Steps without an APPROVED marker have already been deleted" with guidance that incomplete step folders (including the trigger step) are available for inspection — mention `TASK.md`, `TEST.md`, `DECISIONS.md`, and `REVISE_PLAN_NEEDED` as files to read.
- **Step 4** of the prompt: Add a note to check the trigger step folder for revision context.
- **`defaultInitialMessage`**: Update the message text so it says incomplete step folders are preserved for inspection (and will be cleaned up after completion) instead of saying they've been cleaned up.

**Acceptance criteria:**
- `src/prompts/revise-plan.md` Step 3 mentions that incomplete step folders are available for inspection during the session
- `src/prompts/revise-plan.md` Step 4 references reading trigger step files (`TASK.md`, `DECISIONS.md`, `REVISE_PLAN_NEEDED`)
- `defaultInitialMessage` no longer claims incomplete step folders have been cleaned up; mentions they are preserved for inspection
- `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/prompts/revise-plan.md` — update Steps 3 and 4
- `src/capabilities/revise-plan.ts` — update `defaultInitialMessage` text

### Step 3: Integration verification — full revise-plan lifecycle

Verify that the complete revise-plan lifecycle works end-to-end with the new split between `prepareSession` (archive only) and `postExecute` (cleanup). The critical scenario: when a step signals `REVISE_PLAN_NEEDED`, the flow is `evolve-plan` → `revise-plan`. At `prepareSession` time, the trigger step folder must still be readable. After `pio_mark_complete`, `postExecute` must clean it up.

Validate with an integration test or updated existing integration test in `revise-plan.test.ts`: create a goal tree with approved and non-approved steps (including a trigger step with `REVISE_PLAN_NEEDED`), call `prepareSession()` and assert all step folders are still present, then call `cleanupIncompleteSteps()` and assert only APPROVED folders remain.

**Acceptance criteria:**
- Full lifecycle test passes: prepareSession preserves all step folders, cleanupIncompleteSteps deletes non-APPROVED folders
- Existing running test suite passes with no regressions (`npx vitest run` or equivalent)
- `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/capabilities/revise-plan.test.ts` — update end-to-end integration test to cover the split lifecycle

## Notes

- `goal-state.ts` `steps()` derives step list from PLAN.md frontmatter. After archival, PLAN.md is gone — but during session it's still present (archived copy is separate). For `postExecute`, the new PLAN.md may exist with different steps. Disk scanning (`S{NN}/` regex) is safer than relying on frontmatter for cleanup.
- The `REVISE_PLAN_NEEDED` marker cleanup currently runs in `prepareSession` after the folder is already deleted (for non-APPROVED trigger steps). Moving it to `postExecute` means the folder may or may not exist — handle both cases gracefully with `force: true`.
- File protections (`readOnlyFiles`, `writeAllowlist`) do not need changes — incomplete step folders are already writable, and APPROVED folders remain read-only.
