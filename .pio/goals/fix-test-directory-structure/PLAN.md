# Plan: Fix Test Directory Structure

Add a three-step test file placement convention to both `evolve-plan.md` and `execute-task.md` prompts so agents place tests in correct directories instead of arbitrary or incorrect paths.

## Prerequisites

None.

## Steps

### Step 1: Add test placement convention to evolve-plan.md

**Description:** Update `src/prompts/evolve-plan.md` so the Specification Writer knows how to determine correct test file paths when writing TEST.md. The new guidance should instruct the agent to apply a three-step convention before specifying any test file path in TEST.md's "Unit Tests" and "Integration Tests" sections:

1. **Check `.pio/PROJECT.md` first** — if the project context documents a test directory convention (e.g., "tests mirror src under `tests/`", "colocated `.test.ts` alongside source"), follow it.
2. **Inspect existing tests** — if PROJECT.md doesn't specify, scan the target project for existing test files to discover patterns: look for `tests/`, `__tests__/`, `*.test.*`, `*_test.*` naming conventions and directory structure relative to source files.
3. **Ask the user** — if neither source reveals a convention, ask the user explicitly before writing TEST.md.

The guidance should be added in Step 6 (Write TEST.md), since that's where test file paths are specified. It may also be worth adding a brief note in the Guidelines section to reinforce the convention globally. The existing TEST.md structure template ("**File:** Path to the test file to create") should remain — only the process for determining that path is new.

**Acceptance criteria:**
- [ ] `npm run check` (tsc --noEmit) reports no errors after changes
- [ ] `src/prompts/evolve-plan.md` contains a three-step test placement convention in or near Step 6
- [ ] The convention explicitly references checking `.pio/PROJECT.md` for documented conventions
- [ ] The convention instructs scanning existing test files as a fallback discovery mechanism
- [ ] The convention instructs asking the user if no convention can be determined
- [ ] No unrelated content was added (scope limited to test file placement)

**Files affected:**
- `src/prompts/evolve-plan.md` — add test placement guidance in Step 6 (Write TEST.md); optionally reinforce in Guidelines

### Step 2: Add test placement convention to execute-task.md

**Description:** Update `src/prompts/execute-task.md` so the Execute Task Agent places test files in correct directories when actually creating them during the Red phase. The new guidance should add a parallel three-step convention (matching evolve-plan.md's) to Step 4 (Write tests first). Additionally, instruct the agent that if TEST.md already contains explicit paths (produced by evolve-plan), those should be respected unless they clearly violate the discovered convention — this ensures alignment between specification and implementation.

The guidance should cover:
1. **Check `.pio/PROJECT.md` first** for test directory conventions.
2. **Inspect existing tests** to discover patterns if PROJECT.md is silent.
3. **Ask the user** if no convention can be determined.
4. **Respect TEST.md paths** — use explicit paths from TEST.md (from evolve-plan) unless they clearly violate the discovered convention.

**Acceptance criteria:**
- [ ] `npm run check` (tsc --noEmit) reports no errors after changes
- [ ] `src/prompts/execute-task.md` contains a test placement convention in or near Step 4 (Write tests first)
- [ ] The convention matches the three-step pattern from evolve-plan.md (PROJECT.md → existing tests → ask user)
- [ ] The prompt instructs respecting TEST.md paths when they already exist and are consistent with discovered conventions
- [ ] No unrelated content was added (scope limited to test file placement)

**Files affected:**
- `src/prompts/execute-task.md` — add test placement guidance in Step 4 (Write tests first)

## Notes

- Both prompts need consistent wording for the three-step convention. The executor should reuse or mirror the exact same phrasing between the two files to avoid confusion when both agents reference the same rule.
- The change is prompt-only (markdown instructions). No TypeScript code changes are needed, so type checking (`npm run check`) should pass trivially if existing code is untouched.
- Verify that markdown formatting remains clean — no broken links, consistent heading levels, and proper indentation in any list items added.
