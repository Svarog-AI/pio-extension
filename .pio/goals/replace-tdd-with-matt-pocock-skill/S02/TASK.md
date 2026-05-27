---
skills:
  mandatory:
    - tdd
    - pio-git
---

# Task: Restructure execute-task and review-task prompts for iterative TDD with post-hoc TEST.md

Replace the "horizontal slice" workflow (plan all tests upfront in TEST.md → write all tests → implement everything) with an iterative tracer-bullet approach aligned with the `tdd` skill. TEST.md is still created as a required artifact, but after all tests pass as a summary of what was actually tested — same "Given/when/then" format.

## Context

The current `execute-task.md` enforces a linear workflow: Step 4 creates TEST.md upfront (all test cases planned before any code), Step 5 writes all tests (Red phase), Step 6 implements everything (Green phase). This directly contradicts the `tdd` skill's core advice: "DO NOT write all tests first, then all implementation." The new workflow should match Pocock's tracer-bullet approach: one test → one implementation → repeat, with TEST.md generated post-hoc as a record of what was tested.

## What to Build

Restructure the execute-task prompt from a linear 8-step process (plan tests → write tests → implement) into an iterative workflow where testing and implementation happen together in RED→GREEN cycles. The review-task prompt should be updated to treat TEST.md as a test record rather than a design specification.

### Code Components

#### execute-task.md restructuring — WHAT (prompt) vs HOW (skill)

**Principle:** The capability prompt describes the pio workflow structure — what steps exist, what artifacts to produce, and when. The `tdd` skill describes the TDD methodology — how to do tracer bullets, incremental RED→GREEN cycles, refactoring. Do NOT duplicate tdd-skill content in the prompt.

Replace Steps 4–6 (upfront TEST.md → write all tests → implement everything) with a single iterative step. The new structure:

- **Step 1:** Read GOAL.md and PLAN.md for context (unchanged)
- **Step 2:** Read TASK.md and (if needed) DECISIONS.md (unchanged)
- **Step 3:** Research supporting context (unchanged)
- **Step 4:** Iterative TDD (NEW — replaces old Steps 4–6)
- **Step 5:** Run all verification (was Step 7)
- **Step 6:** Verify non-test acceptance criteria (was Step 8)
- **Step 7:** Handle user-requested changes (keep as-is but update step references)
- **Step 8:** Write completion artifacts (was Step 9)

The new Step 4 should describe WHAT to do:
1. Follow the mandatory `tdd` skill for the TDD methodology (tracer bullet → incremental RED→GREEN cycles → refactor). The skill contains all HOW details — do not restate them in the prompt.
2. After all tests pass and refactoring is done, create `TEST.md` as a post-hoc summary record of what was actually tested. Use the same "Given ____ when ____ then ____" format. Include programmatic verification commands below unit test entries.
3. Emphasize: TEST.md is created AFTER implementation, not before. This is the key pio-specific deviation from traditional TDD documentation.

Update the intro paragraph: replace "derive test cases from the acceptance criteria using TDD methodology, write tests first, then implement the feature code to make them pass" with language describing the iterative workflow and referencing the tdd skill. Example direction: "Read TASK.md, apply TDD iteratively following the `tdd` skill (tracer bullet → incremental cycles), and create TEST.md after all tests pass as a summary of what was tested."

Update Guidelines section: replace "Test-first discipline. Write tests before feature code. If tests don't fail initially, they aren't testing anything new." with guidance referencing the tdd skill for methodology and emphasizing the iterative nature (no upfront test planning).

#### execute-task.ts defaultInitialMessage update

The `defaultInitialMessage` function currently says:
```
Read TASK.md inside the `${folderName}/` directory, create TEST.md with concise test cases, write tests first, then implement the feature to make them pass.
```

This is too prescriptive — it describes HOW to work (methodology instructions) instead of WHAT to do. Following the convention of other capabilities (create-plan: "Create PLAN.md", evolve-plan: "Generate TASK.md"), simplify to a task directive:

The new message should simply tell the agent where TASK.md is and that they need to resolve it. Something like:
```
Goal workspace is at ${workingDir}. You are responsible for **Step ${stepNumber}**. Read TASK.md inside the `${folderName}/` directory and resolve the task.
```

The HOW (TDD methodology, iterative workflow, post-hoc TEST.md) is entirely in `execute-task.md` (the capability prompt) and the `tdd` skill. The initial message should not duplicate or summarize that — it should just point to the task spec.

#### review-task.md TEST.md references

Update the following references in `review-task.md`:
- Step 2 description: "TEST.md — the test plan specifying exactly what must pass" → "TEST.md — the test record documenting what was tested during implementation"
- CRITICAL severity bullet: "Tests that deviate from what TEST.md specifies (the design spec)" → remove "the design spec" qualifier and rephrase to focus on whether tests cover important behavior

The reviewer still uses TEST.md for coverage verification but no longer treats it as a contract against which implementation deviations are flagged. The authority hierarchy section should be updated: change "Test (TEST.md) — formal specification and verification contract" to something reflecting that TEST.md is a record of what was tested, not a pre-written specification.

#### review-task.ts defaultInitialMessage and tool description

The `defaultInitialMessage` currently says:
```
Read TASK.md, TEST.md, and SUMMARY.md inside the `${folderName}/` directory. Review the implementation, write REVIEW.md, and decide whether to approve or reject.
```

This is generic enough that it doesn't need changes — it lists files to read without characterizing TEST.md as a "test plan." No change needed here.

The `reviewTaskTool.description` says:
```
"Review the implementation of a plan step. Reads TASK.md, TEST.md, SUMMARY.md and implementation files..."
```

This is also generic — no mention of "test plan." No change needed here either.

### Approach and Decisions

- Follow the existing prompt structure and formatting conventions in `execute-task.md` (markdown headings, code blocks for examples)
- Prompt vs skill discipline: the capability prompt describes WHAT to do and WHEN. All TDD HOW details (tracer bullets, incremental loop rules, refactor candidates) live exclusively in the `tdd` skill. The new Step 4 should reference the skill, not duplicate it.
- Per DECISIONS.md: `resolveExecuteValidation` still returns `TEST_FILE` as required — the validation infrastructure is unchanged. The prompt changes timing (post-hoc) but TEST.md still exists
- Step numbering must be sequential with no gaps after restructuring
- Update step references throughout (e.g., "Step 7" becomes "Step 5", "Step 8" becomes "Step 6", "Step 9" becomes "Step 8")
- The "Handling user-requested changes" section currently says "After initial implementation is complete (from Step 6 onward)" — update to reference new step numbers

## Skills

No additional skills recommended beyond the mandatory `pio` and `tdd` skills. The executor needs to understand the iterative TDD approach from the `tdd` skill to properly specify the new workflow step.

## Dependencies

Step 1 must be completed (all references renamed from "test-driven-development" to "tdd"). Step 1 is COMPLETED and APPROVED.

## Files Affected

- `src/prompts/execute-task.md` — replace Steps 4–6 with single iterative TDD step, add post-hoc TEST.md instruction, renumber remaining steps (7→5, 8→6, user-requested-changes→7, 9→8), update intro paragraph, update Guidelines "Test-first discipline" bullet
- `src/capabilities/execute-task.ts` — simplify `defaultInitialMessage` to a task directive pointing to TASK.md (no methodology instructions)
- `src/prompts/review-task.md` — update TEST.md references from "test plan specifying what must pass" / "design spec contract" to "test record documenting what was tested", update authority hierarchy description
- `src/capabilities/review-task.ts` — no changes needed (current wording is generic enough)

## Acceptance Criteria

### Prompt structure (WHAT)
- `src/prompts/execute-task.md` contains no Step 4 about creating TEST.md upfront or the "Given ____ when ____ then ____" planning format as a pre-implementation requirement
- `src/prompts/execute-task.md` instructs agents to follow the mandatory `tdd` skill for TDD methodology (tracer bullet, incremental RED→GREEN cycles, refactoring) — referencing the skill rather than restating its HOW details in the prompt
- `src/prompts/execute-task.md` instructs generating TEST.md after all tests pass, using the same "Given ____ when ____ then ____" format as a summary record
- `src/prompts/execute-task.md` does NOT contain tracer bullet mechanics, incremental loop rules, or refactor candidate lists — those HOW details belong exclusively in the `tdd` skill
- Step numbering in `src/prompts/execute-task.md` is sequential with no gaps after restructuring (Steps 1–8 or equivalent)
- All internal step references are updated to match new numbering (e.g., old "Step 7" → "Step 5", old "Step 8" → "Step 6")

### Capability config
- `src/capabilities/execute-task.ts` `defaultInitialMessage` is a simple task directive pointing to TASK.md — following the convention of other capabilities (create-plan: "Create PLAN.md", evolve-plan: "Generate TASK.md"). Must NOT contain methodology instructions like "create TEST.md with concise test cases" or "write tests first, then implement"

### Review prompt
- `src/prompts/review-task.md` references TEST.md as a test record/summary rather than a design spec or contract — must NOT contain "the test plan specifying exactly what must pass"

### Programmatic verification
- `npm run check` (`tsc --noEmit`) reports no errors
- Full test suite passes: `npx vitest run` exits with code 0

## Risks and Edge Cases

- **Prompt vs skill boundary:** The executor must resist the urge to duplicate tdd-skill HOW details in the prompt. The new Step 4 should reference the `tdd` skill for methodology, not restate tracer bullets, incremental rules, or refactor candidates. If the temptation is high, ask yourself: "does this describe WHAT to do or HOW to do it?" — if HOW, it belongs in the skill.
- **Tests that assert on execute-task.ts `defaultInitialMessage`:** There are no existing tests that assert the exact text of `defaultInitialMessage`, but verify the test suite still passes. The function is indirectly tested through capability config resolution.
- **Review-task.md CRITICAL severity rule:** The "Test quality deviations" bullet currently says "Tests that deviate from what TEST.md specifies (the design spec)." This needs careful rephrasing — the reviewer should still flag tests that don't cover important behavior, but should not treat TEST.md as a rigid contract.
- **Authority hierarchy:** Changing TEST.md's position in the authority hierarchy could affect how reviewers handle discrepancies. Ensure the hierarchy section is updated consistently.
