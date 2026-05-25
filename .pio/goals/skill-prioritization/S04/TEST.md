# Tests: Capability skill config wiring

Verifies that all 9 capability modules have the correct `skills` field in their `CAPABILITY_CONFIG`, matching the mapping table from GOAL.md.

## Unit Tests

Given the create-goal CAPABILITY_CONFIG when skills is read then mandatory is [pio-planning, grill-me, pio-git] and recommended includes source-research.
Given the create-plan CAPABILITY_CONFIG when skills is read then mandatory is [pio-planning, grill-me] and recommended includes source-research.
Given the evolve-plan CAPABILITY_CONFIG when skills is read then mandatory is [pio-planning, grill-me] and recommended is undefined.
Given the execute-task CAPABILITY_CONFIG when skills is read then mandatory is [test-driven-development, pio-git] and recommended is undefined.
Given the review-task CAPABILITY_CONFIG when skills is read then mandatory is [test-driven-development] and recommended is undefined.
Given the execute-plan CAPABILITY_CONFIG when skills is read then mandatory is [test-driven-development, pio-git] and recommended is undefined.
Given the revise-plan CAPABILITY_CONFIG when skills is read then mandatory is [pio-planning, grill-me] and recommended includes source-research.
Given the project-context CAPABILITY_CONFIG when skills is read then mandatory is [pio-project-knowledge] and recommended includes source-research.
Given the finalize-goal CAPABILITY_CONFIG when skills is read then mandatory is [pio-project-knowledge, pio-git] and recommended is undefined.
Given create-goal, create-plan, and revise-plan recommended source-research when condition text is compared then all three use "when researching existing solutions or libraries".
Given project-context recommended source-research when condition text is read then it uses "when researching project dependencies or external tools".
Given capabilities with no recommended skills when the recommended key is inspected then it is omitted entirely (not an empty array).

## Programmatic Verification

Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the existing test suite when npm test is run then all tests pass with no regressions.
