# Tests: Turn threshold config reading

This verifies that `readTurnThreshold()` correctly reads `guards.turnThreshold` from `~/.pi/pio-config.yaml`, validates the value is a positive integer, and falls back to `DEFAULT_TURN_THRESHOLD` (12) on any invalid or missing configuration.

## Unit Tests

Given a config with `guards.turnThreshold: 20` when `readTurnThreshold()` is called then it returns 20.
Given a config with `guards.turnThreshold: 1` when `readTurnThreshold()` is called then it returns 1.
Given no config file exists when `readTurnThreshold()` is called then it returns `DEFAULT_TURN_THRESHOLD` (12).
Given an empty config file when `readTurnThreshold()` is called then it returns `DEFAULT_TURN_THRESHOLD` (12).
Given a config with `guards` but no `turnThreshold` when `readTurnThreshold()` is called then it returns `DEFAULT_TURN_THRESHOLD` (12).
Given a config with `guards.turnThreshold: 0` when `readTurnThreshold()` is called then it returns `DEFAULT_TURN_THRESHOLD` (12).
Given a config with `guards.turnThreshold: -5` when `readTurnThreshold()` is called then it returns `DEFAULT_TURN_THRESHOLD` (12).
Given a config with `guards.turnThreshold: 3.5` when `readTurnThreshold()` is called then it returns `DEFAULT_TURN_THRESHOLD` (12).
Given a config with `guards.turnThreshold: null` when `readTurnThreshold()` is called then it returns `DEFAULT_TURN_THRESHOLD` (12).
Given a config with `guards.turnThreshold` as a string when `readTurnThreshold()` is called then it returns `DEFAULT_TURN_THRESHOLD` (12).
Given `DEFAULT_TURN_THRESHOLD` is accessed when read directly then it equals 12.

## Programmatic Verification

Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0.
Given the test suite when `npx vitest run src/model-config.test.ts` is run then all tests pass.
