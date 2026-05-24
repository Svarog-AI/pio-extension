# Full Git Lifecycle in pio

Produce a feasibility study and specification that defines end-to-end git integration for the pio workflow. The study must evaluate branch checkout on `create-goal`, PR creation on `finalize-goal`, subgoal branching strategies, and git worktree viability — then recommend concrete approaches for each dimension. Output: a specification document suitable for driving implementation in a follow-up goal.

## Current State

- **`src/skills/pio-git/SKILL.md`** — The `pio-git` skill implements per-step auto-commits via the "Staged Commit Protocol." It stages only files listed in `SUMMARY.md` (execute-task) or diffed from a baseline (execute-plan). Follows graceful failure semantics: git errors are warned, never block workflow. Convention lookup reads `.pio/PROJECT/GIT.md`. The "Future Extensibility" section explicitly calls out branch checkout on `create-goal` and PR creation on `finalize-goal` as planned next steps.

- **`src/capabilities/create-goal.ts`** — `prepareGoal()` creates the goal workspace directory (`fs.mkdirSync`). No git operations whatsoever. Branch naming conventions exist in `.pio/PROJECT/GIT.md` (`feat/<feature-name>`), but nothing enforces them at goal creation time. Open question: what if a branch already exists? What about goals started from an existing feature branch (not `main`)?

- **`src/capabilities/finalize-goal.ts`** — Validates the goal is complete, then launches the finalize session. The `finalize-goal` prompt (`src/prompts/finalize-goal.md`) instructs the agent to update `.pio/PROJECT/*.md` files based on accumulated decisions. No PR creation, no branch management, no merge coordination.

- **`.pio/PROJECT/GIT.md`** — Documents: Conventional Commits format, observed types (`feat`, `refactor`, `fix`, `chore`, `test`, `docs`), branch naming (`feat/<feature-name>`, `refactor/<desc>`), main branch is `main`, merge PRs (not squash). No GPG signing.

- **Subgoals** — `src/capabilities/evolve-plan.ts` spawns subgoals when a step has `complexity: "subgoal"`. Subgoals live at `S{NN}/subgoals/<name>/` and run through the full pio lifecycle recursively. Currently, subgoal commits (from `pio-git`) land on whatever branch the parent session is on — no independent branching or PR strategy exists for subgoals.

- **Constraints:** The workflow is prompt+skill-driven. No capability code changes unless absolutely necessary. Git operations must never block workflow completion (graceful failure). Convention lookup from `.pio/PROJECT/GIT.md`. Must integrate with existing `pio-git` skill structure. User reviews in a single IDE — multi-worktree setups are difficult to manage.

## To-Be State

### Deliverable: Specification document

A specification (written as the output of this goal) that covers:

1. **Branch checkout on `create-goal`:**
   - Recommended approach for branching off `main` when a goal workspace is created
   - Branch naming convention derived from goal name and GIT.md patterns (`feat/<goal-name>`)
   - Conflict resolution strategy: what if the branch already exists (reuse? error? suffix?)
   - Handling goals started from non-main branches (detect current branch, use as base)
   - Required changes to `src/prompts/create-goal.md` or `src/skills/pio-git/SKILL.md`

2. **PR creation on `finalize-goal`:**
   - Recommended approach: `gh pr create` via bash tool vs. GitHub API
   - PR title/body format: include goal name, link to GOAL.md or PLAN.md artifacts, summary of changes
   - Target branch determination (default `main`, configurable via GIT.md)
   - Required changes to `src/prompts/finalize-goal.md` or `src/skills/pio-git/SKILL.md`

3. **Subgoal branching strategy:**
   - Evaluation of four options:
     - Single branch per top-level goal (simplest, subgoals commit inline)
     - Branch per subgoal with checkout switching back to parent on completion
     - Top-level goals only — subgoals skip independent branches/PRs
     - Other approaches discovered during research
   - Recommendation with rationale based on: git history quality, complexity, IDE workflow fit
   - Impact on `pio-git` skill structure and prompt changes

4. **Git worktrees assessment:**
   - Evaluation of whether worktrees add value (parallel goal development) or introduce unmanageable complexity (single-IDE review constraint)
   - Recommendation: include with a viable pattern, or explicitly exclude from scope
   - If included: how does the pio workflow coordinate across worktrees?

5. **Implementation plan:**
   - Concrete changes required to `src/skills/pio-git/SKILL.md` (new sections/protocols)
   - Changes required to capability prompts (`create-goal.md`, `finalize-goal.md`)
   - Any capability code changes (if absolutely necessary, with justification)
   - Proposed plan steps for a follow-up implementation goal

### Research scope

- Review how `gh CLI` handles PR creation (auth requirements, supported platforms, error modes)
- Evaluate branch collision patterns in real workflows (reusing stale branches, naming conflicts)
- Assess worktree viability with single-IDE constraints (can VS Code handle multiple worktrees for review?)
- Identify edge cases: goals created without a git repo, goals on detached HEAD, interrupted workflows

### Integration requirements

- All git operations follow existing `pio-git` skill patterns: convention lookup from GIT.md, graceful failure semantics, staged staging (never `git add -A`)
- The specification must be actionable as input to `create-plan` — i.e., clear enough that a follow-up goal can produce implementable plan steps
- No assumptions about specific git hosting beyond GitHub + gh CLI for PR operations
