# Review must reject tests that check prompt/markdown content with string assertions

## Problem

TEST.md for Step 3 (finalize-goal prompt) specified 9 "unit tests" in `src/index.test.ts` that test a markdown prompt file using string containment checks:

- `expect(content).toMatch(/pio-project-knowledge/i)` 
- `expect(content).toContain("DECISIONS.md")`
- etc.

These are meaningless tests — they verify presence of keywords in a text document, not behavior. They provide zero value: the prompt is correct or it isn't, which a regex match for "pio-project-knowledge" doesn't prove. The pre-existing `project-context.md` tests used this exact same useless pattern.

## Decision

These content-testing tests should **not** be written. When TEST.md specifies tests that verify markdown/file content via string assertions (`toContain`, `toMatch`), treat them as meaningless and do not implement them. If the execute-task agent is generating such tests, flag this in REVIEW.md as a CRITICAL issue — **"Meaningless tests"** per the classification rules.

## Action Required

Update `src/prompts/review-code.md` to include an explicit rule: **reject content-testing tests as meaningless.** The review agent should classify TEST.md specifications that test non-code artifacts (prompts, markdown docs) using string containment assertions as CRITICAL — "Tests that don't make sense for the domain. Tests that verify irrelevant properties or use incorrect assertions for the domain being tested."

This prevents:
1. Wasted effort writing useless tests
2. False confidence from passing content checks
3. Accumulation of dead test code (these break when prompts change for legitimate reasons)

## Precedent

- Step 3 (finalize-goal): 9 planned content tests were correctly not written, existing `project-context.md` tests removed
- This pattern should be called out explicitly in the review prompt so future review agents know to reject it

## Category

improvement

## Context

File: src/prompts/review-code.md — needs a new rule about rejecting content-testing tests as meaningless/CRITICAL. Related to S03/finalize-goal where this pattern appeared in TEST.md.
