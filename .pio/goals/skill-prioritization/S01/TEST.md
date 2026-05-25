# Tests: CapabilitySkills type definitions

This verifies that the `CapabilitySkills` interface is correctly defined and that both `StaticCapabilityConfig` and `CapabilityConfig` accept the optional `skills` field. Tests are compile-time type verifications — the types must compile correctly with the new field.

## Unit Tests

Given a CapabilitySkills object with only mandatory skills when assigned to a variable then it compiles without errors.
Given a CapabilitySkills object with only recommended skills when assigned to a variable then it compiles without errors.
Given a CapabilitySkills object with both mandatory and recommended skills when assigned to a variable then it compiles without errors.
Given a StaticCapabilityConfig with the skills field when assigned to a variable then it compiles without errors.
Given a StaticCapabilityConfig without the skills field when assigned to a variable then it compiles without errors (backward compatibility).
Given a CapabilityConfig with the skills field when assigned to a variable then it compiles without errors.
Given a CapabilityConfig without the skills field when assigned to a variable then it compiles without errors (backward compatibility).
Given CapabilitySkills.mandatory is an optional string array when accessed then it is undefined by default.
Given CapabilitySkills.recommended contains objects with name and condition when accessed then both fields are strings.
Given CapabilitySkills is imported from src/types.ts when used in a test file then the import resolves correctly.

## Programmatic Verification

Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the test suite when npm test is run then all tests pass with no regressions.
