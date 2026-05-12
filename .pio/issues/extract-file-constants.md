# Extract file name and folder pattern constants to a single shared module

# Extract file name and folder pattern constants to a single shared module

Consolidate all hardcoded file names (`GOAL.md`, `PLAN.md`, `TASK.md`, etc.), marker files (`COMPLETED`, `BLOCKED`, `APPROVED`), and directory patterns (`.pio/goals/`, `.pio/session-queue/`) into one shared constants file. These are currently duplicated across multiple capability modules.

## Current state — duplication map

### File name constants (duplicated across 4+ files)
| Constant | Value | Defined in |
|---|---|---|
| `GOAL_FILE` | `"GOAL.md"` | `create-plan.ts:25`, `execute-task.ts:52`, `review-code.ts:68` |
| `PLAN_FILE` | `"PLAN.md"` | `evolve-plan.ts:14`, `create-plan.ts:26`, `execute-task.ts:51`, `execute-plan.ts:21`, `review-code.ts:67` |
| `TASK_FILE` | `"TASK.md"` | `evolve-plan.ts:15`, `execute-task.ts:53`, `review-code.ts:69` |
| `TEST_FILE` | `"TEST.md"` | `evolve-plan.ts:16`, `execute-task.ts:54`, `review-code.ts:70` |
| `SUMMARY_FILE` | `"SUMMARY.md"` | `execute-task.ts:57`, `review-code.ts:73` |
| `REVIEW_FILE` | `"REVIEW.md"` | `review-code.ts:74` |

### Marker constants (duplicated across 2 files)
| Constant | Value | Defined in |
|---|---|---|
| `COMPLETED_MARKER` | `"COMPLETED"` | `execute-task.ts:55`, `review-code.ts:71` |
| `BLOCKED_MARKER` | `"BLOCKED"` | `execute-task.ts:56`, `review-code.ts:72` |

### Hardcoded strings (not extracted, used inline)
- `"GOAL.md"`, `"PLAN.md"` — inlined in CAPABILITY_CONFIG of `create-goal.ts:15-16`, `create-plan.ts:15-17`, `list-goals.ts:18/21/28`
- `"APPROVED"` — hardcoded inline in `utils.ts:317` (transition logic)
- `"PROJECT.md"` — hardcoded inline in `session-capability.ts:115`
- `.pio/goals/` path segments — constructed ad-hoc in `list-goals.ts:57`, `init.ts:16`, `utils.ts:40`
- `.pio/session-queue/` — constructed in `utils.ts:52`
- `.pio/issues/` — constructed in `utils.ts:65`

## To-be state

### New file: `src/constants.ts`
A single export of all well-known file names, markers, and path segments:

```typescript
// Goal workspace files
export const GOAL_FILE = "GOAL.md";
export const PLAN_FILE = "PLAN.md";
export const TASK_FILE = "TASK.md";
export const TEST_FILE = "TEST.md";
export const SUMMARY_FILE = "SUMMARY.md";
export const REVIEW_FILE = "REVIEW.md";

// Step markers
export const COMPLETED_MARKER = "COMPLETED";
export const BLOCKED_MARKER = "BLOCKED";
export const APPROVED_MARKER = "APPROVED";

// Directory names (relative to project root)
export const PIO_DIR = ".pio";
export const GOALS_SUBDIR = "goals";
export const SESSION_QUEUE_SUBDIR = "session-queue";
export const ISSUES_SUBDIR = "issues";

// Project context file
export const PROJECT_CONTEXT_FILE = "PROJECT.md";

// Task tracking file
export const LAST_TASK_FILE = "LAST_TASK.json";
```

### Files to modify
Each capability should import from `../constants` instead of defining its own copies:
- `src/capabilities/create-goal.ts` — replace inline strings with imports
- `src/capabilities/create-plan.ts` — remove local constants, import shared ones
- `src/capabilities/evolve-plan.ts` — remove local constants, import shared ones
- `src/capabilities/execute-task.ts` — remove local constants, import shared ones
- `src/capabilities/execute-plan.ts` — remove local constants, import shared ones
- `src/capabilities/review-code.ts` — remove local constants, import shared ones
- `src/capabilities/session-capability.ts` — replace `"PROJECT.md"` with `PROJECT_CONTEXT_FILE`
- `src/capabilities/list-goals.ts` — replace inline strings with imports
- `src/utils.ts` — replace `"APPROVED"` with `APPROVED_MARKER`; consider using `PIO_DIR`/subdir constants in path helpers

### Files already centralizing some logic
`src/utils.ts` constructs `.pio/goals/`, `.pio/session-queue/`, `.pio/issues/` paths via helper functions. These should reference the new constants too for consistency.

## Benefits
- Single source of truth — renaming a file (e.g., `TASK.md` → `SPEC.md`) touches one file
- Prevents drift — no more capabilities with different spellings or casing
- Enables compile-time checking if new file references are added incorrectly

## Category

refactor

## Context

Full duplication list:
- GOAL_FILE ("GOAL.md"): create-plan.ts:25, execute-task.ts:52, review-code.ts:68 + inline in create-goal.ts, create-plan.ts, list-goals.ts
- PLAN_FILE ("PLAN.md"): evolve-plan.ts:14, create-plan.ts:26, execute-task.ts:51, execute-plan.ts:21, review-code.ts:67 + inline in list-goals.ts
- TASK_FILE ("TASK.md"): evolve-plan.ts:15, execute-task.ts:53, review-code.ts:69 + inline in list-goals.ts
- TEST_FILE ("TEST.md"): evolve-plan.ts:16, execute-task.ts:54, review-code.ts:70
- SUMMARY_FILE ("SUMMARY.md"): execute-task.ts:57, review-code.ts:73
- REVIEW_FILE ("REVIEW.md"): review-code.ts:74
- COMPLETED_MARKER/BLOCKED_MARKER: execute-task.ts:55-56, review-code.ts:71-72
- "APPROVED": inline in utils.ts:317
- "PROJECT.md": inline in session-capability.ts:115
