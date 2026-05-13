# Agent falls into repetitive edit loops on minor refinements

## Problem

When the user corrects a detail in TASK.md/TEST.md, the agent often enters a loop: it makes the requested fix, then immediately tries to "improve" the same paragraph with a minor rewording, and keeps repeating this pattern across multiple turns.

## Example (from review-rejected-marker Step 3)

1. User says "APPROVED shouldn't win, REJECTED should win" + "why rejectedAfterReview?"
2. Agent rewrites both files — correct content
3. User asks about timing of marker creation relative to transition checks
4. Agent adds a timing note — correct content
5. User says "it must happen before validateOutputs"
6. Agent edits the same paragraph again — slightly different wording, same information
7. User calls out "you are in a loop?"
8. Agent edits the *same paragraph* again — yet another rewording
9. User asks "why do you often go into a loop?"

## Root Cause

The agent treats its own fix as something that still needs refinement. After applying a correction, instead of accepting the result and moving on, it reaches for another edit to polish wording that is already correct. The information doesn't change between iterations — only the phrasing does.

## Desired Behavior

- Make **one clean edit** per correction
- After fixing, verify once, then move to `pio_mark_complete`
- Do not iteratively polish paragraphs that are already factually correct

## Category

bug

## Context

Observed during specification writing for .pio/goals/review-rejected-marker Step 3 (TASK.md timing note paragraph). The same paragraph was edited 4+ times with no new information added after the first fix.
