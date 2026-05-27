# Strengthen create-goal probing gate to prevent skipped feasibility checks

The Goal Definition Assistant skips Step 3 (Probing Gate) when the user's request appears well-structured, leading to missed feasibility blockers and approach misalignment.

## Problem

During goal definition for `improve-pio-jira-config-setup`, the agent wrote GOAL.md without probing four critical dimensions:
- **Approach:** docs-only vs tool vs script (discovered only after 2 user corrections)
- **Constraints:** `.pio/` write restrictions in sub-sessions (never surfaced proactively)
- **Consumer model:** agents vs humans (left as an assumption)

Result: 3 goal-definition sessions to converge on what one round of probing would have resolved.

## Root Cause

1. `"If the user's description is already clear, skip probing and proceed"` — explicit permission to skip
2. Probing as a separate Step 3 creates a binary decision point ("do I need this?") that defaults to no when input looks good
3. No mechanism to force dimension checks before committing to GOAL.md

## Proposed Fixes

See `src/prompts/create-goal.md`:

1. **Remove the "skip if clear" escape hatch** — probing runs unconditionally
2. **Weave probing into Step 1** — ask feasibility/constraint questions during understanding, not as a separate gate
3. **Require explicit dimension checklist** before writing GOAL.md (feasibility, scope, constraints, consumers)
4. **Warn against structured-input complacency** — "A well-structured request does not imply the approach is settled"

## Category

improvement

## Context

File: src/prompts/create-goal.md (Step 3: Probing Gate). Observed in goal: improve-pio-jira-config-setup.
