# Implement Git Lifecycle

Implement branch checkout on `create-goal` and PR creation on `finalize-goal` per the specification at `.pio/goals/git-lifecycle/SPECIFICATION.md`. The implementation is skill + prompt only — no capability code changes. Branch checkout protocol, PR creation protocol, and prompt injection steps follow the existing Staged Commit Protocol pattern: prompts define WHAT, skills define HOW.

### Recommended Skills

Before planning or implementing, load these skills:

- **pio-git** (`src/skills/pio-git/SKILL.md`) — the primary file being modified. Load to understand existing protocol patterns (Convention Lookup Rule, Staged Commit Protocol, Graceful Failure Semantics) that the new sections must follow.
- **write-a-skill** (via `<available_skills>`) — provides SKILL.md structure guidelines, description requirements, and review checklist. The new Branch Checkout and PR Creation protocols are skill section additions; follow write-a-skill conventions for protocol structure, progressive disclosure, and line-length discipline.
- **pio-planning** (`src/skills/pio-planning/SKILL.md`) — PLAN.md structure, step design rules, and acceptance criteria guidelines. Load when creating the implementation plan.

## Current State

- **`src/skills/pio-git/SKILL.md`** — Contains "Convention Lookup Rule", "Staged Commit Protocol" (stage from `SUMMARY.md` or `git status --porcelain`, commit with GIT.md conventions), "Graceful Failure Semantics", and "Future Extensibility" section. The Future Extensibility section explicitly calls out branch checkout on `create-goal` and PR creation on `finalize-goal` as planned additions. No branch checkout or PR creation logic exists yet.

- **`src/prompts/create-goal.md`** — 5-step process: (1) Understand goal, (2) Light research, (3) Fill gaps, (4) Write GOAL.md, (5) Signal completion. No git operations — the agent writes GOAL.md directly on whatever branch is current.

- **`src/prompts/finalize-goal.md`** — 10-step process: reads PLAN.md, SUMMARY.md files, DECISIONS.md, evaluates against update rules, writes to `.pio/PROJECT/*.md`, produces summary, signals completion. No PR creation or branch management.

- **`.pio/PROJECT/GIT.md`** — Documents: Conventional Commits format (`type(scope): description`), observed types (`feat`, `refactor`, `fix`, `chore`, `test`, `docs`), branch naming patterns (`feat/<feature-name>`, `refactor/<description>`), main branch is `main`, merge PRs (not squash). No GPG signing.

- **`.pio/goals/git-lifecycle/SPECIFICATION.md`** — Complete specification covering: Branch Checkout Protocol (§1) with convention lookup, collision resolution (`ask_user` for top-level, auto-suffix for subgoals), non-main branch handling, edge cases; PR Creation Protocol (§2) with `gh` CLI verification, pre-creation checks, PR title/body construction, target branch determination; Subgoal strategy (§3) — top-level goals only, skip subgoals via `/subgoals/` path check; Git worktrees (§4) — excluded from scope; Implementation plan (§5) — specific file changes with section placement.

## To-Be State

### Changes to `src/skills/pio-git/SKILL.md`

**1. Branch Checkout Protocol** — new section placed after "Staged Commit Protocol", before "PR Creation Protocol". Contains:
- Subgoal detection as first step (`/subgoals/` path check — skip if subgoal)
- Git repo and user config verification with graceful failure
- Convention lookup from `.pio/PROJECT/GIT.md` for branch naming patterns, fallback `feat/<goal-name>`
- Branch name construction from goal name (lowercase, spaces to hyphens)
- Current branch detection via `git symbolic-ref --short HEAD`
- Non-main branch handling: use current branch as base, note for PR target
- Branch collision resolution: `ask_user` with three options for top-level goals (reuse, suffix, cancel); auto-suffix for subgoals
- Edge cases: no git repo, detached HEAD, uncommitted changes, shallow clone
- Concrete shell commands for each step

**2. PR Creation Protocol** — new section placed after "Branch Checkout Protocol", before "Future Extensibility". Contains:
- Subgoal detection as first step (skip if subgoal)
- `gh` CLI availability (`command -v gh`) and auth verification (`gh auth status`)
- Target branch determination: read from GIT.md main branch name, fallback `main`, or use non-main base from branch checkout
- Pre-creation checks: existing PR (`gh pr list`), changes exist (`git diff --shortstat`), branch pushed (`git push -u origin`)
- PR title construction: follow GIT.md Conventional Commits format, pick type based on goal name/summary
- PR body construction: follow GIT.md template if present, otherwise construct from GOAL.md summary, PLAN.md steps, per-step SUMMARY.md files
- `gh pr create` command with `--title`, `--body`, `--base`, `--head` flags
- Edge cases: gh not installed, not authenticated, network failure, no changes, existing PR, not a GitHub repo, re-finalize

**3. Future Extensibility section** — remove or update the existing entries for branch checkout and PR creation (now implemented). Replace with other future extensions: cherry-pick protocol, tag creation on release, git worktree note referencing the exclusion decision from §4 of SPECIFICATION.md.

### Changes to `src/prompts/create-goal.md`

Add a new step between Step 3 (Fill gaps) and Step 4 (Write GOAL.md). The step instructs: "Before writing GOAL.md, checkout a dedicated branch for this goal. Follow the Branch Checkout Protocol from the pio-git skill." The prompt states WHAT (checkout a branch) and delegates HOW to the skill by name only. No shell commands, no branch naming details, no collision handling — all in the skill.

### Changes to `src/prompts/finalize-goal.md`

Add a new step after Step 9 (Produce summary output) and before Step 10 (Signal completion). The step instructs: "After producing the summary, create a pull request for this goal's changes. Follow the PR Creation Protocol from the pio-git skill." The prompt states WHAT (create a PR) and delegates HOW to the skill by name only. No `gh pr create` references, no auth checks, no branch pushing — all in the skill.

### Constraints

- **Graceful failure throughout:** All git operations warn on failure, never block workflow completion
- **GIT.md is authority:** Branch naming, PR formats, target branch all come from `.pio/PROJECT/GIT.md` with defined fallbacks
- **Subgoal detection:** Both protocols skip when goal workspace path contains `/subgoals/`
- **No capability code changes:** Skill + prompt only, consistent with existing Staged Commit Protocol pattern
- **Follow SPECIFICATION.md exactly:** The specification at `.pio/goals/git-lifecycle/SPECIFICATION.md` is the authoritative source for protocol steps, edge cases, and file change locations
