---
name: execute-task
description: Implement a single plan step using a test-first workflow (TDD)
---
Launches an Execute Task Agent that reads `TASK.md` and `TEST.md` from a step folder, writes tests first, then implements the feature to make them pass. On completion it produces `COMPLETED` or `BLOCKED` markers plus a `SUMMARY.md` changelog.

**Usage:** `/pio-execute-task <goal-name> [step-number]` or call `pio_execute_task` tool with `name` (and optional `stepNumber`) parameters. Omits step number to auto-find the next ready step (has specs but no completion marker).

**Output:** `.pio/goals/<name>/S{NN}/COMPLETED` (or `BLOCKED`) + `.pio/goals/<name>/S{NN}/SUMMARY.md` — status marker and changelog for one plan step.

**Workflow cycle:** `evolve-plan` produces specs → `execute-task` implements step → `evolve-plan` moves to next step.
