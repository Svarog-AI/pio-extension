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

## Section 2: Branching Strategies

### 2.1 Branch collision resolution

When `create-goal` triggers branch checkout, the branch derived from the goal name (per `.pio/PROJECT/GIT.md` convention lookup, defaulting to `feat/<goal-name>`) may already exist. Four strategies are evaluated below. The preliminary recommendation from Section 1 was "reuse existing" — this section tests that recommendation against alternatives.

#### Strategy A: Reuse existing branch

**Mechanism:** `git checkout <branch>` — if the branch exists, checkout and continue. If it doesn't exist, create it with `git checkout -b <branch>`. Branch name is constructed from the goal name using the pattern from `.pio/PROJECT/GIT.md` (e.g., `feat/<goal-name>`).

**Pros:**
- Simplest implementation — single command path (`git checkout` handles both cases with appropriate flags).
- Supports goal continuation: if a goal was interrupted and the user re-creates it, work resumes on the existing branch with previous commits intact.
- Aligns with the graceful failure principle — no blocking on conflicts.
- Matches developer expectations: re-running `/pio-create-goal` on the same name should resume work, not error.

**Cons:**
- May inherit stale or diverged state from a previous session. The branch could contain partially completed work, merged changes, or commits from a different context.
- If the branch was previously merged and deleted locally but still exists remotely, `git checkout` would fail (branch not found locally). Would need a `git fetch` + fallback.
- No explicit user confirmation — the agent silently continues on a branch that might have unexpected content.

#### Strategy B: Error/abort

**Mechanism:** Check `git rev-parse --verify <branch>`. If it succeeds, report an error and stop. Do not create the goal workspace. Branch name is constructed from the goal name using the pattern from `.pio/PROJECT/GIT.md`.

**Pros:**
- Safest approach — guarantees a clean branch for each goal.
- Forces the user to resolve the conflict explicitly (delete old branch, use a different name, etc.).
- Prevents accidental data corruption from resuming on a stale branch.

**Cons:**
- **Violates the graceful failure principle.** The pio-git skill mandates: "If any git command fails, log a warning and proceed — never block workflow completion." Erroring on branch collision directly contradicts this.
- Blocks the entire workflow — no GOAL.md written, no session launched. The user gets no value from the command.
- No mechanism for the agent to auto-resolve — requires manual intervention every time.

#### Strategy C: Auto-suffix

**Mechanism:** If `<branch>` exists, try `<branch>-2`, then `<branch>-3`, etc. until a free name is found. Base branch name is constructed from the goal name using the pattern from `.pio/PROJECT/GIT.md`.

**Pros:**
- Never blocks — always finds a free branch name.
- Preserves the original branch for the previous goal session.
- No user interaction required.

**Cons:**
- Produces noisy branch names: `feat/git-lifecycle-3` is less readable than `feat/git-lifecycle`. The suffix is not recorded in `.pio/` state.
- Makes it harder to track which branch corresponds to which goal. The `-2` suffix is not recorded anywhere in `.pio/` state.
- On goal re-creation (continuation), the user expects to resume on the original branch, not a new suffixed one. This breaks the continuation use case.
- Branch proliferation: repeated creates/deletes of the same goal accumulate suffixed branches that need manual cleanup.

#### Strategy D: Prompt user via `ask_user`

**Mechanism:** When a collision is detected, call `ask_user` with options: reuse existing, create suffixed branch, or cancel.

**Pros:**
- Gives the user full control over the resolution strategy.
- Can provide context about the existing branch (last commit, divergence from main) to inform the decision.

**Cons:**
- Introduces interaction latency in an otherwise automated flow. The `ask_user` tool requires user input — the session blocks until the user responds.
- Adds complexity to the skill protocol: the agent must handle the `ask_user` call, parse the response, and branch logic accordingly.
- For subgoals (which can spawn automatically during `evolve-plan`), prompting the user is impractical — subgoals may spawn without explicit user initiation.
- The pio-git skill's graceful failure rule ("The agent should not retry or block waiting for user input") governs **retry behavior on git command failure** — it does not prohibit using `ask_user` to present the user with a choice between valid strategies. However, on git failure the agent should advise the user what to do manually rather than prompting for a retry. This constraint is relevant to error handling, not to the collision decision itself.

#### Recommendation: Strategy A (reuse existing) with a refinement

**Reuse existing branch, but warn the agent about the branch state.**

The Branch Checkout Protocol should:
1. **Convention lookup:** Read `.pio/PROJECT/GIT.md` to determine the branch naming pattern (e.g., `feat/<feature-name>`). If GIT.md doesn't exist or doesn't specify a pattern, fall back to `feat/<goal-name>`.
2. **Construct branch name:** Apply the pattern with the goal name (e.g., `feat/<goal-name>`).
3. **Check if the branch exists** with `git rev-parse --verify <branch>`.
4. If it exists: `git checkout <branch>` and proceed. Emit a warning notification: "Branch `<branch>` already exists. Resuming on existing branch."
5. If it doesn't exist: `git checkout -b <branch>` and proceed.
6. On any git error (no repo, detached HEAD, uncommitted changes): skip branching with a warning and continue with goal creation on the current branch.

This refinement of Strategy A adds user visibility (warning notification) without introducing blocking behavior. It supports the continuation use case (most common collision scenario) while alerting the user that they're resuming on an existing branch. The agent can then decide whether the branch state is appropriate for the goal.

**Trade-off summary:**

| Criterion | Reuse (A) | Error (B) | Suffix (C) | Prompt (D) |
|-----------|-----------|-----------|------------|------------|
| Graceful failure | ✅ | ❌ blocks | ✅ | ⚠️ blocks on wait |
| Continuation support | ✅ | ❌ | ❌ new branch | ✅ with user choice |
| Implementation complexity | Low | Low | Medium | High |
| Subgoal compatibility | ✅ | ⚠️ blocks subgoals | ✅ | ❌ impractical |
| User visibility | ⚠️ warning | ✅ explicit error | ❌ silent | ✅ explicit choice |

### 2.2 Subgoal branching options

A subgoal is a nested goal spawned by `evolve-plan` when a step has `complexity: "subgoal"`. Code evidence from `src/capabilities/evolve-plan.ts`: subgoals are created via `pio_create_goal`, which calls `resolveGoalDir(cwd, name, parentStepDir)` from `src/fs-utils.ts`. This resolves to `<parentStepDir>/subgoals/<name>` — a nested path under the parent step folder.

Critically, the subgoal session runs in the **same working directory** as the parent session (`cwd` is the repo root). The subgoal inherits the parent's git context — same working tree, same branch, same index. There is no mechanism for the subgoal to operate on a different branch or worktree.

Four options are evaluated below across three dimensions: git history quality, implementation complexity, and IDE workflow fit.

#### Option 1: Single branch per top-level goal (subgoals commit inline)

**Mechanism:** Subgoals commit directly on the parent goal's branch. No additional branching or checkout operations. The `pio-git` skill's Staged Commit Protocol already handles this — subgoal agents follow the same commit workflow as any other agent.

| Dimension | Assessment |
|-----------|-----------|
| **Git history quality** | Commits from different subgoals are interleaved on the same branch. Traceability is preserved via commit messages referencing the subgoal name (e.g., `feat(subgoal-name): implement X`). However, there is no explicit branch boundary — a `git log` shows a flat history. Merge commits from the top-level PR will include all subgoal work as a single unit. |
| **Implementation complexity** | **Zero additional changes required.** The current behavior already implements this option. No new protocols, no prompt modifications, no skill changes. Subgoals already commit inline on whatever branch the parent session is on. |
| **IDE workflow fit** | **Optimal.** VS Code operates on a single working tree. No branch switching means no workspace reload, no file conflicts, and no review disruption. The user sees all changes accumulate on one branch. |

**Pros:** Simplest approach. Zero implementation cost. Best IDE fit. Works with current architecture.
**Cons:** Flat history — no explicit subgoal boundaries in git. Harder to cherry-pick or revert individual subgoals.

#### Option 2: Branch per subgoal with checkout switching

**Mechanism:** When a subgoal starts (`create-goal` for a nested goal), create a new branch using the pattern from `.pio/PROJECT/GIT.md` with the subgoal name appended (e.g., `<pattern>/<subgoal-name>`). When the subgoal completes (`finalize-goal`), merge back to the parent branch and checkout the parent branch.

Branch name construction: derive base pattern from GIT.md, append subgoal name (e.g., `feat/<goal-name>/<subgoal-name>` as default). For recursive nesting: `feat/<goal>/<subgoal>/<nested-subgoal>`. Branch names grow with each nesting level — functional but verbose at depth.

| Dimension | Assessment |
|-----------|-----------|
| **Git history quality** | **Best traceability.** Each subgoal has an isolated branch with its own commit history. Merging back to the parent creates explicit merge commits: `Merge branch '<pattern>/goal/subgoal' into <pattern>/goal`. Enables cherry-picking, reverting, and reviewing individual subgoals. Deep nesting produces long branch names: `feat/goal/subgoal/nested` — functional but verbose. |
| **Implementation complexity** | **High.** Requires: (1) New "Subgoal Branch Protocol" in `pio-git` skill with branch creation, checkout, merge-back, and cleanup logic. (2) Prompt changes to both `create-goal.md` (checkout subgoal branch) and `finalize-goal.md` (merge back). (3) Handling of nested nesting depth — branch names grow with each level. (4) Error recovery: what happens if merge-back fails? What if the parent branch was deleted? (5) Detection of subgoal vs. top-level goal context (requires checking `parentStepDir` or `.pio/goals/` path). |
| **IDE workflow fit** | **Poor.** VS Code operates on one branch at a time. Branch switching during subgoal execution means: (a) VS Code may reload the workspace on checkout, (b) open files may show conflicts, (c) the user reviewing changes sees a different branch than the parent goal. The single-IDE review constraint makes this difficult. Additionally, the subgoal session runs after the parent session spawned it — the parent session is still active but on a different branch. |

**Pros:** Best git history. Clean subgoal isolation. Enables per-subgoal PRs if desired.
**Cons:** High implementation cost. Poor IDE fit. Branch switching complexity. Deep nesting produces unwieldy names.

#### Option 3: Top-level goals only (subgoals skip independent branching)

**Mechanism:** Only top-level goals (created via `/pio-create-goal` at the repo root) get independent branches. Subgoals (created via `evolve-plan` with `complexity: "subgoal"`) explicitly skip branching — they commit inline on the parent branch. This is a hybrid: top-level goals get full branch lifecycle (checkout on create, PR on finalize), subgoals use Option 1 behavior.

| Dimension | Assessment |
|-----------|-----------|
| **Git history quality** | Good for top-level goals (isolated branch per goal). Subgoal work is interleaved on the parent branch — same trade-off as Option 1 for the subgoal portion. Traceability via commit message scoping: `feat(subgoal-name): description`. |
| **Implementation complexity** | **Low.** Requires only one new distinction: detect whether a goal is top-level or nested. Code evidence: `resolveGoalDir()` in `src/fs-utils.ts` — when `parentStepDir` is provided, the goal is nested. The Branch Checkout Protocol can check: if the goal path contains `/subgoals/`, skip branching. No new protocols needed — just a conditional in the existing protocol. |
| **IDE workflow fit** | **Optimal.** Same as Option 1 — no branch switching during subgoal execution. The parent goal's branch is the active branch throughout. |

**Pros:** Best trade-off — top-level isolation with subgoal simplicity. Low implementation cost. Optimal IDE fit. Natural distinction (top-level vs. nested is a clear binary).
**Cons:** Subgoal history is still flat (same as Option 1). If subgoal isolation becomes important later, migration to Option 2 would require protocol changes.

#### Option 4: Commit grouping via merge commits (squash-merge subgoals)

**Mechanism:** Subgoals commit inline on the parent branch (like Option 1), but at subgoal completion (`finalize-goal`), create a merge commit that groups all subgoal commits into a single boundary. This is achieved by: (1) creating a temporary branch from the pre-subgoal commit, (2) cherry-picking subgoal commits onto it, (3) merging back with `--no-ff`.

**Note:** This option was discovered during research as a potential middle ground between Options 1 and 2.

| Dimension | Assessment |
|-----------|-----------|
| **Git history quality** | Creates explicit merge boundaries without branch switching during execution. `git log --oneline --graph` shows a clean merge commit for each subgoal. However, the temporary branch and cherry-pick process is complex and error-prone. |
| **Implementation complexity** | **Very high.** Requires: (1) Recording the pre-subgoal commit hash at subgoal start. (2) At subgoal end, creating a temp branch, cherry-picking, merging, and cleaning up. (3) Handling edge cases: what if the parent branch received new commits during subgoal execution? (4) All of this via shell commands in a skill protocol — no programmatic git library. |
| **IDE workflow fit** | **Moderate.** No branch switching during execution (good), but the merge-commit creation at the end requires temporary branch manipulation that could confuse VS Code's git view. |

**Pros:** Clean history boundaries without execution-time branch switching.
**Cons:** Extremely complex implementation. High risk of git state corruption. Not worth the complexity for the marginal history improvement.

#### Recommendation: Option 3 (top-level goals only)

**Top-level goals get branches; subgoals commit inline.**

Rationale:
- **Implementation simplicity:** Requires only a path-based check (`/subgoals/` in the goal path) in the Branch Checkout Protocol. No new protocols, no checkout switching.
- **IDE workflow fit:** No branch switching during subgoal execution. VS Code stays on the parent goal's branch throughout.
- **History quality:** Top-level goals get clean isolated branches. Subgoal work is traceable via commit message scoping (`feat(subgoal-name): ...`). This is sufficient for most workflows — if per-subgoal isolation becomes critical, Option 2 can be adopted later.
- **Deep nesting:** Avoids the branch name explosion problem of Option 2 (`feat/goal/subgoal/nested/sub-subgoal`). With Option 3, nesting depth has no impact on branch naming.
- **Natural alignment:** The distinction between top-level goals (user-initiated, explicit) and subgoals (auto-spawned by `evolve-plan`) maps cleanly to the branching distinction. Users expect top-level goals to have branches; subgoals are an implementation detail.

**Trade-off summary:**

| Criterion | Option 1 (all inline) | Option 2 (per-subgoal) | Option 3 (top-level only) | Option 4 (merge commits) |
|-----------|----------------------|----------------------|--------------------------|-------------------------|
| History quality | Flat | Best | Good (top-level isolated) | Good (merge boundaries) |
| Implementation cost | Zero | High | Low | Very high |
| IDE workflow fit | Optimal | Poor | Optimal | Moderate |
| Deep nesting support | ✅ | ⚠️ long names | ✅ | ✅ |
| Subgoal PR support | ❌ | ✅ | ❌ | ❌ |

### 2.3 Git worktree assessment

Git worktrees (`git worktree add <path> <branch>`) enable multiple working trees attached to the same repository. Each worktree has its own working directory and index but shares the same object store, refs, and logs.

#### Value proposition

**Parallel goal development:** The primary value of worktrees is enabling simultaneous work on multiple branches. In the pio context, this means:
- Goal A on `<branch-pattern>/goal-a` (per GIT.md convention) in worktree A
- Goal B on `<branch-pattern>/goal-b` (per GIT.md convention) in worktree B
- Both worktrees operate on the same repo without branch switching

**Theoretical benefit:** A user could run two pio sub-sessions in parallel — one per worktree — to develop two features simultaneously.

#### Constraints

**Single-IDE review (primary constraint):** VS Code opens one workspace at a time. To work with multiple worktrees:
- Option A: Open each worktree in a separate VS Code instance. This works but requires managing multiple windows. The user reviews changes in the context of one worktree at a time.
- Option B: Use VS Code's multi-root workspace to open both worktrees. This is possible but complex — source control view shows both worktrees interleaved, which is confusing for review.
- Option C: Switch the workspace between worktrees. This defeats the purpose of worktrees (parallel work) and is equivalent to branch switching.

**pio workflow coordination:** Each worktree would have its own `.pio/` directory. The session queue (`.pio/session-queue/`) is per-worktree — there is no cross-worktree coordination mechanism. If a subgoal in worktree A depends on work from worktree B, pio has no way to express or enforce that dependency.

**Graceful failure complexity:** Worktree operations add significant failure surface:
- `git worktree add` fails if the path already exists, if the branch is checked out elsewhere, or if the repo doesn't support worktrees (bare repos).
- `git worktree remove` fails if the worktree is locked (active git operation).
- `git worktree prune` is needed to clean up stale worktree refs.
- Cross-worktree operations (e.g., pushing from one worktree affects all worktrees) can cause unexpected state changes.

**Agent context:** The pio agent runs inside a single VS Code session with a single working directory. The agent's `bash` tool executes commands in the current working directory. To operate across worktrees, the agent would need to `cd` between worktree paths — this is fragile and error-prone.

#### Evaluation

| Criterion | Assessment |
|-----------|-----------|
| **Value for pio workflow** | Low. pio sub-sessions are sequential by design (one task per goal slot). Parallel goal development is not a stated requirement in GOAL.md. The session queue enforces FIFO execution — parallelism is not a workflow goal. |
| **Implementation complexity** | High. Requires worktree management protocol (add, remove, prune), cross-worktree state tracking, and agent path management. Significantly expands the pio-git skill scope. |
| **IDE workflow fit** | Poor. VS Code's single-workspace model conflicts with multi-worktree operation. User review becomes fragmented across multiple windows or a confusing multi-root workspace. |
| **Graceful failure risk** | High. Worktree operations have more failure modes than standard git operations. Each failure mode requires handling in the skill protocol. |
| **Alternative solutions** | Branch switching (already supported) achieves the same goal (working on multiple branches) without worktree complexity. For truly parallel development, separate VS Code instances on the same repo (without worktrees) is simpler — each instance checks out its own branch. |

#### Recommendation: Exclude from scope

**Git worktrees are explicitly excluded from the git lifecycle specification.**

Rationale:
1. **No workflow requirement:** GOAL.md does not require parallel goal development. The pio session queue enforces sequential execution. Worktrees solve a problem that pio does not have.
2. **Single-IDE constraint:** VS Code's workspace model makes multi-worktree operation impractical for the review workflow. The user reviews changes in a single IDE — worktrees fragment this experience.
3. **High complexity, low value:** The implementation cost (new protocol, error handling, state tracking) far exceeds the benefit (parallel development that pio doesn't require).
4. **Simpler alternatives exist:** Branch switching achieves the same outcome (working on multiple branches over time) without worktree overhead. For users who want true parallelism, running separate VS Code instances is a simpler solution.
5. **Future revisitable:** If parallel goal development becomes a requirement, worktrees can be revisited with a clearer use case and dedicated research. The pio-git skill structure (Convention Lookup Rule, graceful failure) provides a foundation for future worktree support.

**Explicit exclusion statement for future reference:**

> Git worktrees were evaluated and excluded from the git lifecycle specification (Step 2, Section 2.3). The primary constraints were: (1) no pio workflow requirement for parallel goal development, (2) VS Code's single-workspace model conflicts with multi-worktree operation, and (3) high implementation complexity with low value relative to branch switching. This decision can be revisited if parallel goal development becomes a stated requirement.