---
name: create-plan
description: Create a detailed implementation plan for an existing goal
---
Launches a Planning Agent session that reads GOAL.md and produces PLAN.md — a step-by-step implementation plan with acceptance criteria, file references, and ordering.

**Usage:** `/pio-create-plan <name>` or call `pio_create_plan` tool with a `name` parameter (goal name under `.pio/goals/`).

**Output:** `.pio/goals/<name>/PLAN.md` — numbered steps with descriptions, acceptance criteria, and affected files.
