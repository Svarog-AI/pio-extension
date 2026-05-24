# Task: Update prompt and initial message to reflect preserved step folders

Update the revise-plan prompt (`src/prompts/revise-plan.md`) and `defaultInitialMessage` in `src/capabilities/revise-plan.ts` so the Plan Revision Agent knows that incomplete step folders are now available for inspection during the session (instead of being pre-deleted).

## Context

After Step 1, `prepareSession()` no longer deletes non-APPROVED step folders — cleanup is deferred to `postExecute` (`cleanupIncompleteSteps`). This means the Plan Revision Agent can now read the trigger step's files: `TASK.md`, `TEST.md`, `DECISIONS.md`, and `REVISE_PLAN_NEEDED`. The prompt and initial message still claim "incomplete step folders have already been deleted," which is now incorrect and misleading.

## What to Build

### 1. Update `src/prompts/revise-plan.md` — Step 3

**Current text (Step 3):**
> Steps without an `APPROVED` marker have already been deleted by the cleanup process. You will only see completed step folders.

**Required change:** Replace this sentence with guidance that incomplete step folders are available for inspection during the session. Specifically mention:
- Incomplete step folders (including the trigger step) are **preserved** for the duration of the session
- Key files to inspect: `TASK.md` (what was specified), `DECISIONS.md` (decisions made during specification), `REVISE_PLAN_NEEDED` (reason for revision)
- These folders will be cleaned up automatically after the session completes (`postExecute`)

### 2. Update `src/prompts/revise-plan.md` — Step 4

**Current text (Step 4):** Lists sources to research but does not mention the trigger step folder.

**Required change:** Add a note to check the trigger step's folder for revision context. Specifically:
- Read the trigger step's `REVISE_PLAN_NEEDED` file to understand why revision was triggered (the YAML frontmatter `reason` field contains the reason)
- Read the trigger step's `TASK.md` and `DECISIONS.md` for context on what decisions led to the revision request

### 3. Update `defaultInitialMessage` in `src/capabilities/revise-plan.ts`

**Current text:**
```
The current plan has been archived to PLAN_ARCHIVE/ and incomplete step folders have been cleaned up.
```

**Required change:** Replace "incomplete step folders have been cleaned up" with language indicating they are **preserved for inspection** during the session and will be cleaned up afterward. The message should still mention:
- The plan has been archived to `PLAN_ARCHIVE/`
- Incomplete step folders are preserved for inspection (will be cleaned up after completion)
- If a trigger step is known, direct the agent to read its files

## Code Components

No new functions or exports — this is a text-only update to prompt and message strings. The changes are:

1. **Prompt file (`revise-plan.md`):** Two paragraph replacements in Steps 3 and 4.
2. **Initial message string (`revise-plan.ts`):** One string replacement in `defaultInitialMessage`.

## Approach and Decisions

- Follow the existing prompt structure — do not restructure or rename steps, only update text content within existing steps.
- The prompt intro paragraph currently says "The mechanical cleanup (archiving the old plan, deleting incomplete step folders) has already been handled before this session started." This should also be updated to reflect that folder deletion is deferred to after the session. Update it to mention archiving happened but folder cleanup is deferred.
- Reference decisions from `DECISIONS.md`: `cleanupIncompleteSteps` scans disk for `S{NN}/` folders — this means any incomplete step folders present on disk will be visible to the agent.

## Dependencies

- **Step 1 must be completed** (move-cleanup-to-postexecute) — `prepareSession` must no longer delete step folders and `postExecute` must be wired to `cleanupIncompleteSteps`. This step only updates text to match that behavior.

## Files Affected

- `src/prompts/revise-plan.md` — modified: update intro paragraph, Step 3, and Step 4 text
- `src/capabilities/revise-plan.ts` — modified: update `defaultInitialMessage` string

## Acceptance Criteria

- `src/prompts/revise-plan.md` intro paragraph no longer claims "deleting incomplete step folders" happened before the session; mentions archiving happened but folder cleanup is deferred
- `src/prompts/revise-plan.md` Step 3 mentions that incomplete step folders are available for inspection during the session, lists `TASK.md`, `DECISIONS.md`, and `REVISE_PLAN_NEEDED` as files to read
- `src/prompts/revise-plan.md` Step 4 references checking the trigger step folder for revision context (specifically `REVISE_PLAN_NEEDED`, `TASK.md`, `DECISIONS.md`)
- `defaultInitialMessage` in `src/capabilities/revise-plan.ts` no longer claims "incomplete step folders have been cleaned up"
- `defaultInitialMessage` mentions that incomplete step folders are preserved for inspection (will be cleaned up after completion)
- `npx tsc --noEmit` reports no errors
- Existing tests in `revise-plan.test.ts` still pass — verify with `npx vitest run src/capabilities/revise-plan.test.ts`

## Risks and Edge Cases

- The existing `defaultInitialMessage` test (`CAPABILITY_CONFIG > defaultInitialMessage returns non-empty string containing the goal workspace path`) only checks that the message contains the workspace path. As long as the new text still includes the `${workingDir}` variable, this test will pass.
- Be careful not to change the prompt structure (step numbering, headings) — only update text content. A structural change could confuse agents that rely on section positions.
- The trigger step may be APPROVED (e.g., revision triggered from an approved step's spec). The prompt should still instruct the agent to check it, but the phrasing should handle this gracefully — "the trigger step folder" rather than assuming it's incomplete.
