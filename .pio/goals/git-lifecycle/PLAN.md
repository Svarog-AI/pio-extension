---
totalSteps: 4
steps:
  - name: research-integration-points
    complexity: task
  - name: analyze-branching-strategies
    complexity: task
  - name: draft-specification
    complexity: task
  - name: validate-specification
    complexity: task
---

# Plan: Full Git Lifecycle in pio

Produce a specification document covering end-to-end git integration for the pio workflow, as defined in GOAL.md. The output is `SPECIFICATION.md` — actionable input for a follow-up implementation goal.

## Prerequisites

- `.pio/PROJECT/GIT.md` exists and documents current conventions (Conventional Commits, branch naming, merge strategy)
- `src/skills/pio-git/SKILL.md` exists with the "Future Extensibility" section identifying branch checkout and PR creation as planned additions
- Access to `gh` CLI documentation (for evaluating PR creation options)

## Steps

### Step 1: Research git lifecycle integration points

Audit the current codebase to identify extension points where git operations can be integrated without capability code changes. Investigate how existing capabilities (`create-goal`, `finalize-goal`, `evolve-plan`) orchestrate sessions and what hooks are available for injecting git behavior via prompts or skills. Evaluate `gh pr create` capabilities, auth requirements, supported platforms, and error modes.

**Description:**
- Read `src/capabilities/create-goal.ts` — identify where branch checkout could be injected (prompt instructions vs. code changes)
- Read `src/capabilities/finalize-goal.ts` — identify where PR creation could fit in the finalize flow
- Read `src/prompts/create-goal.md` and `src/prompts/finalize-goal.md` — assess current prompt structure for adding git instructions
- Read `src/skills/pio-git/SKILL.md` — understand existing protocol patterns (convention lookup, staged commit, graceful failure) that the spec must follow
- Research `gh pr create` via CLI: auth model (GitHub token, app auth), flags for title/body/base/head, error modes (conflicts, missing branches, no changes)
- Identify edge cases: goals created without a git repo, detached HEAD states, interrupted workflows

**Acceptance Criteria:**
- Integration points documented: clear mapping of which capability/prompt handles which git operation
- `gh pr create` options evaluated with auth requirements and error modes documented
- Edge cases catalogued (no git repo, detached HEAD, no changes)
- Research findings written into the specification draft section for integration points

**Files Affected:**
- `.pio/goals/git-lifecycle/SPECIFICATION.md` — new file: draft research findings (integration points, gh CLI evaluation)
- `src/capabilities/create-goal.ts` — read-only: audit extension points
- `src/capabilities/finalize-goal.ts` — read-only: audit extension points
- `src/prompts/create-goal.md` — read-only: assess prompt injection feasibility
- `src/prompts/finalize-goal.md` — read-only: assess prompt injection feasibility
- `src/skills/pio-git/SKILL.md` — read-only: understand existing patterns

### Step 2: Analyze branching strategies

Evaluate branching approaches for the full pio workflow including subgoals. Compare four subgoal options, assess worktree viability under single-IDE constraints, and recommend concrete approaches with rationale.

**Description:**
- Evaluate branch collision strategies for `create-goal`: what happens when `feat/<goal-name>` already exists? Options: reuse existing (checkout), error/abort, auto-suffix (`feat/<name>-2`), or prompt user
- Analyze four subgoal branching options:
  1. Single branch per top-level goal (subgoals commit inline — simplest)
  2. Branch per subgoal with checkout switching back to parent on completion
  3. Top-level goals only — subgoals skip independent branches/PRs
  4. Other approaches discovered during research
- Assess git worktree viability: parallel goal development value vs. single-IDE review complexity (VS Code handles one workspace at a time; multiple worktrees require separate VS Code instances or workspace switching)
- Produce recommendation for each dimension with rationale based on: git history quality, implementation complexity, IDE workflow fit

**Acceptance Criteria:**
- All four subgoal branching options evaluated with pros/cons documented
- Branch collision resolution strategy recommended with trade-offs
- Worktree assessment completed with clear include/exclude recommendation and rationale
- Analysis written into the specification draft section for branching strategies

**Files Affected:**
- `.pio/goals/git-lifecycle/SPECIFICATION.md` — append: branching strategy analysis, subgoal options, worktree assessment
- `src/capabilities/evolve-plan.ts` — read-only: understand subgoal spawning flow (branching context for nested goals)
- `.pio/PROJECT/GIT.md` — read-only: reference existing branch naming patterns

### Step 3: Draft specification document

Synthesize research from Steps 1 and 2 into a complete specification document covering all five GOAL.md dimensions. The spec must be internally consistent, follow pio-git skill conventions (graceful failure, convention lookup), and provide actionable recommendations for a follow-up implementation goal.

**Description:**
- Write the complete `SPECIFICATION.md` covering:
  1. **Branch checkout on create-goal:** recommended approach, branch naming from goal name + GIT.md patterns (`feat/<goal-name>`), conflict resolution strategy, handling non-main branches (detect current branch as base), required changes to `src/prompts/create-goal.md` and `src/skills/pio-git/SKILL.md`
  2. **PR creation on finalize-goal:** approach (`gh pr create` via bash), PR title/body format (goal name, summary of changes), target branch determination (default `main`, configurable via GIT.md), required changes to `src/prompts/finalize-goal.md` and `src/skills/pio-git/SKILL.md`
  3. **Subgoal branching strategy:** recommendation with rationale from Step 2 analysis, impact on pio-git skill structure and prompt changes
  4. **Git worktrees assessment:** include/exclude decision with rationale, coordination pattern if included
  5. **Implementation plan:** concrete changes to `src/skills/pio-git/SKILL.md` (new sections/protocols), changes to capability prompts, any capability code changes (with justification), proposed plan steps for a follow-up goal
- Ensure all recommendations follow existing pio-git patterns: convention lookup from GIT.md, graceful failure semantics, staged staging (never `git add -A`)

**Acceptance Criteria:**
- `SPECIFICATION.md` contains all five required sections with concrete recommendations
- Each section specifies which files need changes and what those changes are at a high level
- Graceful failure semantics are preserved throughout (git errors warn, never block)
- No capability code changes recommended unless justified in the spec
- Implementation plan includes proposed plan steps for follow-up goal

**Files Affected:**
- `.pio/goals/git-lifecycle/SPECIFICATION.md` — new file: complete specification document (all five dimensions)
- `src/skills/pio-git/SKILL.md` — read-only: reference existing patterns for consistency
- `src/prompts/create-goal.md` — read-only: reference current prompt structure for proposed changes
- `src/prompts/finalize-goal.md` — read-only: reference current prompt structure for proposed changes

### Step 4: Validate specification

Review the complete specification against GOAL.md requirements. Verify completeness, consistency, and actionability. Ensure edge cases are addressed and the document is clear enough to drive a follow-up `create-plan`.

**Description:**
- Re-read GOAL.md To-Be State section and verify every requirement has a corresponding section in the spec
- Verify all five dimensions are covered: branch checkout, PR creation, subgoal branching, worktrees, implementation plan
- Check for internal consistency: no contradictions between sections (e.g., worktree recommendation doesn't conflict with subgoal branching recommendation)
- Verify edge cases from research are addressed: no git repo, detached HEAD, branch collision, interrupted workflows
- Confirm the spec is actionable: a follow-up `create-plan` could produce implementable plan steps from this document alone
- Ensure the "Integration requirements" from GOAL.md are met: graceful failure, convention lookup, staged staging

**Acceptance Criteria:**
- Every requirement in GOAL.md To-Be State maps to a spec section with concrete content
- No contradictions between sections (subgoal strategy, worktree decision, and implementation plan are consistent)
- Edge cases explicitly addressed in the spec (no git repo, detached HEAD, branch already exists, no changes to commit)
- Spec is actionable: follows GOAL.md requirement of being "suitable for driving implementation in a follow-up goal"

**Files Affected:**
- `.pio/goals/git-lifecycle/SPECIFICATION.md` — modify if validation reveals gaps or inconsistencies
- `.pio/goals/git-lifecycle/GOAL.md` — read-only: validate against requirements

## Notes

- This goal produces a specification document, not code changes. Acceptance criteria verify document completeness and consistency rather than programmatic execution.
- The spec must follow the existing `pio-git` skill conventions (convention lookup from GIT.md, graceful failure) to ensure seamless integration when implemented.
- If research reveals that capability code changes are necessary (not just prompt/skill changes), this must be explicitly justified in the specification before being recommended.
- VS Code's single-workspace constraint is a key factor in the worktree assessment — it directly impacts whether parallel goal development is feasible with the current review workflow.
