# Tests: Create-plan validation and list-goals recursion

This verifies that `postValidateCreatePlan` rejects duplicate subgoal names, and that `list-goals` recursively discovers nested subgoals with hierarchical display names.

## Unit Tests: postValidateCreatePlan — unique subgoal names

Given a plan with unique subgoal names when postValidateCreatePlan is called then it returns success.
Given a plan with duplicate subgoal names when postValidateCreatePlan is called then it returns failure with the duplicate name in the message.
Given a plan with duplicate names on regular task steps when postValidateCreatePlan is called then it returns success (only subgoal names must be unique).
Given a plan with one subgoal and one task sharing the same name when postValidateCreatePlan is called then it returns success (cross-type duplicates are allowed).
Given a plan with three subgoals where two share a name when postValidateCreatePlan is called then it returns failure identifying the duplicate.

## Unit Tests: list-goals recursive subgoal discovery

Given a goal with no subgoals when findSubgoals is called then it returns an empty array.
Given a goal with one subgoal in S03/subgoals/nested-feature/ when findSubgoals is called then it returns one entry with hierarchical display name.
Given a goal with subgoals in multiple step folders when findSubgoals is called then it returns entries for all subgoals.
Given a deeply nested subgoal (subgoal within a subgoal) when findSubgoals recurses then it discovers the nested subgoal with correct display name.
Given a subgoals directory without GOAL.md when findSubgoals is called then it is not listed as a subgoal.
Given an empty subgoals directory when findSubgoals is called then it returns no entries for that step.

## Programmatic Verification

Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the full test suite when npx vitest run is executed then all tests pass with no regressions.
