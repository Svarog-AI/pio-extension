# Add revision session capabilities, starting with revise-plan

# Add revision session capabilities, starting with revise-plan

## Problem

Once a plan has been partially executed, there's no structured way to revise it. If the user realizes after step 2 of 5 that the approach needs changing, or if review feedback reveals architectural issues requiring re-planning, the only options are: manually edit PLAN.md (fragile, error-prone), or delete the entire goal and start over (loses completed work).

There's no capability to:
- Discover which steps are completed vs. incomplete
- Discuss revisions with the user based on actual step results and reviews
- Update PLAN.md for uncompleted steps only
- Clear uncompleted step folders so `evolve-plan` can regenerate them

## Proposed solution

Introduce a family of "revision session" capabilities for mid-flight plan adjustments. Start with `revise-plan`.

### New capability: `revise-plan`

A dedicated sub-session that lets the user revise PLAN.md after some steps have already been implemented:

1. **Discovery phase:** Scan the goal workspace to identify completed steps (S{NN}/ with COMPLETED + APPROVED), rejected steps, and unexecuted steps
2. **Review analysis:** Read REVIEW.md from each reviewed step — what worked, what didn't, what issues were found
3. **Interactive discussion:** Present findings to the user, ask what needs changing. Use `ask_user` for structured decisions about which steps to modify and how
4. **Plan modification:** Rewrite PLAN.md, preserving completed steps as-is and revising only the remaining uncompleted steps. The revised plan should account for: issues found in review, lessons learned from completed work, any new requirements from the user
5. **Clear incomplete steps:** After revision, clear uncompleted step folders (requires `clear-plan` tool from `.pio/issues/add-clear-plan-tool.md`) so that `evolve-plan` can regenerate specs against the updated plan

### Dependency: `clear-plan` tool

The revise-plan capability depends on a `clear-plan` tool (described in issue `add-clear-plan-tool.md`). Without it, uncompleted step folders persist with stale TASK.md/TEST.md files from the old plan, confusing downstream capabilities. `revise-plan` should invoke `clear-plan` (or its logic) after rewriting PLAN.md to clean up incomplete step folders.

### Workflow integration

After a successful revise-plan session:
1. PLAN.md is updated with revised steps
2. Incomplete step folders are cleared (via clear-plan)
3. The next `evolve-plan` call discovers the first uncompleted step and generates fresh TASK.md/TEST.md against the revised plan

### Future revision capabilities (not in scope, but designed for extension)

- **revise-goal:** Revise GOAL.md mid-flight when requirements change (preserves completed work context)
- **revise-task:** Re-specify a single step without touching the broader plan

## Files to create/modify

**New files:**
- `src/capabilities/revise-plan.ts` — capability implementation (tool + command + sub-session launcher)
- `src/prompts/revise-plan.md` — system prompt for the Plan Revision agent

**Modified files:**
- `src/utils.ts` — transition from revise-plan should route to clear-plan logic, then evolve-plan
- `src/index.ts` — register the new capability

**Dependency (separate issue but must be implemented first or alongside):**
- `src/capabilities/clear-plan.ts` — from issue `add-clear-plan-tool.md`

## Category

improvement

## Category

improvement

## Context

Current workflow is linear: create-goal → create-plan → evolve-plan → execute-task → review-code. The transition map in utils.ts (CAPABILITY_TRANSITIONS) is deterministic with no revision path. evolve-plan uses discoverNextStep() to find uncompleted steps by scanning S{NN}/ folders for TASK.md + TEST.md. review-code reads REVIEW.md and produces APPROVED/COMPLETED markers. Issue add-clear-plan-tool.md describes removing incomplete step folders — a prerequisite for revise-plan since old step specs must be cleared before re-evolving.
