# Task: Add Branch Checkout and PR Creation protocols to pio-git skill

Add two new protocol sections (Branch Checkout, PR Creation) and update the Future Extensibility section in `src/skills/pio-git/SKILL.md`, following `.pio/goals/git-lifecycle/SPECIFICATION.md` exactly.

## Context

The pio-git skill currently handles staged commits but has no branch checkout or PR creation capabilities. The specification at `.pio/goals/git-lifecycle/SPECIFICATION.md` defines complete protocols for both operations. These are skill + prompt only — no capability code changes. Steps 2 and 3 of the plan will inject references to these protocols into `create-goal.md` and `finalize-goal.md` respectively, so this step must produce self-contained, executable skill sections that downstream prompts can invoke by name only.

## What to Build

Modify `src/skills/pio-git/SKILL.md` with three changes:

1. **Add "Branch Checkout Protocol" section** — placed after "Staged Commit Protocol". Provides step-by-step instructions for checking out a dedicated branch when a goal is created, including convention lookup, collision resolution, subgoal detection, and edge case handling.

2. **Add "PR Creation Protocol" section** — placed after "Branch Checkout Protocol". Provides step-by-step instructions for creating a pull request when a goal is finalized, including `gh` CLI verification, pre-creation checks, PR title/body construction, and edge case handling.

3. **Update "Future Extensibility" section** — remove the existing bullet points for branch checkout and PR creation (now implemented). Replace with forward-looking items: cherry-pick protocol, tag creation on release, and a git worktree exclusion note referencing §4 of SPECIFICATION.md.

### Code Components

#### Branch Checkout Protocol section

Must contain these sub-steps in order, with concrete shell commands:

1. **Subgoal detection** — check if goal workspace path contains `/subgoals/`. If yes, skip the entire protocol. A `grep -q '/subgoals/'` on the path is sufficient.
2. **Verify git repository** — `git rev-parse --show-toplevel`. On failure: warn and skip.
3. **Verify git user config** — `git config user.name` and `git config user.email`. On failure: warn and skip.
4. **Convention lookup** — read `.pio/PROJECT/GIT.md` for branch naming patterns (e.g., `feat/<feature-name>`). Fallback: `feat/<goal-name>`.
5. **Construct branch name** — apply the pattern with the goal name. Lowercase, spaces to hyphens (e.g., goal `Implement Git Lifecycle` → `feat/implement-git-lifecycle`).
6. **Detect current branch** — `git symbolic-ref --short HEAD`. On failure (detached HEAD): warn and skip.
7. **Non-main branch handling** — if current branch is not the main branch (from GIT.md or default `main`), use the current branch as the base: note this for PR target determination downstream.
8. **Branch collision resolution** — `git rev-parse --verify <branch>`. If exists:
   - For top-level goals: call `ask_user` with three options — (a) Reuse existing branch, (b) Create suffixed branch (`-2`, `-3`, etc.), (c) Cancel branching.
   - For subgoals: auto-suffix without prompting.
9. **Checkout the branch** — `git checkout -b <branch>` (or `git checkout -b <branch> <current-branch>` for non-main base).
10. **Edge cases** — document handling for: no git repo, detached HEAD, uncommitted changes (`git checkout -b` fails), shallow clone (warn but proceed).

#### PR Creation Protocol section

Must contain these sub-steps in order, with concrete shell commands:

1. **Subgoal detection** — check if goal workspace path contains `/subgoals/`. If yes, skip the entire protocol.
2. **Verify git repository** — `git rev-parse --show-toplevel`. On failure: warn and skip.
3. **Verify `gh` CLI available** — `command -v gh`. On failure: warn and skip.
4. **Verify `gh` authentication** — `gh auth status`. On failure: warn and skip.
5. **Determine target branch** — read `.pio/PROJECT/GIT.md` for main branch name, fallback `main`, or use the base branch recorded during Branch Checkout Protocol (non-main branch handling).
6. **Get current branch** — `git symbolic-ref --short HEAD`. On failure: warn and skip.
7. **Check for existing PR** — `gh pr list --head <branch> --base <target>`. If found: report URL and skip creation. For re-finalize scenarios: if the existing PR is closed/merged, create a new one.
8. **Check for changes** — `git diff --shortstat <target>...<head>`. If empty: warn and skip.
9. **Push branch to remote** — `git push -u origin <branch>`. On failure: warn and skip.
10. **Construct PR title** — follow GIT.md Conventional Commits format. Pick type based on goal name/summary. If GIT.md has observed types (`feat`, `fix`, `refactor`, etc.), choose the most appropriate one. Fallback: short descriptive one-liner.
11. **Construct PR body** — if GIT.md specifies a PR body template, follow it. Otherwise construct from: GOAL.md summary, PLAN.md step list, per-step SUMMARY.md files (files changed).
12. **Create the PR** — `gh pr create --title "<title>" --body "<body>" --base <target> --head <branch>`.
13. **Edge cases** — document handling for: `gh` not installed, not authenticated, network failure, branch not pushed, no changes, existing PR, not a GitHub repo, re-finalize (existing closed/merged PR).

#### Future Extensibility section update

Remove the two existing bullet points about branch checkout and PR creation. Replace with:
- Cherry-pick protocol for selectively applying commits across branches
- Tag creation on release for versioned deployments
- Git worktree note: reference the exclusion decision from §4 of SPECIFICATION.md (evaluated, excluded due to no parallel workflow requirement, VS Code single-workspace model, and high complexity)

### Approach and Decisions

- **Follow existing Staged Commit Protocol structure:** Use the same patterns — progressive disclosure headers, concrete bash code blocks for commands, graceful failure language. The executor should study the "Staged Commit Protocol" section as the structural template.
- **Follow Convention Lookup Rule pattern:** Both new protocols must reference `.pio/PROJECT/GIT.md` as the authority (branch naming, commit format for PR titles, target branch). This is consistent with the existing Convention Lookup Rule.
- **Graceful failure throughout:** Every git operation warns on failure and never blocks workflow completion. Follow the "Graceful Failure Semantics" section's language: "log a warning and proceed — never block workflow completion".
- **Subgoal detection is an early skip:** Both protocols check `/subgoals/` in the goal workspace path as the first logical step (after or alongside git repo verification). This is a single conditional — no new protocol sections required.
- **No capability code changes:** This modifies only `src/skills/pio-git/SKILL.md`. No TypeScript, no tests, no CI changes.
- **SPECIFICATION.md is authoritative:** `.pio/goals/git-lifecycle/SPECIFICATION.md` §§1 and 2 are the exact source for protocol steps, edge cases, collision resolution options, and PR construction rules. Follow them verbatim in spirit — convert spec descriptions into skill instruction format.
- **File size management:** The current SKILL.md is ~65 lines. Adding two substantial protocols will grow it significantly. Per write-a-skill conventions: if SKILL.md exceeds 100 lines for advanced features, split details to `REFERENCE.md`. However, the acceptance criteria caps at 200 lines total. Use progressive disclosure — keep essential commands and decision points in SKILL.md; move exhaustive edge case tables or verbose examples to a `REFERENCE.md` in the same directory if needed. The current file size constraint (under 200 lines) is the hard limit; use REFERENCE.md only to manage readability while staying within bounds.

## Dependencies

None. This is Step 1 — Steps 2 and 3 depend on this step completing first.

## Files Affected

- `src/skills/pio-git/SKILL.md` — add "Branch Checkout Protocol" section, add "PR Creation Protocol" section, update "Future Extensibility" section
- `src/skills/pio-git/REFERENCE.md` — created (optional): split out exhaustive edge case details if SKILL.md approaches 200 lines

## Acceptance Criteria

- `src/skills/pio-git/SKILL.md` contains a "Branch Checkout Protocol" section with all sub-steps from SPECIFICATION.md §1: subgoal detection, git repo verification, user config verification, convention lookup, branch name construction, current branch detection, non-main branch handling, collision resolution (ask_user for top-level, auto-suffix for subgoals), checkout command
- `src/skills/pio-git/SKILL.md` contains a "PR Creation Protocol" section with all sub-steps from SPECIFICATION.md §2: subgoal detection, git repo verification, gh CLI verification, auth verification, target branch determination, existing PR check, changes check, branch push, PR title construction (Conventional Commits from GIT.md), PR body construction, `gh pr create` command
- Section ordering is: Convention Lookup Rule → Staged Commit Protocol → Branch Checkout Protocol → PR Creation Protocol → Graceful Failure Semantics → Future Extensibility
- "Future Extensibility" section no longer lists branch checkout or PR creation as planned additions
- "Future Extensibility" section includes: cherry-pick protocol, tag creation on release, git worktree exclusion note referencing SPECIFICATION.md §4
- Both protocols include subgoal detection (`/subgoals/` path check) as an early step
- Both protocols follow graceful failure semantics (warn on failure, never block)
- All shell commands are concrete and match SPECIFICATION.md specifications: `git rev-parse --show-toplevel`, `git config user.name`, `git config user.email`, `git symbolic-ref --short HEAD`, `git rev-parse --verify <branch>`, `git checkout -b <branch>`, `command -v gh`, `gh auth status`, `gh pr list`, `git diff --shortstat`, `git push -u origin`, `gh pr create`
- SKILL.md stays under 200 lines total (use REFERENCE.md split per write-a-skill conventions if needed)

## Risks and Edge Cases

- **File size:** Adding two substantial protocols to a ~65-line file will grow it significantly. Monitor line count carefully — use progressive disclosure and consider REFERENCE.md if the 200-line limit is approached.
- **Base branch tracking for PR target:** The Branch Checkout Protocol must somehow communicate the base branch (when on a non-main branch) to the PR Creation Protocol. Since this is skill+prompt-only with no shared state mechanism, the executor should handle this by instructing the agent to record the base branch context or by having PR Creation re-detect it at finalize-time from GIT.md. Follow whatever mechanism SPECIFICATION.md prescribes.
- **Collision resolution `ask_user` format:** The Branch Checkout Protocol must specify exact `ask_user` options (reuse, suffix, cancel). Ensure the protocol describes the `ask_user` call clearly so the executor agent knows exactly what to present.
- **Re-finalize scenario:** PR Creation must handle the case where a goal is finalized multiple times — check for existing PR first, create new one only if existing PR is closed/merged.
