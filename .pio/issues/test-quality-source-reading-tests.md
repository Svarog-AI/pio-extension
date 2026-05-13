# Evolve-plan generates low-quality source-reading tests instead of behavioral tests

## Problem

During Step 2 (review-rejected-marker), the evolve-plan step produced TEST.md verification items that translated into fragile source-code reading tests — tests that `fs.readFileSync` a `.ts` source file and assert on string patterns like `expect(source).toContain("config.prepareSession")`.

These are not real tests. They:
- Break on any formatting change, whitespace adjustment, or variable rename
- Test implementation structure, not behavior
- Provide zero confidence that the code actually works correctly at runtime
- Violate the TDD principle "test state, not interactions" — they don't even test interactions, they test text

## What happened

7 out of 11 tests in `__tests__/session-capability.test.ts` were source-reading tests:
- `references config.prepareSession inside resources_discover handler` — `expect(source).toContain(...)`
- `invocation is guarded by an existence check (if block)` — line-by-line string scanning
- `invocation uses await` — regex on source text
- `invocation is wrapped in try/catch` — tracking braces via string matching
- `catch block logs a warning with console.warn` — more string scanning
- `invocation happens after enrichedSessionParams assignment` — comparing line numbers from grep-like logic
- `invocation passes workingDir and session params arguments` — regex on source

All 7 were discarded. The 4 remaining tests exercise actual behavior through the public API (`resolveCapabilityConfig`) and are legitimate behavioral tests.

## Root cause

The TEST.md specification listed programmatic verification items like `grep -n 'prepareSession' src/capabilities/session-capability.ts` as test criteria. The execute-task agent faithfully converted these grep checks into "tests" instead of recognizing them as manual verification commands that don't belong in a test file.

## Proposed fix direction

The evolve-plan prompt should distinguish between:
1. **Formal tests** — behavioral unit/integration tests that exercise public APIs, verify state changes, and run through a test runner
2. **Programmatic checks** — shell commands (`npm run check`, `grep`) for acceptance criteria verification

When generating TEST.md, evolve-plan should:
- Prefer formal behavioral tests over source-reading approaches
- Mark grep/structural checks as "programmatic verification" (shell commands), not test cases
- Include guidance: "Do not write tests that read their own source files as strings. Test behavior through public APIs."

## Scope

This affects the `evolve-plan` prompt (`src/prompts/evolve-plan.md`) and potentially the execute-task prompt's handling of TEST.md content.

## Category

improvement

## Context

Related files: src/prompts/evolve-plan.md (TEST.md generation), src/prompts/execute-plan.md (test execution). Example of bad tests: the 7 discarded source-reading tests from S02/__tests__/session-capability.test.ts during the review-rejected-marker goal.
