---
name: execute-plan
description: Implement all steps from an existing plan in a single session
---
Launches an Implementation Agent session that reads GOAL.md and PLAN.md, then executes every step sequentially — following dependencies, making code changes, and verifying acceptance criteria.

**Usage:** `/pio-execute-plan <name>` (command only, no tool). Requires both GOAL.md and PLAN.md to exist in the goal workspace.

**Output:** All code changes described in PLAN.md steps, implemented and verified in one session.
