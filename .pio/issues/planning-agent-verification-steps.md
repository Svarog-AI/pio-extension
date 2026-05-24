# Planning agent should not create dedicated verification or check steps

## Problem

The planning agent repeatedly adds a final step like "Verify type-check and test suite" to plans. This is redundant — per-step acceptance criteria already reference programmatic checks (`npx tsc --noEmit`, existing tests pass), and the executor runs these as part of completing each step. The pio-planning skill explicitly states: **"No dedicated test steps."** This rule should extend to verification/check steps too.

## Expected behavior

Each plan step's acceptance criteria already include programmatic checks (type checking, existing tests). A separate "run tsc" or "run tests" step at the end is unnecessary overhead and should never appear in PLAN.md.

The planning prompt and/or pio-planning skill should make this explicit: **no dedicated verification steps** — checks belong in per-step acceptance criteria only.

## Category

improvement

## Context

Relevant files: src/skills/pio-planning/SKILL.md (acceptance criteria guidelines), src/prompts/create-plan.md (planning agent prompt)
