---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---
# Code Review: Update evolve-plan to write skills in TASK.md frontmatter (Step 7)

## Decision
APPROVED

## Summary
Prompt-only change that updates `evolve-plan.md` to instruct spec writers to include skills in TASK.md YAML frontmatter. The implementation correctly distinguishes mandatory vs recommended skills, preserves the body `## Skills` section with explicit coexistence language, includes a unified YAML example (merged per user request), and clarifies that frontmatter is required (not optional) with `---` delimiters always present. All acceptance criteria are met; TypeScript compiles cleanly and all 715 existing tests pass with no regressions.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- (none)

## Test Coverage Analysis
No unit tests apply — this is a prompt-only change (markdown template). Per TDD methodology, content-based tests for prompts are excluded as they break on rewording without indicating behavioral regressions. TEST.md specifies programmatic verification only:

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` exits 0 | ✓ Pass |
| `npm test` — all tests pass | ✓ 715 passed |
| `skills.mandatory` present in evolve-plan.md | ✓ Lines 97, 100 |
| `skills.recommended` present in evolve-plan.md | ✓ Lines 98, 99, 100 |
| YAML frontmatter example with `---` delimiters | ✓ Lines 108-116 (unified template) |
| Body `## Skills` preservation / coexistence | ✓ Line 103: "Both coexist, serving different purposes" |
| Omit `skills.recommended` when empty | ✓ Line 99: "Omit `skills.recommended` entirely" |

## Acceptance Criteria Alignment (TASK.md)

- [✓] Instructions for skills in TASK.md YAML frontmatter — lines 94-100
- [✓] Mandatory vs recommended distinction with examples — lines 97-98
- [✓] Body `## Skills` preserved, coexistence stated — line 103
- [✓] Short YAML example included (unified template) — lines 108-116
- [✓] Omit `skills.recommended` when empty convention — line 99
- [✓] No code files modified — only `src/prompts/evolve-plan.md`

## User-Requested Changes Verification

Both user-requested changes from SUMMARY.md were applied correctly:
1. **Unified template:** Frontmatter example merged into TASK.md template as a single code block (lines 108-201) containing both YAML frontmatter and body sections
2. **Required frontmatter:** Changed "(optional)" to "(required)", added "This block is always present — even when empty" (line 94), clarified `---` delimiters always kept (line 100)

## Alignment with DECISIONS.md

- Schema shape (`skills.mandatory`, `skills.recommended`) matches `CapabilitySkills` and `TASK_FRONTMATTER_SCHEMA` from Steps 1-6
- Convention of omitting `recommended` when empty is followed
- Body Skills section preservation respects the plan deviation about inline skill mentions being legitimate instructions

## Recommendations
N/A — implementation is clean and complete.
