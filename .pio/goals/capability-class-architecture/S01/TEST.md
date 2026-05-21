# Tests: Catalog current capability patterns

This step produces a research document (`ANALYSIS.md`), not source code. There are no unit or integration tests — verification relies on programmatic file checks and manual review of analytical quality.

## Programmatic Verification

- **What:** ANALYSIS.md file exists in the goal workspace root
  - **How:** `test -f .pio/goals/capability-class-architecture/ANALYSIS.md`
  - **Expected result:** Exit code 0 (file exists)

- **What:** ANALYSIS.md contains a "Current Patterns" section heading
  - **How:** `grep -c "Current Patterns" .pio/goals/capability-class-architecture/ANALYSIS.md`
  - **Expected result:** Output ≥ 1

- **What:** All 14 capability source files are referenced by name in ANALYSIS.md
  - **How:** For each file in `src/capabilities/*.ts` (excluding `.test.ts`), check: `grep -c "create-goal.ts\|create-plan.ts\|evolve-plan.ts\|execute-task.ts\|review-task.ts\|execute-plan.ts\|project-context.ts\|create-issue.ts\|goal-from-issue.ts\|finalize-goal.ts\|init.ts\|delete-goal.ts\|next-task.ts\|list-goals.ts\|parent.ts" .pio/goals/capability-class-architecture/ANALYSIS.md`
  - **Expected result:** Each filename appears at least once

- **What:** Line count data is present (numeric line counts for each capability)
  - **How:** `grep -cE "\b\d{2,3}\s*lines?\b|\d{2,3}$" .pio/goals/capability-class-architecture/ANALYSIS.md`
  - **Expected result:** Output ≥ 10 (at least one line count mention per capability)

- **What:** Session-based vs non-session distinction is present
  - **How:** `grep -ci "session-based\|non-session\|hybrid" .pio/goals/capability-class-architecture/ANALYSIS.md`
  - **Expected result:** Output ≥ 2 (the concept appears in multiple places, not just a passing mention)

- **What:** Shared infrastructure modules are documented
  - **How:** `grep -c "session-capability\|capability-config\|types\.ts\|fs-utils\|queues\|goal-state" .pio/goals/capability-class-architecture/ANALYSIS.md`
  - **Expected result:** Output ≥ 6 (references to all major shared modules)

## Manual Verification

- **What:** Capability inventory is accurate and complete
  - **How:** Open ANALYSIS.md, locate the capability inventory. Cross-check each entry against actual files: does `create-goal.ts` have a tool? Yes (`defineTool`). Does it have a command? Yes. Does it have CAPABILITY_CONFIG? Yes. Repeat for all 14 capabilities.

- **What:** Boilerplate quantification is reasonable
  - **How:** Compare stated boilerplate percentages against spot checks. For example: `init.ts` (67 lines) has imports (~7), core function (~12), tool definition (~18), command handler (~8), setup function (~6). That's ~50% boilerplate (setup/tool/command scaffolding) vs 50% unique logic (the actual `init()` function body + its specific behavior). Verify at least 3–4 capabilities match this rough intuition.

- **What:** Unique logic inventory correctly identifies capability-specific functions
  - **How:** Cross-reference: does ANALYSIS.md mention `applyReviewDecision` as unique to review-task? Does it mention `isStepReady` for execute-task? Does it note that `validateAndFindNextStep` exists in evolve-plan? Verify against actual source files.

- **What:** Hybrid capabilities are documented with justification
  - **How:** Check that `goal-from-issue.ts` (uses `launchCapability` but no own `CAPABILITY_CONFIG`) and `project-context.ts` (command-only, no tool) are explicitly discussed as special cases with reasoning.

## Test Order

1. Programmatic verification (file existence, content presence, data accuracy)
2. Manual verification (cross-referencing claims against source files, assessing analytical quality)
