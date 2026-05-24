# Decisions (carried from Steps 1–2)

## Implementation Architecture

- **`cleanupIncompleteSteps` scans disk, not PLAN.md frontmatter:** Uses `STEP_FOLDER_RE` (`/^S(\d+)$/`) to find `S{NN}/` folders on disk. This handles the post-revision state where the new `PLAN.md` may list different steps than what's on disk. Impacts integration tests — they must verify cleanup works with mismatched frontmatter vs. actual folders (already covered by a dedicated test).

## Prompt and Messaging

- **Prompt structure preserved, content updated:** The revise-plan prompt now tells the agent that incomplete step folders are preserved for inspection during the session. Step 4 explicitly directs reading trigger step files (`REVISE_PLAN_NEEDED`, `TASK.md`, `DECISIONS.md`).
- **`defaultInitialMessage` references trigger step files:** When `revisionTriggerStep` is provided, the initial message directs the agent to read trigger step files for revision context.
