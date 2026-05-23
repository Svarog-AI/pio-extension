# Reformat TEST.md Given-When-Then pattern for better readability

## Problem

The current TEST.md format requires each test case as a single long sentence:

> Given ____ when ____ then ____

These tend to become unwieldy one-liners that are hard to scan, especially for complex scenarios with multiple preconditions or multi-part outcomes.

## Proposed Change

Reformat to a more readable structure, e.g.:

- Use line breaks or bullet lists within each test case
- Allow `Given`/`When`/`Then` as sub-bullets under each test
- Keep the semantic structure but improve visual scannability

## Scope

- `src/prompts/evolve-plan.md` — TEST.md format instructions for the specification writer
- `src/prompts/execute-task.md` — TEST.md format instructions for the execute-task agent
- Any related skill documentation that references the TEST.md format

## Category

improvement

## Context

Current format example from evolve-plan.md instructions: "Given a flat goal name when resolveGoalDir is called then it returns the .pio/goals/<name>/ path." — these single-sentence test cases become hard to read when preconditions or outcomes are complex.
