# Specification: Full Git Lifecycle in pio

## Section 1: Integration Points

### 1.1 Branch checkout on `create-goal`

#### Extension point analysis

**Option A: Prompt instructions in `src/prompts/create-goal.md`**

- **Mechanism:** Add a step to the create-goal prompt instructing the agent to run `git checkout -b feat/<goal-name>` before writing `GOAL.md`.
- **Pros:** Zero code changes. Follows existing pio pattern where git operations are skill+prompt-driven (see `pio-git` skill). Agent has full context about goal name and can construct branch name.
- **Cons:** No enforcement — agent could skip or forget. Branch naming is not validated. No convention lookup from GIT.md unless explicitly instructed. If agent fails to checkout, GOAL.md still writes to working tree on whatever branch is active.
- **Feasibility:** High. The create-goal prompt already instructs the agent to do specific things in order. Adding a "checkout branch first" step is a natural extension.

**Option B: New protocol section in `src/skills/pio-git/SKILL.md`**

- **Mechanism:** Add a "Branch Checkout Protocol" section to the pio-git skill. The create-goal prompt references this skill for branching instructions.
- **Pros:** Centralized git knowledge. Reusable by other capabilities that need branching. Follows existing skill structure (Convention Lookup Rule, Staged Commit Protocol).
- **Cons:** Still prompt-driven — relies on agent following instructions. Requires the create-goal prompt to explicitly load and follow the pio-git skill for branching.
- **Feasibility:** High. The pio-git skill already has a "Future Extensibility" section explicitly calling out this operation. The skill loading mechanism already loads pio-git for execute-task agents.

**Option C: Capability code changes in `src/capabilities/create-goal.ts`**

- **Mechanism:** Add git checkout logic to `prepareGoal()` (runs before `launchCapability`) or to a new `prepareSession` callback in `CAPABILITY_CONFIG`.
- **Pros:** Guaranteed execution. Can validate branch naming conventions programmatically. Can handle edge cases (branch exists, no repo) with deterministic logic.
- **Cons:** Requires code changes to a capability module. Introduces git dependency into capability code (currently git-free). Adds complexity to the `prepareGoal()` flow.
- **Feasibility:** Medium. `prepareGoal()` is synchronous and simple — adding git operations would require `child_process` or similar. Error handling for all edge cases would be non-trivial.

**Option D: `prepareSession` hook in `session-capability.ts`**

- **Mechanism:** Define a `prepareSession` callback in `CAPABILITY_CONFIG` for create-goal. Runs during `resources_discover` (line ~175 of `session-capability.ts`) with error handling — does not crash the session on failure.
- **Code evidence:** `session-capability.ts` line ~175:
  ```typescript
  if (config.prepareSession && config.workingDir) {
    try {
      await config.prepareSession(config.workingDir!, enrichedSessionParams);
    } catch (err) {
      console.warn(`pio: prepareSession failed for capability "${config.capability}": ${err}`);
    }
  }
  ```
- **Pros:** Graceful failure built-in (errors are caught and logged, session continues). Runs before the agent starts. Has access to `workingDir` and `enrichedSessionParams` (including goal name). Async support. Fits the capability lifecycle perfectly.
- **Cons:** Requires code changes to `create-goal.ts` to define the `prepareSession` callback. Introduces git operations into capability code.
- **Feasibility:** High. The hook is designed exactly for this use case — preparation before the agent runs, with graceful failure semantics.

**Recommendation: Option B (skill protocol) referenced from Option A (prompt instructions).**

Branch checkout should follow the same skill+prompt pattern as the existing Staged Commit Protocol — no capability code changes. The pio-git skill should add a "Branch Checkout Protocol" section that specifies:
1. Convention lookup from `.pio/PROJECT/GIT.md` for branch naming patterns
2. Branch name construction from goal name (e.g., `feat/<goal-name>`)
3. Collision handling: reuse existing branch (checkout and continue)
4. Graceful failure: skip on no git repo, detached HEAD, uncommitted changes
5. Non-main branch detection: use current branch as base

The create-goal prompt should add a step instructing the agent to follow the Branch Checkout Protocol from the pio-git skill before writing GOAL.md. This keeps all git operations in the skill layer — consistent with the existing Staged Commit Protocol and the GOAL.md constraint of no capability code changes unless absolutely necessary.

### 1.2 PR creation on `finalize-goal`

#### Extension point analysis

**Option A: Prompt instructions in `src/prompts/finalize-goal.md`**

- **Mechanism:** Add a step to the finalize-goal prompt instructing the agent to run `gh pr create` after updating PROJECT files.
- **Pros:** Zero code changes. Agent can construct PR title/body from GOAL.md, SUMMARY.md content. Flexible — agent can handle edge cases adaptively.
- **Cons:** No enforcement. PR might not be created if agent skips the step. `gh` auth state is not verified. Agent might create a PR with poor title/body.
- **Feasibility:** High. The finalize-goal prompt already has a 10-step process. Adding a "create PR" step after step 9 (summary) is straightforward.

**Option B: New protocol section in `src/skills/pio-git/SKILL.md`**

- **Mechanism:** Add a "PR Creation Protocol" section to the pio-git skill. The finalize-goal prompt references this skill for PR instructions.
- **Pros:** Centralized git knowledge. Defines PR title/body format, target branch determination, and error handling in one place. Reusable across capabilities.
- **Cons:** Still prompt-driven — relies on agent following instructions. Requires the finalize-goal prompt to explicitly load and follow the pio-git skill for PR creation.
- **Feasibility:** High. The pio-git skill already has a "Future Extensibility" section explicitly calling out PR creation.

**Option C: Capability code changes in `src/capabilities/finalize-goal.ts`**

- **Mechanism:** Add `gh pr create` logic to a `postExecute` callback in `CAPABILITY_CONFIG` or as a new tool handler.
- **Pros:** Guaranteed execution after validation passes. Can construct PR metadata programmatically from goal state. Can verify `gh` auth state before attempting.
- **Cons:** Requires code changes. PR body construction from goal artifacts is complex in code (parsing SUMMARY.md, GOAL.md). Introduces GitHub-specific logic into capability code.
- **Feasibility:** Medium. The `postExecute` hook is ideal for graceful failure, but constructing meaningful PR content programmatically is harder than letting the agent do it.

**Option D: `postExecute` hook in `session-capability.ts`**

- **Mechanism:** Define a `postExecute` callback in `CAPABILITY_CONFIG` for finalize-goal. Runs after transition routing in `pio_mark_complete` (line ~145 of `session-capability.ts`) with non-fatal error handling.
- **Code evidence:** `session-capability.ts` line ~145:
  ```typescript
  if (config.postExecute) {
    try {
      const postExecuteResult = config.postExecute(dir, config.sessionParams);
      if (postExecuteResult instanceof Promise) {
        await postExecuteResult;
      }
    } catch (err) {
      console.warn(`pio: postExecute failed for capability "${config.capability}": ${err}`);
    }
  }
  ```
- **Pros:** Graceful failure built-in. Runs after all validation and transitions. Has access to goal directory and session params. Async support.
- **Cons:** Requires code changes to `finalize-goal.ts`. Constructing PR title/body from goal artifacts in code is complex. The hook runs after the session is essentially done — no way to show PR URL to the agent.
- **Feasibility:** Medium. Good for the git operations (push, create PR) but poor for constructing meaningful PR content.

**Recommendation: Option B (skill protocol) referenced from Option A (prompt instructions).**

PR creation should follow the same skill+prompt pattern as branch checkout — no capability code changes. The pio-git skill should define a "PR Creation Protocol" that specifies:
1. PR title format: derived from goal name and GOAL.md summary
2. PR body format: includes goal summary, list of steps completed, files changed
3. Target branch: default `main`, configurable via GIT.md
4. Error handling: skip on `gh` auth failure, no changes, network errors

The finalize-goal prompt should add a step instructing the agent to follow the PR Creation Protocol from the pio-git skill. This gives the agent full context while ensuring consistent PR formatting.

### 1.3 Summary: Injection point mapping

| Git Operation | Recommended Approach | Implementation Location | Code Changes Required |
|---|---|---|---|
| Branch checkout on `create-goal` | Prompt instructions + skill protocol | `src/prompts/create-goal.md` (step) + `src/skills/pio-git/SKILL.md` (protocol) | No — prompt and skill changes only |
| PR creation on `finalize-goal` | Prompt instructions + skill protocol | `src/prompts/finalize-goal.md` (step) + `src/skills/pio-git/SKILL.md` (protocol) | No — prompt and skill changes only |

**Consistency principle:** Both operations use the same approach — skill protocol + prompt instruction. No capability code changes. This matches the existing pio-git skill pattern (Staged Commit Protocol) and the GOAL.md constraint of no capability code changes unless absolutely necessary. The `prepareSession` and `postExecute` hooks (Options C/D) were evaluated but rejected to maintain architectural consistency.

### 1.4 `gh pr create` evaluation

#### Authentication model

- **Primary auth:** `gh auth login` stores credentials in the system keychain or `~/.config/gh/hosts.yml`. Uses GitHub personal access tokens (PAT), GitHub Apps, or OAuth device flow.
- **Verification:** `gh auth status` returns current auth state. Exit code 0 = authenticated, non-zero = not authenticated or expired.
- **Agent context:** When pi runs inside VS Code, the agent inherits the user's shell environment. If `gh` is authenticated for the user, the agent can use it directly. No special token management required.
- **Fallback:** If `gh auth status` fails, the PR Creation Protocol should skip PR creation with a warning (graceful failure).

#### Key flags for PR creation

| Flag | Purpose | Recommended Usage |
|------|---------|-------------------|
| `--title` | PR title | Derived from goal name: e.g., "feat: <goal-summary>" following Conventional Commits |
| `--body` | PR description | Include: goal summary from GOAL.md, steps completed, files changed from SUMMARY.md |
| `--body-file` | Read body from file | Alternative to `--body` for multi-line content. Write body to temp file first. |
| `--base` | Target branch | Default: `main`. Read from `.pio/PROJECT/GIT.md` if configured. |
| `--head` | Source branch | Default: current branch. Explicit: `feat/<goal-name>`. |
| `--draft` | Create as draft PR | Recommended for goals with many steps — allows iterative review. |
| `--label` | Add labels | Optional. Could auto-add "pio" or "goal/<name>" labels. |
| `--reviewer` | Request reviewers | Optional. Not auto-configured — requires explicit user input. |
| `--fill` | Auto-fill from commits | Not recommended — commit messages may not provide coherent PR body. |

#### Error modes

| Error | `gh` behavior | Recommended handling |
|-------|--------------|---------------------|
| Not authenticated | Exit code 1, error: "you are not logged in" | Skip PR creation, warn agent. Check `gh auth status` first. |
| Branch not pushed | Prompts to push (interactive) or fails with `--head` | Push branch first with `git push -u origin <branch>`. Skip on push failure. |
| No differences from base | Creates empty PR (allowed by `gh`) | Check `git diff --shortstat <base>..<head>` first. Skip if no changes, warn agent. |
| Network failure | Exit code non-zero, connection error | Skip with warning. Retry not attempted (graceful failure). |
| Missing repo (not a GitHub repo) | Exit code 1, error about remote | Skip silently. Not all projects use GitHub. |
| Branch already has a PR | Exit code 1, error about existing PR | Detect existing PR with `gh pr list --head <branch>`. If found, skip creation and report existing PR URL. |
| `gh` CLI not installed | Command not found | Skip silently. Log warning about `gh` not being available. |

#### Platform support

- **GitHub only.** `gh` is the GitHub CLI — it does not support GitLab, Bitbucket, or other platforms.
- **Acceptable per GOAL.md constraints:** "No assumptions about specific git hosting beyond GitHub + gh CLI for PR operations."
- **Alternative for non-GitHub:** The specification should note that PR creation is GitHub-only. For other platforms, the agent can be instructed to create PRs via web UI or platform-specific CLI tools.

### 1.5 Edge case catalog

| Edge Case | Detection Method | Recommended Handling |
|-----------|-----------------|---------------------|
| **No git repository** | `git rev-parse --show-toplevel` fails (exit code ≠ 0) | Skip all git operations silently. No branching, no commits, no PR. This is graceful failure per pio-git conventions. |
| **Detached HEAD state** | `git symbolic-ref --short HEAD` fails (exit code ≠ 0) | Warn but proceed without branching. Use current state. Do not attempt to create a branch from detached HEAD. |
| **Branch already exists** | `git rev-parse --verify feat/<goal-name>` succeeds | **Recommendation: Reuse existing branch.** Run `git checkout feat/<goal-name>` and continue. Do not error/abort — the goal workspace may be a continuation of previous work. If the branch has unmerged changes, the agent should be aware but not blocked. |
| **Goal started from non-main branch** | `git symbolic-ref --short HEAD` returns a non-main branch name | Use current branch as the base for both branching and PR target. Construct branch name as `feat/<goal-name>` off current branch. PR target = current branch (not `main`). |
| **No changes to commit on PR** | `git diff --shortstat <base>..<head>` returns empty | Skip PR creation. Warn agent: "No changes detected on branch. Skipping PR creation." |
| **Interrupted workflow (re-finalize)** | Goal branch exists, PR may exist, goal is re-finalized | Push any new commits with `git push`. Check for existing PR with `gh pr list --head <branch>`. If PR exists, skip creation and report URL. If PR was closed/merged, create a new one. |
| **Git not configured** | `git config user.name` or `git config user.email` returns empty | Skip git operations with a warning. Git will refuse to commit without user config. This is graceful failure per pio-git conventions. |
| **`gh` CLI not installed** | `which gh` or `command -v gh` fails | Skip PR creation silently. Log a warning. Branch checkout (git-only) is unaffected. |
| **Uncommitted changes on branch checkout** | `git checkout -b <branch>` fails with "error: Your local changes to the following files would be overwritten" | **Recommendation:** Warn agent about uncommitted changes. Do not force checkout. Let the agent decide (stash, commit, or discard). This preserves user data. |
| **Shallow clone** | `git rev-parse --is-shallow-repository` returns `true` | Branching works normally. PR creation may have issues with history depth. Warn but proceed. |
