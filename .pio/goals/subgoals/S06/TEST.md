# Tests: Dimension 6 — Session hierarchy and navigation

## Programmatic Verification

All tests are content verification checks against `FEASIBILITY.md`. This is a research-and-documentation step — no new source code or test files are created.

### File existence and structure

- **What:** FEASIBILITY.md exists at `.pio/goals/subgoals/FEASIBILITY.md`
  **How:** `test -f .pio/goals/subgoals/FEASIBILITY.md`
  **Expected result:** Exit code 0 (file exists)

- **What:** Dimension 6 section heading is present
  **How:** `grep -c "Dimension 6.*Session hierarchy" .pio/goals/subgoals/FEASIBILITY.md`
  **Expected result:** ≥ 1 match

### Content coverage checks

- **What:** Pi parentSession depth support is analyzed with evidence from code or docs
  **How:** `grep -ci "parentSession\|newSession\|depth" .pio/goals/subgoals/FEASIBILITY.md`
  **Expected result:** ≥ 3 mentions (must reference both code and documentation)

- **What:** Arbitrary depth support is confirmed or refuted with evidence
  **How:** `grep -ci "arbitrary depth\|no.*depth.*limit\|depth.*limit" .pio/goals/subgoals/FEASIBILITY.md`
  **Expected result:** ≥ 1 mention of the conclusion (supports arbitrary depth)

- **What:** `/pio-parent` single-hop behavior is documented
  **How:** `grep -ci "single hop\|one level\|parent\.ts" .pio/goals/subgoals/FEASIBILITY.md`
  **Expected result:** ≥ 2 mentions (behavior description + source file reference)

- **What:** Multi-level navigation scenario is analyzed
  **How:** `grep -ci "multi.?level\|multiple.*invocation\|chain\|breadcrumb" .pio/goals/subgoals/FEASIBILITY.md`
  **Expected result:** ≥ 2 mentions

- **What:** `deriveSessionName` analysis is present with current format and subgoal format
  **How:** `grep -ci "deriveSessionName\|session.?name" .pio/goals/subgoals/FEASIBILITY.md`
  **Expected result:** ≥ 3 mentions (current format + qualified name format + recommendation)

- **What:** Session naming with hierarchical context is evaluated
  **How:** `grep -ci "hierarchical.*name\|qualified.*name\|parent.*S03.*nested" .pio/goals/subgoals/FEASIBILITY.md`
  **Expected result:** ≥ 2 mentions

### Source file references

- **What:** Analysis references actual source files
  **How:** `grep -c "session-capability\.\|parent\.\|fs-utils\.\|capability-config\." .pio/goals/subgoals/FEASIBILITY.md`
  **Expected result:** ≥ 3 distinct source file references

### Change categorization

- **What:** Changes are categorized (new fields / new logic / breaking change / no change)
  **How:** `grep -ci "new logic\|new fields\|breaking change\|no change" .pio/goals/subgoals/FEASIBILITY.md`
  **Expected result:** ≥ 2 categorizations within Dimension 6 section

### Cross-references to other dimensions

- **What:** Dimension 6 cross-references prior dimensions (especially Dimension 2 queue keying and Dimension 3 state machine)
  **How:** `grep -c "Dimension [23]" .pio/goals/subgoals/FEASIBILITY.md` (within Dim 6 section boundaries)
  **Expected result:** ≥ 2 cross-references

### TypeScript compilation

- **What:** No regressions in TypeScript compilation
  **How:** `npm run check`
  **Expected result:** Exit code 0

## Manual Verification

- **What:** Verify parentSession depth analysis cites evidence from actual pi docs or code
  **How:** Read Dimension 6 section. Confirm it references specific lines/functions from `session-capability.ts` (`launchCapability`, line ~49–52) and/or pi `docs/extensions.md`. The conclusion (arbitrary depth supported) must be backed by a specific observation, not speculation.

- **What:** Verify `/pio-parent` analysis correctly describes single-hop behavior
  **How:** Read Dimension 6 section. Confirm it accurately describes: `findParentPath` reads `header.parentSession`, checks `fs.existsSync()`, then `ctx.switchSession(parentPath)`. The analysis should note this moves up exactly one level per invocation.

- **What:** Verify session naming analysis provides concrete examples
  **How:** Read Dimension 6 section. Confirm it shows at least two concrete session name examples: (1) current flat format (`"my-feature execute-task s3"`), and (2) subgoal format with qualified names (`"parent__S03__nested execute-task s1"` or improved `"parent/S03/nested execute-task s1"`). The recommended formatting should be explicit.

- **What:** Verify navigation UX recommendation is actionable
  **How:** Read Dimension 6 section. Confirm it provides a clear recommendation: either "no changes needed, multiple `/pio-parent` invocations are sufficient" or "add breadcrumb/chain visibility command". The recommendation should be justified with trade-offs.

## Test Order

1. Programmatic verification (file existence, content coverage, source references, categorization, cross-references, compilation)
2. Manual verification (evidence quality, accuracy of code descriptions, concrete examples, actionable recommendations)
