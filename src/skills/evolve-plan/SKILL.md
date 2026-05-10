---
name: evolve-plan
description: Generate a detailed specification (TASK.md + TEST.md) for the next incomplete plan step
---
Launches a Specification Writer session that takes one step from PLAN.md and produces TASK.md and TEST.md in an `S{NN}/` folder with concrete implementation details and TDD-style test plan.

**Usage:** `/pio-evolve-plan <name>` or call `pio_evolve_plan` tool with a `name` parameter (goal name). Automatically finds the next incomplete step.

**Output:** `.pio/goals/<name>/S{NN}/TASK.md` and `.pio/goals/<name>/S{NN}/TEST.md` — focused specification and test plan for one plan step.
