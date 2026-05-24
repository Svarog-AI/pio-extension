---
totalSteps: 3
steps:
  - name: add-git-protocols-to-skill
    complexity: task
  - name: inject-branch-checkout-prompt
    complexity: task
  - name: inject-pr-creation-prompt
    complexity: task
---

# Plan: Implement Git Lifecycle

Add branch checkout on `create-goal` and PR creation on `finalize-goal` as skill + prompt changes only, following the specification at `.pio/goals/git-lifecycle/SPECIFICATION.md`.

## Prerequisites

None.

## Steps

### Step 1: Add Branch Checkout and PR Creation protocols to pio-git skill

Add two new protocol sections and update the Future Extensibility section in `src/skills/pio-git/SKILL.md`.

**Branch Checkout Protocol** — new section placed after "Staged Commit Protocol". Contains:
- Subgoal detection as first step (`/subgoals/` path check — skip if subgoal)
- Git repo and user config verification with graceful failure (`git rev-parse --show-toplevel`, `git config user.name`, `git config user.email`)
- Convention lookup from `.pio/PROJECT/GIT.md` for branch naming patterns, fallback `feat/<goal-name>`
- Branch name construction from goal name (lowercase, spaces to hyphens)
- Current branch detection via `git symbolic-ref --short HEAD`
- Non-main branch handling: use current branch as base, note for PR target
- Branch collision resolution: `ask_user` with three options for top-level goals (reuse, suffix `-2`/`-3`, cancel); auto-suffix for subgoals
- Edge cases: no git repo, detached HEAD, uncommitted changes, shallow clone
- Concrete shell commands for each step

**PR Creation Protocol** — new section placed after "Branch Checkout Protocol". Contains:
- Subgoal detection as first step (skip if subgoal)
- `gh` CLI availability (`command -v gh`) and auth verification (`gh auth status`)
- Target branch determination: read from GIT.md main branch name, fallback `main`, or use non-main base recorded during branch checkout
- Pre-creation checks: existing PR (`gh pr list`), changes exist (`git diff --shortstat`), branch pushed (`git push -u origin`)
- PR title construction: follow GIT.md Conventional Commits format, pick type based on goal name/summary
- PR body construction: follow GIT.md template if present, otherwise construct from GOAL.md summary, PLAN.md steps, per-step SUMMARY.md files
- `gh pr create` command with `--title`, `--body`, `--base`, `--head` flags
- Edge cases: gh not installed, not authenticated, network failure, no changes, existing PR, not a GitHub repo, re-finalize

**Future Extensibility section** — remove the existing entries for branch checkout and PR creation (now implemented). Replace with other future extensions: cherry-pick protocol, tag creation on release, git worktree note referencing the exclusion decision from §4 of SPECIFICATION.md.

Follow the existing Staged Commit Protocol structure: progressive disclosure, concrete shell commands, graceful failure semantics throughout. Follow `write-a-skill` conventions for line-length discipline and protocol structure.

#### Acceptance Criteria

- `src/skills/pio-git/SKILL.md` contains a "Branch Checkout Protocol" section with all sub-sections from SPECIFICATION.md §1
- `src/skills/pio-git/SKILL.md` contains a "PR Creation Protocol" section with all sub-sections from SPECIFICATION.md §2
- Section ordering is: Convention Lookup Rule → Staged Commit Protocol → Branch Checkout Protocol → PR Creation Protocol → Graceful Failure Semantics → Future Extensibility (or equivalent logical order per GOAL.md)
- "Future Extensibility" section no longer lists branch checkout or PR creation as planned additions
- Both protocols include subgoal detection (`/subgoals/` path check) as an early step
- Both protocols follow graceful failure semantics (warn on failure, never block)
- All shell commands are concrete and match SPECIFICATION.md specifications
- SKILL.md stays under 200 lines (progressive disclosure — split to REFERENCE.md if needed per write-a-skill skill)

#### Files Affected

- `src/skills/pio-git/SKILL.md` — add "Branch Checkout Protocol" section, add "PR Creation Protocol" section, update "Future Extensibility" section

### Step 2: Inject branch checkout into create-goal prompt

Add a new step between Step 3 (Fill gaps) and Step 4 (Write GOAL.md) in `src/prompts/create-goal.md`. The step instructs the agent to checkout a dedicated branch before writing GOAL.md, following the Branch Checkout Protocol from the pio-git skill.

The prompt states WHAT (checkout a branch) and delegates HOW to the skill by name only. No shell commands, no branch naming details, no collision handling — all in the skill. Re-number subsequent steps accordingly.

**Parallel with Step 3** — this step is independent of Step 3. Both depend on Step 1 completing first (the skill sections must exist for the prompts to reference them).

#### Acceptance Criteria

- `src/prompts/create-goal.md` contains a new step between old Steps 3 and 4 instructing branch checkout
- The new step references "Branch Checkout Protocol" from the "pio-git" skill by name
- The step contains no shell commands, branch naming patterns, or collision handling details
- Subsequent steps are re-numbered sequentially (old Step 4 becomes Step 5, etc.)
- Total step count in the prompt is updated to reflect the new step

#### Files Affected

- `src/prompts/create-goal.md` — add branch checkout step, re-number subsequent steps

### Step 3: Inject PR creation into finalize-goal prompt

Add a new step after Step 9 (Produce summary output) and before Step 10 (Signal completion) in `src/prompts/finalize-goal.md`. The step instructs the agent to create a pull request for the goal's changes, following the PR Creation Protocol from the pio-git skill.

The prompt states WHAT (create a PR) and delegates HOW to the skill by name only. No `gh pr create` references, no auth checks, no branch pushing — all in the skill. Re-number subsequent steps accordingly.

**Parallel with Step 2** — this step is independent of Step 2. Both depend on Step 1 completing first.

#### Acceptance Criteria

- `src/prompts/finalize-goal.md` contains a new step after old Step 9 instructing PR creation
- The new step references "PR Creation Protocol" from the "pio-git" skill by name
- The step contains no `gh pr create` commands, auth checks, or branch pushing details
- Subsequent steps are re-numbered sequentially (old Step 10 becomes Step 11, etc.)
- Total step count in the prompt is updated to reflect the new step

#### Files Affected

- `src/prompts/finalize-goal.md` — add PR creation step, re-number subsequent steps

## Notes

- **SPECIFICATION.md as authority:** `.pio/goals/git-lifecycle/SPECIFICATION.md` is the authoritative source for protocol details, edge cases, and section ordering. Follow it exactly.
- **No capability code changes:** This goal modifies only markdown files (skill + prompts). No TypeScript, no tests, no CI changes.
- **SKILL.md size:** Adding two substantial protocols will grow `src/skills/pio-git/SKILL.md` significantly. If the file exceeds ~200 lines after Step 1, consider moving protocol details to a REFERENCE.md per write-a-skill conventions (split when SKILL.md exceeds 100 lines for advanced features). However, the existing skill is ~65 lines and protocols can be concise if they follow progressive disclosure — keep commands in the skill but move exhaustive edge case tables to a reference file only if needed.
- **Base branch tracking:** SPECIFICATION.md mentions recording the base branch so PR creation (finalize-goal) knows the target. Since this is skill+prompt-only with no capability code changes, the mechanism may be a metadata note in GOAL.md or reliance on the current branch context at finalize-time. The executor should use whatever mechanism the specification prescribes.
- **Steps 2 and 3 can execute in parallel** since they modify independent files.
