# Accumulated Decisions (Steps 1–3)

Carried forward for Step 4 (validate specification). Only decisions with downstream impact — i.e., relevant to a follow-up implementation goal — are included.

## Core Architecture

- **Skill + prompt only.** Both branch checkout and PR creation use pio-git skill protocols referenced from capability prompts. No capability code changes to TypeScript files. A follow-up implementation goal must modify only `src/skills/pio-git/SKILL.md`, `src/prompts/create-goal.md`, and `src/prompts/finalize-goal.md`.
- **Prompts define WHAT, skills define HOW.** Governing separation of concerns. Prompts never contain shell commands — they reference a skill by name. Skills contain all concrete protocols and commands.

## Plan Deviations (from Steps 1–2 research to final spec)

- **Branch collision resolution:** Step 1 tentatively recommended "reuse existing." Final spec uses `ask_user` for top-level goals (options: reuse, suffix, cancel) and auto-suffix for subgoals. This is the authoritative decision — any implementation must follow it.
- **GIT.md is the authority for formats.** User clarified that PR title format, PR body format, and branch naming patterns defer to `.pio/PROJECT/GIT.md`. No hardcoded templates in the spec or skill.

## Branching Strategy

- **Top-level goals only (Option 3).** Subgoals commit inline on the parent branch. Detection: `/subgoals/` in goal workspace path. Both protocols must skip for subgoals.
- **Non-main branch handling:** Detect current branch, use as base for both branching and PR target.

## Worktrees

- **Explicitly excluded.** Single-IDE constraint, no parallelism requirement, high complexity. An exclusion statement is preserved in the spec for future reference.

## Tool Evaluation

- **`gh pr create` confirmed viable.** Supports `--title`, `--body`, `--base`, `--head`, `--draft`. GitHub only. Auth via `gh auth login`. Error modes documented.

## Deliverables

- **SPECIFICATION.md** lives at `.pio/goals/git-lifecycle/SPECIFICATION.md` (260 lines) with a copy at `docs/git-lifecycle-specification.md`. Both files should be validated for content identity in Step 4.
