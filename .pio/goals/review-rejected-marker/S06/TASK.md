# Task: Require YAML frontmatter in the review prompt

Update `src/prompts/review-code.md` to require YAML frontmatter in `REVIEW.md` and remove manual marker-file instructions from the review agent.

## Context

The review-code session currently instructs the agent to manually write `APPROVED` files and delete `COMPLETED` on rejection (Step 8). With Steps 1–5 complete, the infrastructure now handles markers automatically via `pio_mark_complete`. The prompt must be updated so the agent: (1) writes structured YAML frontmatter at the top of `REVIEW.md`, and (2) no longer manages marker files directly. This is a prompt-only change — no source code modifications.

## What to Build

Modify `src/prompts/review-code.md` to update two sections:

### Step 7 Changes — Require YAML Frontmatter in REVIEW.md

The agent must write a YAML frontmatter block at the very top of `REVIEW.md`, before any markdown headings. The format:

```yaml
---
decision: APPROVED | REJECTED
criticalIssues: <number>
highIssues: <number>
mediumIssues: <number>
lowIssues: <number>
---
```

The frontmatter fields are:
- `decision` — either `APPROVED` or `REJECTED` (authoritative outcome for automation)
- `criticalIssues`, `highIssues`, `mediumIssues`, `lowIssues` — integer counts of issues found at each severity level

After the frontmatter block, the existing markdown structure continues as before (`# Code Review: ...`, `## Decision`, etc.). The human-readable `## Decision` section must remain in the body (preserves readability) but the frontmatter is the source of truth for programmatic parsing.

### Step 8 Changes — Remove Manual Marker Instructions

Remove all instructions about manually writing `APPROVED` files, deleting `COMPLETED`, or managing marker files. Replace with simplified instructions:

1. The agent writes only `REVIEW.md` (with frontmatter).
2. The agent calls `pio_mark_complete`.
3. Infrastructure automatically creates `APPROVED`/`REJECTED` markers based on the frontmatter `decision` field.
4. On rejection, infrastructure deletes `COMPLETED` automatically.

Make it clear that marker management is handled by automation — the agent should not attempt to create or delete marker files.

## Dependencies

- Step 5 (APPROVED): Write allowlist simplified to REVIEW.md only, `prepareSession` added
- Step 7 (not yet implemented but referenced): Automatic marker creation at `pio_mark_complete` depends on frontmatter parsing — this prompt change is the contract that ensures frontmatter exists

## Files Affected

- `src/prompts/review-code.md` — modified: update Steps 7 and 8

## Acceptance Criteria

- [ ] Step 7 includes the YAML frontmatter format specification with all five required fields (`decision`, `criticalIssues`, `highIssues`, `mediumIssues`, `lowIssues`)
- [ ] Step 7 shows an example of valid frontmatter (both APPROVED and REJECTED examples or a combined example)
- [ ] Step 7 states that the frontmatter block appears at the very top of REVIEW.md, before any markdown headings
- [ ] Step 8 removes all manual marker instructions (no more "write APPROVED file" or "delete COMPLETED")
- [ ] Step 8 instructs agent to call `pio_mark_complete` — automation handles markers
- [ ] Step 8 explicitly states the agent writes only REVIEW.md and does not create/delete marker files
- [ ] The human-readable `## Decision` section is still required in the markdown body (after frontmatter)
- [ ] The existing review process (Steps 1–6) remains unchanged — analysis dimensions, issue categorization, approval rules are preserved

## Risks and Edge Cases

- **Prompt clarity:** Ensure the instructions are unambiguous — the agent should understand it writes frontmatter as part of REVIEW.md, not as a separate file.
- **Backwards compatibility with existing reviews:** Old REVIEW.md files without frontmatter will fail validation when Step 7 (automatic marker creation) is implemented. This is intentional per GOAL.md but should be clear in the prompt if relevant.
- **Agent confusion about decision placement:** Make it clear that `## Decision` in the body and `decision` in frontmatter must match — they are redundant by design (frontmatter for machines, body for humans).
