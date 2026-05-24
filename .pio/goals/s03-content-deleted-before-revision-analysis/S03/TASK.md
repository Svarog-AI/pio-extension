# Task: Integration verification — full revise-plan lifecycle

Verify that the complete revise-plan lifecycle works end-to-end with the split between `prepareSession` (archive only) and `postExecute` (cleanup), including prompt updates from Steps 1–2.

## Context

Steps 1 and 2 restructured the revise-plan capability: `prepareSession` now archives PLAN.md without deleting step folders, and a new `cleanupIncompleteSteps` function (wired as `postExecute`) defers non-APPROVED folder deletion until after the agent completes. The prompt (`revise-plan.md`) and `defaultInitialMessage` were updated to reflect that incomplete step folders are preserved during the session. Step 3 verifies this works as a cohesive unit — no regressions, all pieces wire together correctly.

## What to Build

This step is verification-only. No new production code changes are expected. The work focuses on:

1. **Ensure the existing end-to-end lifecycle test covers the complete split workflow:** `prepareSession` preserves all folders → `cleanupIncompleteSteps` deletes non-APPROVED and cleans markers. Review the test in `revise-plan.test.ts` under "end-to-end lifecycle" — it was updated in Step 1. Verify it still passes and covers the full flow with a realistic scenario (mixed approved/non-approved, trigger step with marker).

2. **Add an integration test that validates CAPABILITY_CONFIG wiring end-to-end:** Verify that `CAPABILITY_CONFIG.postExecute` is `cleanupIncompleteSteps`, that `prepareSession` does not delete folders, and that the config callbacks (`readOnlyFiles`, `writeAllowlist`) resolve correctly after the split. This ensures the config object itself is internally consistent — all lifecycle hooks point to the correct functions.

3. **Run the full test suite to confirm no regressions:** Execute `npx vitest run` across all test files and verify zero failures.

4. **Verify TypeScript compilation:** Run `npx tsc --noEmit` and confirm no errors.

5. **Verify prompt file consistency (manual or programmatic spot-check):** Read `src/prompts/revise-plan.md` and confirm that Step 3 mentions preserved incomplete step folders with references to `TASK.md`, `DECISIONS.md`, and `REVISE_PLAN_NEEDED`. Confirm Step 4 includes the trigger step folder research instruction. These text changes were made in Step 2 — a quick verification here ensures nothing was accidentally reverted.

### Code Components

No new functions or modules. This step operates on existing code:
- `cleanupIncompleteSteps()` in `src/capabilities/revise-plan.ts` — verify behavior matches spec
- `prepareSession()` in `src/capabilities/revise-plan.ts` — verify archive-only behavior
- `CAPABILITY_CONFIG` in `src/capabilities/revise-plan.ts` — verify wiring consistency
- `src/prompts/revise-plan.md` — verify text reflects new behavior

### Approach and Decisions

- **Reuse the existing goal tree fixture:** The `createGoalTree()` helper in `revise-plan.test.ts` supports all needed configurations (approved/non-approved steps, markers, archive directories). Use it for integration scenarios.
- **Follow the pattern established in Step 1 tests:** The end-to-end lifecycle test already demonstrates the split workflow. Extend or verify it rather than rewriting from scratch.
- **DECISIONS.md reference:** `cleanupIncompleteSteps` scans disk using `STEP_FOLDER_RE`, not PLAN.md frontmatter. Integration tests should exercise a scenario where PLAN.md lists different steps than what's on disk to prove this works end-to-end. The existing "scans disk, not PLAN.md frontmatter" test in `cleanupIncompleteSteps` covers this — verify it still passes.

## Dependencies

- Step 1 (move-cleanup-to-postexecute): Must be completed — provides `cleanupIncompleteSteps()` and updated `prepareSession()`
- Step 2 (update-prompt-and-messages): Must be completed — provides updated prompt text and `defaultInitialMessage`

## Files Affected

- `src/capabilities/revise-plan.test.ts` — add integration test for CAPABILITY_CONFIG wiring consistency; verify existing end-to-end lifecycle test covers full split workflow
- `src/prompts/revise-plan.md` — read-only verification (confirm Step 3 and Step 4 text from Step 2 is correct)

## Acceptance Criteria

- An integration test verifies the full prepareSession → cleanupIncompleteSteps split lifecycle with mixed approved/non-approved steps and trigger step marker (existing end-to-end test must pass or be updated to cover this scenario)
- A new test (or set of assertions) validates CAPABILITY_CONFIG wiring: `postExecute` is `cleanupIncompleteSteps`, `prepareSession` exists, `defaultInitialMessage` produces correct text with and without `revisionTriggerStep`
- All existing tests pass with no regressions (`npx vitest run` — all ~705+ tests across 23 files)
- `npx tsc --noEmit` reports no errors
- `src/prompts/revise-plan.md` Step 3 mentions preserved incomplete step folders with file references (`TASK.md`, `DECISIONS.md`, `REVISE_PLAN_NEEDED`)
- `src/prompts/revise-plan.md` Step 4 includes trigger step folder research instruction

## Risks and Edge Cases

- **Test count inflation:** Ensure any new tests add genuine coverage rather than duplicating existing assertions. The CAPABILITY_CONFIG wiring test should consolidate multiple config assertions into one focused describe block.
- **Timing-dependent assertions:** `prepareSession` uses timestamps for archive filenames. Integration tests must not assert exact filenames — use regex matching (`/^PLAN-.*\.md$/`) instead.
- **Post-revision PLAN.md mismatch:** The `cleanupIncompleteSteps` function scans disk, not frontmatter. If a test creates folders not in PLAN.md (or vice versa), cleanup should still work based on APPROVED markers only.
