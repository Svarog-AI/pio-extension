# Accumulated Decisions (Steps 1–2)

Carried forward for Step 3 (draft specification) and Step 4 (validation). Only decisions with downstream impact are included.

## Approach Decisions

- **Unified skill + prompt only.** Both branch checkout and PR creation use pio-git skill protocols referenced from capability prompts. No capability code changes to TypeScript files. Steps 3–4 must specify only modifications to `src/skills/pio-git/SKILL.md`, `src/prompts/create-goal.md`, and `src/prompts/finalize-goal.md`.
- **Branch checkout integration point:** New "Branch Checkout Protocol" section in `src/skills/pio-git/SKILL.md`, invoked by a new step added to `src/prompts/create-goal.md` (before writing GOAL.md).
- **PR creation integration point:** New "PR Creation Protocol" section in `src/skills/pio-git/SKILL.md`, invoked by a new step added to `src/prompts/finalize-goal.md` (after updating PROJECT files).

## Branch Collision Resolution (Plan Deviation)

- **Strategy D (`ask_user`) is the recommendation.** User ultimately controls branch collision resolution via `ask_user` with options: reuse, suffix, or cancel. Subgoals fall back to auto-suffix without prompting (impractical for auto-spawned subgoals). This supersedes the preliminary "reuse existing" recommendation from Step 1.
- **GIT.md convention lookup for all branch naming.** Branch names are constructed using patterns from `.pio/PROJECT/GIT.md` first, falling back to `feat/<goal-name>` only when GIT.md is absent or doesn't define a pattern. This applies throughout — not hardcoded defaults.

## Subgoal Branching

- **Option 3: top-level goals only.** Top-level goals get independent branches; subgoals commit inline on the parent branch. Detection via path check (`/subgoals/` in goal path). No new protocols needed — just a conditional in the Branch Checkout Protocol.

## Worktrees

- **Explicitly excluded from scope.** Single-IDE constraint, no pio parallelism requirement, high complexity with low value. An explicit exclusion statement should appear in the spec for future reference.

## Tool Evaluation

- **`gh pr create` confirmed viable.** Supports `--title`, `--body`, `--base`, `--head`, `--draft`. Auth via `gh auth login`. GitHub only. Error modes documented (auth failure, branch not pushed, no changes, network failure, existing PR, CLI missing).
