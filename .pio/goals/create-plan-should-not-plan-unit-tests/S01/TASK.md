# Task: Add test-responsibility boundary guidance to create-plan prompt

Modify `src/prompts/create-plan.md` so the Planning Agent never creates dedicated "write unit tests" plan steps — that responsibility belongs to `evolve-plan` (TEST.md) and `execute-task`.

## Context

The `create-plan` prompt currently instructs: *"Specify how each step is verified — don't write tests yourself."* In practice, the Planning Agent misinterprets this and produces plans with dedicated "Write tests for X module" steps or detailed unit test structure at the PLAN level. Meanwhile, `evolve-plan` already handles per-step testing through TEST.md generation, and `execute-task` writes and runs the actual tests.

The responsibility split should be:
- **create-plan:** Acceptance criteria per step (how to verify completion)
- **evolve-plan:** TEST.md per step (unit tests, specific test cases, verification commands)
- **execute-task:** Write and run the actual unit tests described in TEST.md

## What to Build

Four targeted changes to the Guidelines section of `src/prompts/create-plan.md`:

### 1. Add explicit prohibition

Insert a new guideline stating that the Planning Agent must not create dedicated plan steps for writing unit tests or specifying test file structure. Acceptance criteria describe how to verify step completion; testing is handled per-step by `evolve-plan` (which generates TEST.md) and `execute-task` (which writes and runs tests).

### 2. Add integration-test exception

Clarify that while per-step unit tests are off-limits, the Planning Agent may include an integration verification step near the end of a plan when the goal requires cross-module or end-to-end verification spanning multiple steps. Distinguish this explicitly from per-step unit testing.

### 3. Add good vs bad examples

Include concrete examples directly in the guideline to disambiguate acceptable acceptance criteria from test-planning language:
- Good: "`npx tsc --noEmit` reports no errors" (programmatic verification)
- Good: "new function is exported from `src/auth/index.ts`" (verifiable fact)
- Bad: "unit tests for X cover all edge cases" (that's evolve-plan/execute-task territory)

### 4. Reword existing ambiguous language

The current guideline reads: *"Specify how each step is verified — don't write tests yourself."* The phrase "don't write tests yourself" can be misinterpreted as encouragement to plan test structure. Replace it with clearer language that distinguishes acceptance criteria (how to verify a step is done) from test implementation (handled by evolve-plan).

## Code Components

This task modifies a single markdown prompt file. No TypeScript code, types, or module interfaces are involved. The change is self-contained within the Guidelines section of `src/prompts/create-plan.md`.

### Approach and Decisions

- Modify only the Guidelines section — do not alter Step definitions, Process steps, or Example Interaction Flow
- Place the new test-responsibility guideline near the existing acceptance-criteria guideline (the one containing "don't write tests yourself") so they read as a coherent block
- Keep the prohibition language direct and unambiguous — use "must not" rather than "should avoid"
- The examples should use backtick formatting consistent with other guidelines in the file

## Dependencies

None. This is Step 1 with no prerequisites.

## Files Affected

- `src/prompts/create-plan.md` — modify Guidelines section: add new test-responsibility guideline, reword existing ambiguous guideline

## Acceptance Criteria

- [ ] `src/prompts/create-plan.md` contains an explicit statement prohibiting dedicated "write tests" or "add unit tests" plan steps, referencing `evolve-plan` and `TEST.md` as the correct ownership boundary
- [ ] `src/prompts/create-plan.md` includes an exception allowing integration verification steps that span multiple plan steps
- [ ] `src/prompts/create-plan.md` contains concrete examples of good acceptance criteria (programmatic checks) and bad ones (test-planning language)
- [ ] The ambiguous phrase "don't write tests yourself" is removed or replaced with unambiguous language
- [ ] No other files were modified (change is scoped to `src/prompts/create-plan.md` only)

## Risks and Edge Cases

- **Self-referential modification:** We're modifying the prompt that governs the Planning Agent itself. The new wording should be clear enough that future planning sessions naturally produce correct behavior.
- **Scope creep risk:** Ensure no other guidelines or sections are accidentally modified. The change must be localized to the Guidelines section only.
- **Ambiguity in "integration exception":** The exception for integration steps should be narrowly defined so it doesn't become a loophole for unit test planning. Explicitly distinguish "cross-module verification" from "per-step unit tests."
