# Task: Validate specification

Review the complete SPECIFICATION.md against GOAL.md requirements to verify completeness, consistency, and actionability for a follow-up implementation goal.

## Context

Steps 1–3 produced a consolidated specification at `.pio/goals/git-lifecycle/SPECIFICATION.md` (with a copy at `docs/git-lifecycle-specification.md`) covering five dimensions of git lifecycle integration. This final step validates that the spec is complete, internally consistent, and ready to drive a follow-up `create-plan`. The REVIEW.md from Step 3 already approved the spec with one low-priority issue (line count inaccuracy in SUMMARY.md).

## What to Build

This task produces no new source code. It performs a systematic validation of SPECIFICATION.md against GOAL.md To-Be State requirements and integration constraints. If gaps, inconsistencies, or missing edge cases are found, update SPECIFICATION.md directly to fix them. The output is a validated spec and a validation report in this step's SUMMARY.md.

### Code Components

No code components. This is a document validation task.

### Validation Checklist

Perform the following checks systematically:

1. **Requirement-to-section mapping:** Re-read GOAL.md To-Be State section. For each bullet/requirement, verify a corresponding section in SPECIFICATION.md contains concrete content (not just a placeholder or deferral). Build an explicit mapping table.

2. **Five dimensions coverage:** Verify all five sections (§1–§5) contain substantive recommendations:
   - §1 Branch checkout: protocol steps, collision resolution, non-main handling, edge cases, required file changes
   - §2 PR creation: protocol steps, title/body format, target branch, pre-creation checks, edge cases, required file changes
   - §3 Subgoal branching: recommendation with rationale, detection mechanism, impact assessment
   - §4 Worktrees: include/exclude decision with multi-point rationale
   - §5 Implementation plan: concrete file changes for all three target files, proposed plan steps

3. **Internal consistency checks:**
   - Worktree exclusion (§4) does not contradict subgoal branching recommendation (§3) or implementation plan (§5)
   - "Skill + prompt only" constraint is respected throughout — no capability code changes recommended anywhere
   - Graceful failure semantics (warn, never block) are stated consistently in both protocols (§1 and §2)
   - Subgoal detection (`/subgoals/` path check) is mentioned in both Branch Checkout Protocol (§1) and PR Creation Protocol (§2), per the "both protocols must check" rule from §3
   - GIT.md convention lookup is used consistently — no hardcoded defaults except as fallback when GIT.md is absent

4. **Edge case coverage:** Verify all edge cases catalogued during Steps 1–2 are addressed in the spec:
   - No git repository
   - Detached HEAD state
   - Branch already exists (collision)
   - Uncommitted changes on working tree
   - `gh` CLI not installed or not authenticated
   - Network failure during PR creation
   - No changes to commit (empty diff)
   - Existing PR already open
   - Interrupted/re-finalize workflow
   - Goals created from non-main branches

5. **Actionability for follow-up create-plan:** Verify §5 Implementation Plan provides enough detail that a Planning Agent could produce implementable plan steps. Check: each proposed step has clear scope, target files are named concretely, and the relationship between skill changes and prompt changes is explicit.

6. **Integration requirements (from GOAL.md):**
   - Graceful failure semantics preserved throughout
   - Convention lookup from GIT.md used consistently
   - Staged staging principle honored (no `git add -A` recommendations)

7. **File copy identity:** Verify `docs/git-lifecycle-specification.md` is identical to the goal workspace `SPECIFICATION.md` (use `diff`).

### Approach and Decisions

- Read accumulated decisions from `S04/DECISIONS.md` for context on architectural constraints (skill+prompt only, GIT.md authority, etc.)
- Reference real file paths — verify that file paths mentioned in SPECIFICATION.md correspond to actual files in the codebase
- If a gap or inconsistency is found, fix it directly in `SPECIFICATION.md` and update `docs/git-lifecycle-specification.md` to match
- Document findings in this step's SUMMARY.md with a validation results table

## Dependencies

- Step 3 must be completed (SPECIFICATION.md exists at goal workspace root)
- GOAL.md To-Be State section is the source of truth for requirements

## Files Affected

- `.pio/goals/git-lifecycle/SPECIFICATION.md` — modify only if validation reveals gaps or inconsistencies
- `docs/git-lifecycle-specification.md` — update to match SPECIFICATION.md if changes are made
- `.pio/goals/git-lifecycle/GOAL.md` — read-only: validate against requirements

## Acceptance Criteria

- Every requirement in GOAL.md To-Be State maps to a spec section with concrete content (no placeholders or deferrals)
- All five dimensions (§1–§5) verified as present and substantive
- No contradictions between sections (subgoal strategy, worktree decision, implementation plan are internally consistent)
- Both protocols mention subgoal detection (`/subgoals/` path check) — a requirement from §3 Impact section
- Edge cases explicitly addressed in the spec: no git repo, detached HEAD, branch already exists, uncommitted changes, `gh` not installed, network failure, no changes, existing PR, interrupted workflow, non-main branches
- Graceful failure semantics (warn-and-continue) preserved throughout all git operations
- GIT.md convention lookup used consistently as the primary authority — no hardcoded formats except as fallback
- Staged staging principle honored (no `git add -A` recommendations anywhere in the spec)
- "Skill + prompt only" constraint respected — no capability code changes recommended
- §5 Implementation Plan is actionable: target files named concretely, skill vs. prompt changes clearly separated, proposed plan steps have clear scope
- File copy identity confirmed: `docs/git-lifecycle-specification.md` matches `.pio/goals/git-lifecycle/SPECIFICATION.md` (diff exits 0)
- `npm run check` (`tsc --noEmit`) exits with code 0
- `npm test` passes with 0 failures

## Risks and Edge Cases

- **Minor spec discrepancies are acceptable:** If validation reveals only cosmetic issues (formatting, wording) that don't affect actionability, document them but do not require rewrites.
- **SPECIFICATION.md is the authority:** If GOAL.md requirements appear ambiguous, interpret them based on the intent expressed in the To-Be State section rather than getting stuck on literal wording.
- **Don't over-validate:** The spec was already approved by Step 3 review with 0 critical/high/medium issues. This step catches systemic gaps, not nitpicks. Focus on completeness and consistency.
