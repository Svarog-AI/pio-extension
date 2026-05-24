# Task: Analyze branching strategies

Evaluate branching approaches for the full pio workflow including subgoals, assess worktree viability, and recommend concrete strategies with rationale.

## Context

GOAL.md requires a specification covering four dimensions of git lifecycle integration. Step 1 identified extension points and evaluated `gh pr create`. This step (Step 2) focuses on the branching dimensions: how to handle branch collisions at goal creation, which subgoal branching strategy to adopt, and whether git worktrees add viable value under single-IDE constraints. The output appends to the existing `SPECIFICATION.md` draft from Step 1.

## What to Build

Append **Section 2: Branching Strategies** to `.pio/goals/git-lifecycle/SPECIFICATION.md`. This section contains three subsections analyzing branching dimensions and producing concrete recommendations.

### Section 2.1 — Branch collision resolution

Evaluate what happens when `feat/<goal-name>` already exists at `create-goal` time. Compare at minimum:

- **Reuse existing branch:** `git checkout feat/<goal-name>` and continue. Simplest, but may inherit stale or diverged state.
- **Error/abort:** Report conflict and stop. Safe but blocks workflow (violates graceful failure principle).
- **Auto-suffix:** Append `-2`, `-3` etc. Avoids conflict but produces noisy branch names.
- **Prompt user:** Ask via `ask_user`. Introduces interaction latency in an otherwise automated flow.

The executor should reference the preliminary decision from Step 1 (reuse existing) and evaluate whether it holds up under analysis or needs refinement. The recommendation must account for: goals that are continuations of previous work, interrupted workflows, and the constraint that git operations must never block workflow completion.

### Section 2.2 — Subgoal branching options

Evaluate four approaches for how subgoals interact with git branching. A subgoal is a nested goal spawned by `evolve-plan.ts` when a step has `complexity: "subgoal"`. Subgoals live at `S{NN}/subgoals/<name>/` and run through the full pio lifecycle recursively (own GOAL.md, PLAN.md, execute/review steps). Currently subgoal commits land on whatever branch the parent session is on — no independent branching exists.

Options to evaluate:

1. **Single branch per top-level goal:** Subgoals commit inline on the parent branch. Simplest approach. No additional branch management needed.
2. **Branch per subgoal:** Create `feat/<goal-name>/<subgoal-name>` when a subgoal starts, checkout back to parent on completion. Enables isolated subgoal histories but adds checkout-switching complexity.
3. **Top-level goals only:** Only top-level goals get branches. Subgoals explicitly skip independent branching/PRs — they commit inline. Hybrid approach that simplifies subgoal handling while preserving top-level branch structure.
4. **Other approaches discovered during research.**

For each option, document pros/cons based on three dimensions: git history quality (traceability, clean merges), implementation complexity (skill/prompt changes required), and IDE workflow fit (VS Code single-workspace constraint, review experience).

### Section 2.3 — Git worktree assessment

Evaluate whether git worktrees (`git worktree add`) add value for parallel goal development or introduce unmanageable complexity. Key constraints:

- **Single-IDE review:** VS Code opens one workspace at a time. Multiple worktrees require separate VS Code instances or workspace switching.
- **pio workflow coordination:** How does pio track state across worktrees? Each worktree would have its own `.pio/` directory — can the session queue coordinate?
- **Graceful failure complexity:** Worktree operations (add, remove, prune) add more surface area for failures.

Produce a clear include/exclude recommendation with rationale. If excluded, document why explicitly so future revisits are informed.

## Code Components

This is a specification/research task — no code changes. Output is documentation only (SPECIFICATION.md section). The executor must read the following files for research context:

- **`src/capabilities/evolve-plan.ts`** — understand subgoal spawning flow. Key: how `complexity: "subgoal"` triggers nested goal creation, where subgoal workspaces live (`S{NN}/subgoals/<name>/`), and what git context the subgoal inherits (same working directory as parent).
- **`.pio/PROJECT/GIT.md`** — reference existing branch naming patterns (`feat/<feature-name>`, `refactor/<desc>`). Determine if nested branch names like `feat/<goal>/<subgoal>` fit existing conventions.
- **`src/skills/pio-git/SKILL.md`** — understand how git protocols are currently structured (Convention Lookup Rule, Staged Commit Protocol) to ensure branching strategy recommendations integrate cleanly.

## Approach and Decisions

- Follow the DECISIONS.md carried from Step 1: unified skill+prompt approach, no capability code changes.
- Write Section 2 as an appendage to S01's SPECIFICATION.md — same file, new section. Maintain consistent heading hierarchy and formatting style.
- Use tables for pros/cons comparisons where applicable (matches the format established in Section 1 of SPECIFICATION.md).
- Ground recommendations in actual codebase evidence: reference real file paths, real constraints from GOAL.md, and real patterns from pio-git skill.

## Dependencies

- **Step 1 must be completed.** Step 2 builds on S01 SPECIFICATION.md (existing Sections 1.1–1.5). The integration point decisions from Step 1 constrain the scope of branching recommendations (skill+prompt only, no code changes).

## Files Affected

- `.pio/goals/git-lifecycle/SPECIFICATION.md` — modified: append Section 2 (branching strategy analysis, subgoal options evaluation, worktree assessment)
- `src/capabilities/evolve-plan.ts` — read-only: understand subgoal spawning mechanics
- `.pio/PROJECT/GIT.md` — read-only: reference branch naming conventions
- `src/skills/pio-git/SKILL.md` — read-only: understand existing protocol structure

## Acceptance Criteria

- All four subgoal branching options evaluated with pros/cons documented (history quality, complexity, IDE fit)
- Branch collision resolution strategy recommended with trade-offs clearly stated
- Worktree assessment completed with a clear include/exclude recommendation and rationale
- Analysis written into SPECIFICATION.md as Section 2 with consistent formatting matching Section 1
- Every file path referenced corresponds to an actual codebase file

## Risks and Edge Cases

- **Scope creep into Step 3:** This step analyzes branching strategies — it does not write the full specification (that's Step 3). Keep analysis focused on evaluation and recommendation, not final spec prose.
- **Pre-existing decision from Step 1:** The "reuse existing" branch collision strategy was tentatively decided in Step 1. Step 2 should evaluate this properly rather than just rubber-stamping — but should acknowledge the prior finding as a starting point.
- **Subgoal nesting depth:** Subgoals can theoretically nest recursively (subgoals within subgoals). Consider how deep branching names would get (`feat/goal/subgoal/nested-subgoal`) and whether this is practical.
