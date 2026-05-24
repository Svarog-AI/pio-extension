# Decisions (carried from Step 1)

## Approach Decisions

- **Unified skill + prompt only.** Both branch checkout and PR creation use pio-git skill protocols referenced from capability prompts. No capability code changes. This constrains Steps 3–4 to specify only skill and prompt modifications — not TypeScript code changes to `create-goal.ts` or `finalize-goal.ts`.
- **Branch checkout integration point:** A new "Branch Checkout Protocol" section in `src/skills/pio-git/SKILL.md`, referenced by a step added to `src/prompts/create-goal.md`.
- **PR creation integration point:** A new "PR Creation Protocol" section in `src/skills/pio-git/SKILL.md`, referenced by a step added to `src/prompts/finalize-goal.md`.

## Preliminary Decisions (subject to Step 2 analysis)

- **Branch collision strategy — preliminary: reuse existing.** During Step 1 research, "reuse existing branch (checkout and continue)" was tentatively recommended. Step 2 should evaluate this alongside alternatives before finalizing.
- **Non-main branch handling:** Detect current branch with `git symbolic-ref --short HEAD` and use as base for both branching and PR target.

## Tool Evaluation Results

- **`gh pr create` confirmed viable.** Supports `--title`, `--body`, `--base`, `--head`, `--draft` flags. Auth via `gh auth login` (PAT, GitHub Apps, OAuth). Platform: GitHub only. Error modes documented in S01 SPECIFICATION.md §1.4.
