---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---

# Code Review: Consume TASK.md skills in prepareSession (Step 8)

## Decision
APPROVED

## Summary
Clean implementation that moves TASK.md skills reading into `StepStatus.taskSkills()` on the goal state — following the established pattern of per-step lazy-evaluated methods (`hasTask()`, `status()`, `getMetadata()`). Both execute-task and review-task prepareSession hooks now read skills through `createGoalState().steps()` instead of the old standalone `readTaskFrontmatterSkills()` function. The user-requested relocation of `mergeCapabilitySkills` to `session-capability.ts` is correctly applied. All 735 tests pass, TypeScript compiles cleanly, and all acceptance criteria are met.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- (none)

## Test Coverage Analysis
All TASK.md acceptance criteria are covered by tests:

**StepStatus.taskSkills() (11 tests in `goal-state.test.ts`):**
- Valid skills with both mandatory + recommended arrays ✓
- Mandatory-only and recommended-only variants ✓
- No skills key, empty frontmatter, missing file → all return `null` ✓
- Malformed YAML, invalid schema → return `null` without throwing ✓
- Lazy evaluation (no caching) — reflects filesystem changes on each call ✓
- Pending step (S02 with no TASK.md) returns `null` ✓
- Error resilience — never throws on any error condition ✓

**mergeCapabilitySkills() (9 tests in `fs-utils.test.ts`):**
- Mandatory deduplication via Set ✓
- Recommended first-seen-wins dedup via Map ✓
- Null task skills, undefined base, empty inputs ✓
- Full merge of both mandatory + recommended from both sources ✓
- Input immutability — never mutates base or task objects ✓
- Order preservation — base skills before task skills ✓
- Malformed input resilience (missing name field) ✓

**prepareSession hooks:** `capability-config.test.ts` verifies that `prepareSession` is defined for both execute-task and review-task. The integration path (reading TASK.md → merging → setting on config) is exercised indirectly through the unit tests on each component.

One minor gap: no integration test explicitly exercises the full flow of prepareSession reading a TASK.md with skills from disk and verifying `currentConfig.skills` is updated. However, the individual components are well-tested and the wiring is straightforward (no branching logic in the hooks themselves), so this is acceptable.

## Gaps Identified
**GOAL ↔ PLAN:** Step 8 aligns with GOAL.md's goal of centralized skill loading. The implementation correctly reads TASK.md frontmatter skills at session startup via `prepareSession`, which composes with capability-level skills from config.

**PLAN ↔ TASK:** TASK.md follows the plan step faithfully but deviates in architecture — instead of a "shared helper" in `fs-utils.ts`, skills reading lives on `StepStatus.taskSkills()`. This deviation is justified by DECISIONS.md (per-step data belongs on `StepStatus`) and matches existing patterns.

**TASK ↔ Implementation:** All code components from TASK.md are implemented correctly:
- `taskSkills()` on StepStatus — lazy-evaluated closure, reads fresh from disk, validates against `TASK_FRONTMATTER_SCHEMA`, returns `TaskSkills | null` ✓
- execute-task `prepareExecuteSession` — uses `createGoalState().steps().find()taskSkills()` → `mergeCapabilitySkills()` → `setMergedSkills()` ✓
- review-task `prepareReviewSession` — same pattern ✓
- `readTaskFrontmatterSkills` removed from fs-utils.ts ✓

**User-Requested Changes (from SUMMARY.md):** The relocation of `mergeCapabilitySkills` from `fs-utils.ts` to `session-capability.ts` is documented as an explicit user request. All imports updated across execute-task.ts, review-task.ts, and fs-utils.test.ts. No unauthorized changes detected.

## Recommendations
N/A — implementation is clean and complete.
