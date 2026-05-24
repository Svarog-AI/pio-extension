# Task: Draft specification document

Synthesize research from Steps 1 and 2 into a complete `SPECIFICATION.md` covering all five GOAL.md dimensions, with concrete recommendations and an actionable implementation plan for a follow-up goal.

## Context

GOAL.md calls for a specification document suitable for driving implementation in a follow-up goal. Steps 1 and 2 produced research findings (integration points, `gh` CLI evaluation, edge case catalog) and analysis (branching strategies, subgoal options, worktree assessment). These live as draft Sections 1–2 in `S01/SPECIFICATION.md` (updated by Step 2). Step 3 must consolidate this into the final specification at the goal workspace root and add the remaining content: concrete implementation details for each dimension and a proposed implementation plan with follow-up plan steps.

## What to Build

Write `SPECIFICATION.md` at `.pio/goals/git-lifecycle/SPECIFICATION.md` — the goal workspace root (not inside `S03/`). This is the canonical output artifact of this goal. The document must cover all five dimensions from GOAL.md with concrete, actionable recommendations.

After writing and verifying the specification, copy it to `docs/git-lifecycle-specification.md`. This makes the spec discoverable outside the `.pio/` runtime workspace (which may be ignored in version control). The `docs/` directory exists at the repo root but is currently empty.

### Structure

The specification must have exactly five numbered sections:

**§1 — Branch checkout on create-goal:** Recommended approach for branching when a goal workspace is created. Must specify:
- Branch Checkout Protocol steps (concrete shell commands to execute)
- Convention lookup from `.pio/PROJECT/GIT.md` for branch naming patterns (fallback: `feat/<goal-name>`)
- Branch collision resolution: `ask_user` with options (reuse, suffix, cancel); subgoals auto-suffix without prompting
- Non-main branch handling: detect current branch and use as base
- Required changes to `src/skills/pio-git/SKILL.md`: new "Branch Checkout Protocol" section content at a high level
- Required changes to `src/prompts/create-goal.md`: where/how to inject the branching step (before writing GOAL.md)

**§2 — PR creation on finalize-goal:** Recommended approach for creating a pull request when a goal is finalized. Must specify:
- PR Creation Protocol steps (concrete `gh pr create` command with flags)
- PR title format: derived from goal name, following Conventional Commits (`feat: <goal-summary>`)
- PR body format: includes goal summary from GOAL.md, list of steps completed, files changed
- Target branch determination: default `main`, configurable via `.pio/PROJECT/GIT.md`
- Pre-creation checks: `gh auth status`, branch pushed to remote, changes exist on branch, no existing PR
- Required changes to `src/skills/pio-git/SKILL.md`: new "PR Creation Protocol" section content at a high level
- Required changes to `src/prompts/finalize-goal.md`: where/how to inject the PR creation step (after PROJECT file updates)

**§3 — Subgoal branching strategy:** Recommendation from Step 2 analysis. Must specify:
- Top-level goals only get branches; subgoals commit inline on parent branch
- Detection mechanism: path check for `/subgoals/` in goal workspace path
- No PR creation for subgoals (they merge into parent branch implicitly via inline commits)
- Impact on pio-git skill: conditional logic in Branch Checkout Protocol to skip branching for subgoals

**§4 — Git worktrees assessment:** Include/exclude decision. Must specify:
- Explicit exclusion from scope with rationale (no parallelism requirement, single-IDE constraint, high complexity)
- Statement preserved for future revisitation if requirements change

**§5 — Implementation plan:** Concrete changes required to implement the spec. Must specify:
- **Changes to `src/skills/pio-git/SKILL.md`:** New sections to add ("Branch Checkout Protocol", "PR Creation Protocol"), where they fit in the existing skill structure (after Staged Commit Protocol, before Future Extensibility), high-level content of each section
- **Changes to `src/prompts/create-goal.md`:** Which step to modify/add, what git instructions to inject
- **Changes to `src/prompts/finalize-goal.md`:** Which step to modify/add, what PR creation instructions to inject
- **Any capability code changes:** Only if justified with reasoning (expected: none)
- **Proposed plan steps for a follow-up goal:** Suggested decomposition of implementation into 3–5 executable plan steps with brief titles and descriptions

### Consolidation rules

- Base the document on research from `S01/SPECIFICATION.md` (Sections 1–2 draft). Do not copy verbatim — reorganize into the five-dimension structure above.
- Preserve all edge case handling from §1.5 of the S01 draft but move them to the relevant dimension sections (e.g., branch collision handling goes in §1, PR error modes go in §2).
- Move the `gh` CLI evaluation findings from S01 §1.4 into §2 as supporting evidence for the `gh pr create` approach.
- Ensure all five sections specify which files need changes and what those changes are at a high level.

### Consistency requirements

- **Graceful failure semantics:** Every git operation must follow the existing pio-git convention — warn on failure, never block workflow completion. This applies to branch checkout, PR creation, and all sub-operations (auth checks, push, etc.).
- **Convention lookup:** Branch naming patterns come from `.pio/PROJECT/GIT.md` with `feat/<goal-name>` as fallback only. Do not hardcode branch patterns.
- **Staged staging:** If the spec mentions any commit operations during PR creation, they must follow the staged staging rule (never `git add -A`).
- **No capability code changes unless justified:** Default assumption is skill + prompt only. If the spec recommends code changes, include explicit justification.

## Dependencies

- Step 1 completed: `S01/SPECIFICATION.md` contains integration point research and edge case catalog
- Step 2 completed: Section 2 (branching strategies) appended to S01 draft with collision strategy, subgoal analysis, and worktree assessment
- `S02/DECISIONS.md`: accumulated decisions that constrain the specification scope

## Files Affected

- `.pio/goals/git-lifecycle/SPECIFICATION.md` — new file: complete specification document (all five dimensions, actionable for follow-up implementation goal)
- `.pio/goals/git-lifecycle/S01/SPECIFICATION.md` — read-only: source material for consolidation (Sections 1–2 draft with research findings)
- `docs/git-lifecycle-specification.md` — new file: copy of the final specification for project-wide discoverability
- `src/skills/pio-git/SKILL.md` — read-only: reference existing patterns for consistency
- `src/prompts/create-goal.md` — read-only: reference current prompt structure for proposed changes
- `src/prompts/finalize-goal.md` — read-only: reference current prompt structure for proposed changes

## Acceptance Criteria

- `SPECIFICATION.md` exists at `.pio/goals/git-lifecycle/SPECIFICATION.md` (goal workspace root)
- A copy of the specification exists at `docs/git-lifecycle-specification.md` with identical content to `.pio/goals/git-lifecycle/SPECIFICATION.md`
- Document contains all five required sections (§1–§5) with concrete, non-empty content
- §1 (Branch checkout) specifies: Branch Checkout Protocol steps, GIT.md convention lookup, collision resolution (`ask_user` + subgoal auto-suffix), non-main branch handling, and required file changes
- §2 (PR creation) specifies: PR Creation Protocol steps, `gh pr create` command with flags, PR title/body format, target branch determination, pre-creation checks, and required file changes
- §3 (Subgoal branching) specifies: top-level-only recommendation with rationale, detection mechanism, and pio-git impact
- §4 (Worktrees) contains explicit exclusion statement with rationale
- §5 (Implementation plan) specifies: concrete file changes for all three target files (`pio-git/SKILL.md`, `create-goal.md`, `finalize-goal.md`) and proposed plan steps (3–5 steps) for a follow-up goal
- Graceful failure semantics are preserved throughout — git errors warn but never block
- No capability code changes recommended unless explicitly justified with reasoning
- All file paths referenced in the spec correspond to actual files in the codebase
- Internal consistency: no contradictions between sections (e.g., subgoal strategy in §3 is consistent with branch checkout protocol in §1)
- `npm run check` (`tsc --noEmit`) exits with code 0 (no type errors introduced — this task produces markdown only)
- `npm test` passes with 0 failures (no regressions — this task produces markdown only)

## Risks and Edge Cases

- **Over-copying from S01 draft:** The spec should reorganize content into the five-dimension structure, not copy the S01 draft verbatim. The S01 draft uses a different structure (Integration Points → Branching Strategies). The final spec must use the GOAL.md dimension structure.
- **Spec too vague for implementation:** Each section must specify *which files* change and *what those changes are at a high level*. Vague statements like "update pio-git skill" are insufficient — say "add a 'Branch Checkout Protocol' section to `src/skills/pio-git/SKILL.md` containing steps X, Y, Z."
- **Capability code creep:** The unified skill + prompt approach is a firm constraint from Steps 1–2. Do not recommend TypeScript code changes unless research reveals an absolute necessity (e.g., prompt injection is impossible for some operation).
- **Edge case coverage:** Ensure all edge cases from S01 §1.5 (no git repo, detached HEAD, branch collision, non-main branch, no changes, interrupted workflow, git not configured, `gh` missing, uncommitted changes, shallow clone) are addressed in the relevant spec sections.
- **Future Extensibility section:** The current `pio-git/SKILL.md` has a "Future Extensibility" section mentioning branch checkout and PR creation as planned additions. After the spec is implemented, this section will need updating — but that's an implementation concern, not a specification concern. Note it in §5 if relevant.
