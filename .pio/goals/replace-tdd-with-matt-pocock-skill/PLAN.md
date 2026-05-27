---
totalSteps: 3
steps:
  - name: rename-all-references
    complexity: task
  - name: refactor-prompts-for-iterative-tdd
    complexity: task
  - name: delete-old-skill-and-verify
    complexity: task
---

# Plan: replace-tdd-with-matt-pocock-skill

Replace the `test-driven-development` skill with Matt Pocock's `tdd` skill by updating all references, restructuring prompts for an iterative TDD workflow (tracer bullet → incremental RED→GREEN cycles), and deleting the old skill. TEST.md is retained as a required artifact but created post-hoc as a summary record after all tests pass, using the same "Given/when/then" format.

## Prerequisites

None. The `src/skills/tdd/` directory already exists with all 6 files from Matt Pocock's repository. Step 1 has renamed all code references to `tdd`.

## Steps

### Step 1: Rename all references to the new skill name [COMPLETED]

Renamed `test-driven-development` to `tdd` in all capability config `mandatory` arrays, prompt examples, and test data. Pure string replacements across 10 files — no logic changes.

**Status:** COMPLETED — implementation approved, do not modify.

### Step 2: Restructure execute-task and review-task prompts for iterative TDD with post-hoc TEST.md

Replace the "horizontal slice" workflow (plan all tests upfront in TEST.md → write all tests → implement everything) with an iterative tracer-bullet approach aligned with the `tdd` skill. TEST.md is still created as a required artifact, but after all tests pass as a summary of what was actually tested — same "Given/when/then" format.

**Description:**

The current execute-task.md enforces a linear workflow: Step 4 creates TEST.md upfront (all test cases planned before any code), Step 5 writes all tests (Red phase), Step 6 implements everything (Green phase). This contradicts the `tdd` skill's core advice: "DO NOT write all tests first, then all implementation."

Replace Steps 4–6 with a single iterative step describing: tracer bullet (one test for one behavior → minimal code to pass) → incremental RED→GREEN cycles for each remaining behavior → refactor pass. After all tests pass, generate TEST.md as a summary record using the same "Given/when/then" format. Retain Steps 7–8 (verification and non-test criteria).

For review-task.md: update references to TEST.md from "the test plan specifying what must pass" to "the test record documenting what was tested." The reviewer still uses TEST.md for coverage verification but no longer treats it as a design spec contract against which implementation deviations are flagged.

**Acceptance criteria:**
- `src/prompts/execute-task.md` contains no Step 4 about creating TEST.md upfront or the "Given ____ when ____ then ____" planning format
- `src/prompts/execute-task.md` describes an iterative RED→GREEN loop (tracer bullet + incremental cycles + refactor pass) instead of separate "write all tests" and "implement all features" phases
- `src/prompts/execute-task.md` instructs generating TEST.md after all tests pass, using the same "Given ____ when ____ then ____" format as a summary record
- Step numbering is sequential with no gaps after restructuring
- `src/capabilities/execute-task.ts` `defaultInitialMessage` updated to describe iterative workflow instead of "create TEST.md with concise test cases"
- `src/prompts/review-task.md` references TEST.md as a test record/summary rather than a design spec or contract
- `src/capabilities/review-task.ts` `defaultInitialMessage` and tool description updated to reflect TEST.md as a summary record (no longer "the test plan")
- `npm run check` (`tsc --noEmit`) reports no errors
- Full test suite passes: `npx vitest run` exits with code 0

**Files affected:**
- `src/prompts/execute-task.md` — replace Steps 4–6 with iterative workflow step, add post-hoc TEST.md generation instruction, renumber remaining steps, update intro paragraph and Guidelines section
- `src/capabilities/execute-task.ts` — update `defaultInitialMessage` to describe iterative workflow (no mention of upfront TEST.md creation)
- `src/prompts/review-task.md` — update TEST.md references from "test plan" / "design spec" to "test record documenting what was tested"
- `src/capabilities/review-task.ts` — update `defaultInitialMessage` and tool description to reflect TEST.md as a summary record

### Step 3: Delete old skill and verify

Remove the `src/skills/test-driven-development/` directory. After deletion, only `tdd` should remain as the TDD skill. Verify both type checking and test suite pass with the final state.

**Acceptance criteria:**
- `src/skills/test-driven-development/` directory no longer exists
- `grep -rn "test-driven-development" src/ --include="*.ts" --include="*.md"` returns zero results
- `npm run check` reports no errors
- Full test suite passes: `npx vitest run` exits with code 0

**Files affected:**
- `src/skills/test-driven-development/` — delete entire directory including SKILL.md

## Notes

- TEST.md validation in `execute-task.ts` (`resolveExecuteValidation`) is **unchanged** — it still returns `TEST_FILE` as a required output. The prompt changes the timing (post-hoc instead of upfront) but the artifact still exists for exit-gate validation and review consumption.
- `goal-state.ts` `hasTest()` method and `fs-utils.ts` `discoverNextStep()` TEST.md check are **unchanged** — these still reference TEST.md which is still created. Removing them would be dead-code cleanup outside this goal's scope.
- The `review-task.ts` validation still lists TEST_FILE in `readOnlyFiles` — this is correct since the reviewer reads it as input. No code changes needed for review-task.ts beyond prompt text updates.
- Pocock's `tdd` skill uses progressive disclosure via reference files (`tests.md`, `mocking.md`, `interface-design.md`, `deep-modules.md`, `refactoring.md`) linked from `SKILL.md`. Pi's skill discovery reads `SKILL.md` and resolves relative links — the multi-file structure is compatible.
- Skill discovery is filesystem-based (scan `src/skills/` for dirs containing `SKILL.md`). Currently 9 skills are discovered including both `tdd` and `test-driven-development`. After deletion, 8 remain — `tdd` replaces `test-driven-development`.
