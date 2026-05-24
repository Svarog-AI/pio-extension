# Specification: Full Git Lifecycle in pio

Consolidated specification covering end-to-end git integration for the pio workflow. Synthesized from research in Steps 1–2. Actionable as input to a follow-up `create-plan` for implementation.

**Core pio principle: prompts define WHAT, skills define HOW.**

This is the governing separation of concerns for all pio workflow extensions:

- **Prompts** (`src/prompts/*.md`) define **what** should happen — the workflow steps, the order of operations, and the goals to achieve. A prompt never contains shell commands, bash scripts, or implementation details. It references a skill by name and delegates execution.
- **Skills** (`src/skills/*/SKILL.md`) define **how** to do it — the concrete protocols, shell commands, error handling, and edge case logic. A skill is capability-agnostic — any prompt can invoke it.

This document specifies *what* the git lifecycle should do. All executable shell commands and step-by-step instructions belong in `src/skills/pio-git/SKILL.md`. The capability prompts (`create-goal.md`, `finalize-goal.md`) only reference the skill by name.

---

## §1 — Branch checkout on `create-goal`

When a goal workspace is created, the agent should checkout a dedicated branch before writing `GOAL.md`. This isolates goal work from the main branch and enables PR-based review.

### Branch Checkout Protocol

A new section in `src/skills/pio-git/SKILL.md` (see §5 for placement). The skill protocol instructs the agent to execute these steps in order during `create-goal`, before writing `GOAL.md`:

**Steps (to be written into the skill):**

1. **Verify git repository exists** — `git rev-parse --show-toplevel`. On failure: warn and skip.
1b. **Subgoal detection** — check if goal workspace path contains `/subgoals/`. If yes: skip the protocol entirely (subgoals commit inline on the parent branch).
2. **Verify git user config** — `git config user.name` and `git config user.email`. On failure: warn and skip.
3. **Convention lookup** — read `.pio/PROJECT/GIT.md` for branch naming patterns. Fallback: `feat/<goal-name>`.
4. **Construct branch name** — apply the pattern with the goal name (e.g., `feat/git-lifecycle`).
5. **Detect current branch** — `git symbolic-ref --short HEAD`. On failure (detached HEAD): warn and skip.
6. **Check for branch collision** — `git rev-parse --verify <branch>`. If exists: resolve per §1.3. If not: `git checkout -b <branch>` (off current branch).

All shell commands are the responsibility of the skill — the spec documents the logic, the skill provides the executable instructions.

### Convention lookup

Branch naming patterns come from `.pio/PROJECT/GIT.md`. The agent must read this file and extract the branch naming pattern (e.g., `feat/<feature-name>`). If the file does not exist or does not specify a pattern, fall back to `feat/<goal-name>`.

### §1.3 — Branch collision resolution

When the derived branch name already exists, resolve as follows:

**Top-level goals:** Call `ask_user` with three options:
- **Reuse existing branch:** `git checkout <branch>` and continue. Resumes work on the existing branch.
- **Create suffixed branch:** Append `-2`, `-3`, etc. until a free name is found (e.g., `feat/git-lifecycle-2`).
- **Cancel branching:** Skip branching, continue goal creation on the current branch.

**Subgoals (path contains `/subgoals/`):** Auto-suffix without prompting. Append `-2`, `-3`, etc. until a free name is found. Subgoals spawn automatically during `evolve-plan` — `ask_user` is impractical in this context.

### Non-main branch handling

When the current branch is not `main` (detected via `git symbolic-ref --short HEAD`):

1. Use the current branch as the base for the new branch: `git checkout -b <branch-name> <current-branch>`
2. The current branch becomes the PR target (not `main`). This is relevant for §2 (PR creation).
3. This supports the workflow of creating goals from feature branches, hotfix branches, or release branches.

### Edge cases

| Edge Case | Handling |
|-----------|----------|
| No git repository | `git rev-parse --show-toplevel` fails → skip all git operations silently |
| Detached HEAD | `git symbolic-ref --short HEAD` fails → warn, skip branching |
| Git not configured | `git config user.name` or `user.email` empty → warn, skip |
| Uncommitted changes | `git checkout -b` fails with overwrite error → warn agent, do not force checkout. Let agent decide (stash, commit, or discard) |
| Shallow clone | `git rev-parse --is-shallow-repository` returns `true` → warn but proceed. Branching works normally |

### Required file changes

- **`src/skills/pio-git/SKILL.md`:** Add a "Branch Checkout Protocol" section containing the steps above. Place after "Staged Commit Protocol", before "Future Extensibility".
- **`src/prompts/create-goal.md`:** Add a step before Step 4 (Write GOAL.md) instructing the agent to follow the Branch Checkout Protocol from the pio-git skill. The step should reference the skill by name and pass the goal name as context.

---

## §2 — PR creation on `finalize-goal`

When a goal is finalized, the agent should create a pull request to review and eventually merge the goal's changes. This uses `gh pr create` via the `bash` tool.

### PR Creation Protocol

A new section in `src/skills/pio-git/SKILL.md` (see §5 for placement). The skill protocol instructs the agent to execute these steps in order during `finalize-goal`, after updating PROJECT files:

**Steps (to be written into the skill):**

1. **Verify git repository exists** — `git rev-parse --show-toplevel`. On failure: warn and skip.
1b. **Subgoal detection** — check if goal workspace path contains `/subgoals/`. If yes: skip the protocol entirely (subgoals commit inline on the parent branch).
2. **Verify `gh` CLI available** — `command -v gh`. On failure: warn and skip.
3. **Verify `gh` authentication** — `gh auth status`. On failure: warn and skip.
4. **Determine target branch** — default `main`, or from `.pio/PROJECT/GIT.md`, or from the base branch recorded during §1 branch checkout.
5. **Get current branch** — `git symbolic-ref --short HEAD`. On failure: warn and skip.
6. **Check for existing PR** — `gh pr list --head <branch> --base <target>`. If found: report URL and skip.
7. **Check for changes** — `git diff --shortstat <target>...<head>`. If empty: warn and skip.
8. **Push branch** — `git push -u origin <branch>`. On failure: warn and skip.
9. **Construct PR title and body** — per formats below.
10. **Create the PR** — `gh pr create --title <title> --body <body> --base <target> --head <branch>`.

All shell commands are the responsibility of the skill — the spec documents the logic, the skill provides the executable instructions.

### PR title format

Read `.pio/PROJECT/GIT.md` for the commit message format (Conventional Commits or custom). The skill must follow whatever format GIT.md specifies — including type, scope, and separator conventions. If GIT.md documents observed types (`feat`, `fix`, `refactor`, etc.), the agent should pick the most appropriate one based on the goal name and summary. If GIT.md does not exist, fall back to a short descriptive one-liner.

### PR body format

If `.pio/PROJECT/GIT.md` specifies a PR body format or template, follow it exactly. Otherwise, the skill should instruct the agent to construct a body from available goal artifacts: `GOAL.md` (summary), `PLAN.md` (step list), and per-step `SUMMARY.md` files (files changed). The exact structure is not prescribed by this spec — it defers to project conventions in GIT.md.

### Target branch determination

Read `.pio/PROJECT/GIT.md` for the default target branch. If not specified, use `main`. If the goal was created from a non-main branch (detected during branch checkout in §1), use that branch as the PR target instead. The agent should record the base branch in the goal workspace (e.g., in `transitions.json` or a metadata file) so it can be retrieved during finalize.

### Pre-creation checks

The protocol must verify these conditions before attempting PR creation:

| Check | Command | Failure handling |
|-------|---------|-----------------|
| `gh` CLI installed | `command -v gh` | Skip silently, warn |
| `gh` authenticated | `gh auth status` | Skip, warn |
| Branch pushed to remote | `git push -u origin <branch>` | Skip on push failure, warn |
| Changes exist on branch | `git diff --shortstat <base>..<head>` | Skip if empty, warn |
| No existing PR | `gh pr list --head <branch>` | Report existing URL, skip creation |
| Remote is a GitHub repo | `gh pr create` (implicit) | Skip on error, warn |

### `gh pr create` supporting evidence

`gh` is the GitHub CLI — it supports PR creation via `gh pr create` with the following relevant flags:

| Flag | Purpose |
|------|---------|
| `--title` | PR title (Conventional Commits format) |
| `--body` | PR description (goal summary, steps, files) |
| `--base` | Target branch |
| `--head` | Source branch |
| `--draft` | Create as draft PR (optional, for iterative review) |

Authentication: `gh auth login` stores credentials (PAT, GitHub Apps, OAuth). Verification via `gh auth status`. Platform: GitHub only.

### Edge cases

| Edge Case | Handling |
|-----------|----------|
| `gh` not installed | `command -v gh` fails → skip silently, warn |
| Not authenticated | `gh auth status` fails → skip, warn |
| Network failure | `gh pr create` exits non-zero → skip, warn |
| Branch not pushed | Push first with `git push -u origin <branch>`. Skip on push failure |
| No changes on branch | `git diff --shortstat` empty → skip, warn |
| Existing PR | `gh pr list` finds PR → report URL, skip creation |
| Not a GitHub repo | `gh pr create` fails → skip silently, warn |
| Interrupted workflow (re-finalize) | Check for existing PR first. If found, report URL. If closed/merged, create new one |

### Required file changes

- **`src/skills/pio-git/SKILL.md`:** Add a "PR Creation Protocol" section containing the steps above. Place after "Branch Checkout Protocol", before "Future Extensibility".
- **`src/prompts/finalize-goal.md`:** Add a step after Step 9 (Produce summary output) instructing the agent to follow the PR Creation Protocol from the pio-git skill. The step should reference the skill by name and pass the goal name as context.

---

## §3 — Subgoal branching strategy

### Recommendation: Top-level goals only

Only top-level goals (created via `/pio-create-goal` at the repo root) get independent branches. Subgoals (created via `evolve-plan` with `complexity: "subgoal"`) explicitly skip branching — they commit inline on the parent branch.

### Rationale

- **Implementation simplicity:** Requires only a path-based check (`/subgoals/` in the goal workspace path) in the Branch Checkout Protocol. No new protocols, no checkout switching.
- **IDE workflow fit:** No branch switching during subgoal execution. VS Code stays on the parent goal's branch throughout. The user reviews all changes on a single branch.
- **History quality:** Top-level goals get clean isolated branches. Subgoal work is traceable via commit message scoping (`feat(subgoal-name): ...`). Sufficient for most workflows.
- **Deep nesting:** Avoids the branch name explosion of per-subgoal branching (`feat/goal/subgoal/nested/sub-subgoal`). With top-level-only, nesting depth has no impact on branches.
- **Natural alignment:** Top-level goals are user-initiated and explicit; subgoals are auto-spawned by `evolve-plan`. The branching distinction maps cleanly to this user model.

### Detection mechanism

Both protocols in the skill must check for subgoal context as an early step. The check: does the goal workspace path contain `/subgoals/`? If yes, skip the protocol entirely.

The goal workspace path is available from the session context (e.g., `.pio/goals/<parent>/S{NN}/subgoals/<name>/`). A `grep -q '/subgoals/'` on the path is sufficient — no need to parse the full hierarchy.

### Impact on pio-git skill

Both the Branch Checkout Protocol and PR Creation Protocol must include the subgoal detection check as the first step (after the git repo verification). This is a single conditional in each protocol — no new protocol sections required.

---

## §4 — Git worktrees assessment

### Decision: Excluded from scope

Git worktrees (`git worktree add`) are explicitly excluded from the git lifecycle specification.

### Rationale

1. **No workflow requirement:** The pio session queue enforces sequential execution (one task per goal slot). Parallel goal development is not a stated requirement. Worktrees solve a problem that pio does not have.
2. **Single-IDE constraint:** VS Code opens one workspace at a time. Multi-worktree operation requires separate VS Code instances or confusing multi-root workspaces. The user reviews changes in a single IDE — worktrees fragment this experience.
3. **High complexity, low value:** Worktree management (add, remove, prune) adds significant failure surface. Cross-worktree state tracking and agent path management are fragile. The implementation cost far exceeds the benefit.
4. **Simpler alternatives exist:** Branch switching achieves the same outcome (working on multiple branches over time) without worktree overhead. For truly parallel development, separate VS Code instances on the same repo is simpler.
5. **Future revisitable:** If parallel goal development becomes a stated requirement, worktrees can be revisited with a clearer use case. The pio-git skill structure (Convention Lookup Rule, graceful failure) provides a foundation for future worktree support.

### Preserved statement for future reference

> Git worktrees were evaluated and excluded from the git lifecycle specification. Primary constraints: (1) no pio workflow requirement for parallel goal development, (2) VS Code's single-workspace model conflicts with multi-worktree operation, (3) high implementation complexity with low value relative to branch switching. This decision can be revisited if parallel goal development becomes a stated requirement.

---

## §5 — Implementation plan

### Changes to `src/skills/pio-git/SKILL.md`

Add two new protocol sections between "Staged Commit Protocol" and "Future Extensibility":

**1. "Branch Checkout Protocol"** — new section containing:
- Convention lookup from `.pio/PROJECT/GIT.md` for branch naming patterns
- Branch name construction from goal name
- Subgoal detection check (`/subgoals/` path check) — skip if subgoal
- Git repo and user config verification
- Branch collision resolution: `ask_user` for top-level goals, auto-suffix for subgoals
- Non-main branch detection and handling
- Concrete shell commands (as documented in §1)
- Graceful failure semantics (warn on failure, never block)

**2. "PR Creation Protocol"** — new section containing:
- Subgoal detection check — skip if subgoal
- `gh` CLI availability and auth verification
- Target branch determination (default `main`, configurable via GIT.md)
- Pre-creation checks: existing PR, changes exist, branch pushed
- PR title format (Conventional Commits from goal name)
- PR body format (goal summary, steps completed, files changed)
- Concrete `gh pr create` command with flags (as documented in §2)
- Graceful failure semantics (warn on failure, never block)

**3. Update "Future Extensibility" section** — remove or update the existing entries for branch checkout and PR creation, since they are now implemented. The section can note other future extensions (e.g., cherry-pick protocol, tag creation on release).

### Changes to `src/prompts/create-goal.md`

Add a step between Step 3 (Fill gaps) and Step 4 (Write GOAL.md).

**Prompt (WHAT):** "Before writing GOAL.md, checkout a dedicated branch for this goal. Follow the Branch Checkout Protocol from the pio-git skill."

The prompt states *what* to do (checkout a branch) and delegates *how* to the skill. It never mentions `git checkout`, branch naming patterns, or collision handling — all of that lives in the skill.

### Changes to `src/prompts/finalize-goal.md`

Add a step after Step 9 (Produce summary output) and before Step 10 (Signal completion).

**Prompt (WHAT):** "After producing the summary, create a pull request for this goal's changes. Follow the PR Creation Protocol from the pio-git skill."

The prompt states *what* to do (create a PR) and delegates *how* to the skill. It never mentions `gh pr create`, auth checks, or branch pushing — all of that lives in the skill.

### Capability code changes

**None recommended.** Both branch checkout and PR creation are fully implementable via skill protocols + prompt instructions. The unified skill + prompt approach is consistent with the existing Staged Commit Protocol and avoids introducing git dependencies into capability code.

### Proposed plan steps for a follow-up goal

1. **Add Branch Checkout Protocol to pio-git skill** — Write the "Branch Checkout Protocol" section in `src/skills/pio-git/SKILL.md` with convention lookup, collision resolution, subgoal detection, and graceful failure. Update "Future Extensibility" section.

2. **Inject branch checkout into create-goal prompt** — Modify `src/prompts/create-goal.md` to add a step before GOAL.md writing that references the Branch Checkout Protocol.

3. **Add PR Creation Protocol to pio-git skill** — Write the "PR Creation Protocol" section in `src/skills/pio-git/SKILL.md` with `gh` verification, PR title/body construction, pre-creation checks, and graceful failure.

4. **Inject PR creation into finalize-goal prompt** — Modify `src/prompts/finalize-goal.md` to add a step after summary output that references the PR Creation Protocol.

5. **End-to-end validation** — Verify the full workflow: create-goal checks out a branch, execute-task commits on the branch, finalize-goal creates a PR. Test edge cases: branch collision, subgoal skipping, no git repo, `gh` not installed.
