---
name: review-code
description: Review the implementation of a plan step (approve or reject based on code quality)
---
Launches a Code Review Agent that reads `TASK.md`, `TEST.md`, and `SUMMARY.md` from a completed step folder, examines the actual implementation files, and writes `REVIEW.md` with categorized findings. After review, it approves (writes `APPROVED` marker to proceed) or rejects (deletes `COMPLETED` to re-execute).

**Usage:** `/pio-review-code <goal-name> [step-number]` or call `pio_review_code` tool with `name` (and optional `stepNumber`) parameters. Omits step number to auto-find the most recently completed step.

**Output:** `.pio/goals/<name>/S{NN}/REVIEW.md` — structured review with issues by criticality, test coverage analysis, and approval decision. Optionally `.pio/goals/<name>/S{NN}/APPROVED` marker on approval.

**Conditional workflow cycle:** `execute-task` implements step → `review-code` reviews (approve → `evolve-plan` advances to next step; reject → deletes COMPLETED → `execute-task` re-executes same step).
