---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---

# Code Review: Integrate evolve-plan marker writing (Step 8)

## Decision
APPROVED

## Summary
The implementation correctly integrates the `REVISE_PLAN_NEEDED` marker mechanism into both the evolve-plan write allowlist and the evolve-plan prompt. The write allowlist callback was updated to include the marker path for all step numbers, and the prompt received a new assessment step (Step 7) with clear trigger/non-trigger conditions, file format specification, and explicit instructions not to invoke `pio_revise_plan` manually. All acceptance criteria are met, tests pass, and TypeScript compiles cleanly.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- (none)

## Test Coverage Analysis

All acceptance criteria from TASK.md are covered:

1. **Write allowlist inclusion** — Three unit tests verify `S{NN}/REVISE_PLAN_NEEDED` appears for step 1, step 3, and step 12 (zero-padding). The zero-padding test uses a precise negative assertion (`.not.toContain("S1/REVISE_PLAN_NEEDED")`) to confirm no under-padded paths leak through.

2. **Marker filename consistency** — One test resolves the evolve-plan config, extracts the marker path basename, and cross-checks against the imported `REVISE_PLAN_MARKER` constant from `./revise-plan`. This catches drift between the two modules.

3. **Allowlist length accounting** — The DECISIONS.md test for step 2 asserts `writeAllowlist.length === 5`, correctly accounting for REVISE_PLAN_NEEDED as one of the five entries (COMPLETED, TASK.md, TEST.md, DECISIONS.md, REVISE_PLAN_NEEDED).

4. **Prompt content** — Verified via programmatic grep checks: trigger conditions, non-trigger conditions, YAML frontmatter format (`reason:`, `decisions:`), and marker references all present in `evolve-plan.md`.

No significant gaps identified. The prompt itself cannot be unit-tested (it's a markdown instruction file), but the grep-based verification from TEST.md provides adequate coverage.

## Gaps Identified

**GOAL ↔ PLAN ↔ TASK:** No gaps. Step 8's plan item faithfully describes integrating marker writing into evolve-plan, and TASK.md expands it with concrete instructions.

**TASK ↔ TESTS:** All code-level acceptance criteria have corresponding programmatic checks or unit tests. Prompt-level criteria verified via grep.

**TASK ↔ Implementation:** Every acceptance criterion has a matching change:
- `resolveEvolveWriteAllowlist()` includes `${folder}/${REVISE_PLAN_MARKER}` ✅
- Marker constant exported from both modules for cross-checking ✅
- New prompt step 7 between Write TEST.md (step 6) and Signal completion (step 8) ✅
- Four trigger conditions explicitly listed ✅
- Non-trigger criteria ("minor changes only") specified ✅
- YAML frontmatter format with `reason` enum and `decisions` array ✅
- Explicit instruction: writing marker is sufficient, state machine auto-detects ✅
- Explicit instruction: do NOT call `pio_revise_plan`, just `pio_mark_complete` ✅
- TASK.md and TEST.md are always required (marker is optional/additional) ✅

## Recommendations
N/A — implementation is complete and correct.
