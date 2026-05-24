# Avoid content-based tests for prompt and message string changes

Prompt and message updates (e.g., Step 2 of `s03-content-deleted-before-revision-analysis`) should not be tested with string-matching unit tests against `.md` file contents or template literal text. These are fragile, brittle content tests that break on any rewording and don't verify actual behavior.

## Problem

Tests like these add no real confidence:
- Reading a `.md` prompt file and asserting `toContain("TASK.md")`
- Calling `defaultInitialMessage()` and asserting `not.toMatch(/cleaned up/i)`

They test that specific words appear in text — not that behavior is correct. Any rewording of the prompt breaks the test without indicating a real regression.

## Recommendation

For text-only changes to prompts and messages:
- Rely on programmatic verification (`tsc --noEmit`, existing test suite passes)
- Skip unit tests entirely when the change is purely textual with no behavioral code impact
- Document in TEST.md that no unit tests apply; use acceptance criteria verification instead

## Category

improvement

## Context

File: src/capabilities/revise-plan.test.ts — "revise-plan.md prompt content" and "defaultInitialMessage" describe blocks (added in Step 2). These test string content of prompts/messages via regex matching.
