# Plan: Clarify test responsibility boundary in create-plan prompt

Add explicit guidance to `src/prompts/create-plan.md` so the Planning Agent never creates dedicated "write unit tests" steps — that responsibility belongs to `evolve-plan` (TEST.md) and `execute-task`.

## Prerequisites

None.

## Steps

### Step 1: Add test-responsibility boundary guidance to create-plan prompt

**Description:** Modify `src/prompts/create-plan.md` to enforce the responsibility split between planning-level acceptance criteria and per-step test specification. This involves four changes all within the Guidelines section of the prompt:

1. **Add explicit prohibition:** Insert a new guideline stating that the Planning Agent must not create dedicated plan steps for writing unit tests or specifying test structure. Acceptance criteria describe how to verify completion; testing is handled per-step by `evolve-plan` (which generates TEST.md) and `execute-task` (which writes and runs tests).

2. **Add integration-test exception:** Clarify that while per-step unit tests are off-limits, the Planning Agent may include an integration verification step near the end of a plan when the goal requires cross-module or end-to-end verification spanning multiple steps. Distinguish this explicitly from per-step unit testing.

3. **Add good vs bad examples:** Include concrete examples directly in the guideline to disambiguate acceptable acceptance criteria from test-planning language:
   - Good: "`npx tsc --noEmit` reports no errors" (programmatic verification)
   - Good: "new function is exported from `src/auth/index.ts`" (verifiable fact)
   - Bad: "unit tests for X cover all edge cases" (that's evolve-plan/execute-task territory)

4. **Reword existing ambiguous language:** The current guideline reads: *"Specify how each step is verified — don't write tests yourself."* The phrase "don't write tests yourself" can be misinterpreted as encouragement to plan test structure. Replace it with clearer language that distinguishes acceptance criteria (how to verify a step is done) from test implementation (handled by evolve-plan).

**Acceptance criteria:**
- [ ] `src/prompts/create-plan.md` contains an explicit statement prohibiting dedicated "write tests" or "add unit tests" plan steps, referencing `evolve-plan` and `TEST.md` as the correct ownership boundary
- [ ] `src/prompts/create-plan.md` includes an exception allowing integration verification steps that span multiple plan steps
- [ ] `src/prompts/create-plan.md` contains concrete examples of good acceptance criteria (programmatic checks) and bad ones (test-planning language)
- [ ] The ambiguous phrase "don't write tests yourself" is removed or replaced with unambiguous language
- [ ] No other files were modified (change is scoped to `src/prompts/create-plan.md` only)

**Files affected:**
- `src/prompts/create-plan.md` — add new guideline text, reword existing ambiguous guideline

## Notes

- This goal is intentionally self-referential: we're modifying the prompt that governs the Planning Agent (including ourselves). The changes should be clear enough that future planning sessions naturally produce the correct behavior.
- `src/prompts/evolve-plan.md` already handles TEST.md correctly — no changes needed there per GOAL.md scope.
- `src/capabilities/create-plan.ts` configures this capability with `writeAllowlist: ["PLAN.md"]`, confirming the prompt file is not protected as read-only from the executor's perspective (the executor modifies `create-plan.md`, not `PLAN.md` — PLAN.md is the goal workspace output).
