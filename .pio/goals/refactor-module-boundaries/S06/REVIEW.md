---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 1
---

# Code Review: Update all capability files to import from new modules (Step 6)

## Decision
APPROVED

## Summary
Step 6 is a purely mechanical import refactor — replacing `from "../utils"` with targeted imports from the four decomposed modules (`fs-utils`, `queues`, `transitions`, `capability-config`). The implementation correctly updates all 13 capability files plus `session-capability.ts`. TypeScript compilation passes with zero errors, all 218 tests across 14 test files pass, and no behavioral regressions were introduced. The `stepFolderName` discrepancy (PLAN.md said `transitions`, actual location is `fs-utils`) was handled correctly by following the actual file layout.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- [LOW] SUMMARY.md's "Files Modified" section describes imports slightly differently from TASK.md's per-file examples (e.g., it mentions `../queues` for files like create-goal.ts, where TASK.md's inline examples listed `enqueueTask` under `../fs-utils`). The actual code is correct — `enqueueTask` lives in `src/queues.ts` as specified by the routing table. This is a documentation inconsistency in SUMMARY.md only, not an implementation issue. — `S06/SUMMARY.md`

## Test Coverage Analysis
This is a structural refactoring with no behavioral changes. TEST.md's verification strategy is appropriate:

1. **`npm run check`** (tsc --noEmit): Zero TypeScript errors — all imports resolve correctly to the new module locations. Covers correctness of every import path and symbol resolution. ✓
2. **Grep for residual `../utils`**: Confirmed zero matches across all 13 capability files + session-capability.ts. The only remaining `../utils` reference is in `src/capabilities/validation.ts`, which is intentionally left for deletion in Step 8. ✓
3. **Per-file spot-checks**: Verified critical files — `stepFolderName` correctly imported from `../fs-utils` (not `../transitions`), `discoverNextStep` from `../fs-utils`, `SessionQueueTask` from `../queues`. ✓
4. **`npm test`**: All 218 tests across 14 files pass — confirms zero behavioral regressions. ✓

All acceptance criteria from TASK.md are covered by programmatic verification.

## Gaps Identified
- **GOAL ↔ PLAN ↔ TASK**: The PLAN.md listed `stepFolderName` under `transitions`, but TASK.md correctly identifies it's actually in `fs-utils` and instructs to follow the actual layout. Implementation follows this correctly.
- **TASK ↔ SUMMARY**: Minor documentation discrepancy in SUMMARY.md's file descriptions, but actual code is correct.
- **No gaps between TASK specification and implementation.**

## Recommendations
N/A — implementation is complete and correct. No changes needed.
