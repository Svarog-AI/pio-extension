---
name: create-goal
description: Create a new goal workspace and define the scope of work
---
Launches a Goal Definition Assistant session that interviews you about a feature or fix, then produces GOAL.md with current state analysis and target description.

**Usage:** `/pio-create-goal <name>` or call `pio_create_goal` tool with a `name` parameter.

**Output:** `.pio/goals/<name>/GOAL.md` — a structured goal definition document with Current State and To-Be State sections.
