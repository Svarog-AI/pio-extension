# Decisions (carried from Step 1)

## Implementation Architecture

- **`cleanupIncompleteSteps` scans disk, not PLAN.md frontmatter:** Uses `STEP_FOLDER_RE` (`/^S(\d+)$/`) to find `S{NN}/` folders on disk. This handles the post-revision state where the new `PLAN.md` may list different steps than what's on disk. Impacts Step 3 integration tests — they must verify cleanup works with mismatched frontmatter vs. actual folders.
