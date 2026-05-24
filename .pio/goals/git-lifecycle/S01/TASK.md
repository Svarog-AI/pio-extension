# Task: Research git lifecycle integration points

Audit the current codebase to identify extension points for git operations and evaluate `gh pr create` capabilities, then draft the integration-points section of the specification.

## Context

The pio workflow currently has no branch checkout on goal creation or PR creation on goal finalization. The `pio-git` skill handles only per-step auto-commits via the Staged Commit Protocol. GOAL.md requires research into how git operations can be injected — ideally via prompts and skills without capability code changes — to support full lifecycle branching and PR workflows.

## What to Build

Produce the **integration-points section** of `.pio/goals/git-lifecycle/SPECIFICATION.md` containing:

1. A clear mapping of which capability, prompt, or skill handles each git operation (branch checkout, PR creation)
2. Evaluated `gh pr create` options including auth requirements and error modes
3. A catalogued list of edge cases with recommended handling strategies

### Code Components

This is a **research and specification task** — no source code changes. The executor produces analysis documented in `SPECIFICATION.md`. Research involves reading existing files and external documentation only.

#### Integration-point mapping

For each of the two main git operations, document:

- **Branch checkout on `create-goal`:** Analyze whether this can be injected via:
  - Prompt instructions in `src/prompts/create-goal.md` (instruction to run `git checkout -b feat/<goal-name>` before writing GOAL.md)
  - A new protocol section in `src/skills/pio-git/SKILL.md`
  - Capability code changes in `src/capabilities/create-goal.ts` (e.g., running git commands in `prepareGoal()` or via `prepareSession`)
  - The `session-capability.ts` `prepareSession` hook (runs during `resources_discover`, before agent starts)
  - Recommendation: which approach to use and why

- **PR creation on `finalize-goal`:** Analyze whether this can be injected via:
  - Prompt instructions in `src/prompts/finalize-goal.md` (instruction to run `gh pr create` after updating PROJECT files)
  - A new protocol section in `src/skills/pio-git/SKILL.md`
  - Capability code changes in `src/capabilities/finalize-goal.ts` (e.g., running `gh pr create` in the `postExecute` hook or tool execute handler)
  - The `session-capability.ts` `postExecute` hook (runs after transitions, errors are non-fatal — good fit for graceful failure)
  - Recommendation: which approach to use and why

Key files to analyze for injection points:
- `src/capabilities/create-goal.ts` — `prepareGoal()` creates the directory. No git operations. CAPABILITY_CONFIG controls validation/writeAllowlist.
- `src/capabilities/finalize-goal.ts` — `validateFinalizeGoal()` checks COMPLETED marker. CAPABILITY_CONFIG writeAllowlist targets `.pio/PROJECT/*.md`.
- `src/capabilities/session-capability.ts` — Event hooks: `resources_discover` (loads config, runs `prepareSession`), `before_agent_start` (injects prompts, switches models). The `pio_mark_complete` tool runs validation → postValidate → transitions → `postExecute` → cleanup. Both `prepareSession` and `postExecute` are capability-provided hooks in `CAPABILITY_CONFIG`.
- **Critical finding:** The `prepareSession` hook in `session-capability.ts` runs during session startup (line ~175: `await config.prepareSession(config.workingDir!, enrichedSessionParams)`) with error handling — it does not crash the session on failure. This is a viable hook for branch checkout if capability code changes are acceptable.
- **Critical finding:** The `postExecute` hook runs after transitions in `pio_mark_complete` (line ~145) with non-fatal error handling — ideal for PR creation with graceful failure semantics.

#### `gh pr create` evaluation

Research and document:
- Auth model: Does `gh` use GitHub CLI auth (`gh auth status`), personal access tokens, or SSH? What are the requirements for pi's agent sessions (running in VS Code context)?
- Key flags: `--title`, `--body`, `--base`, `--head`, `--label`, `--reviewer`, `--draft`
- Error modes to handle: branch doesn't exist, no differences from base, user not authenticated, network failures, missing repo
- Platform support: GitHub only (not GitLab, Bitbucket) — acceptable given GOAL.md constraint
- Alternative: GitHub API via REST/GraphQL (more complex, requires token management)

#### Edge case catalog

Document handling for each scenario:
1. **No git repository:** `git rev-parse --show-toplevel` fails. Recommendation: skip all git operations silently (graceful failure).
2. **Detached HEAD state:** `git symbolic-ref --short HEAD` fails. Recommendation: warn but proceed without branching (use current state).
3. **Branch already exists:** `feat/<goal-name>` is not new. Options to evaluate: reuse existing branch (checkout), error/abort, auto-suffix (`-2`), or prompt user.
4. **Goal started from a non-main branch:** Detect current branch and use as base for both branching and PR target.
5. **No changes to commit on PR:** Branch has no diffs vs. base. `gh pr create` would create an empty PR. Recommendation: skip PR creation, warn agent.
6. **Interrupted workflow:** Goal partially completed, branch exists but goal is re-finalized. Recommendation: push any new commits, update existing PR if detected.
7. **Git not configured:** Missing `user.name`/`user.email`. Recommendation: skip with warning (graceful failure per pio-git conventions).

### Approach and Decisions

- Follow the `pio-git` skill patterns: convention lookup from `.pio/PROJECT/GIT.md`, graceful failure semantics, staged staging
- Write findings as structured markdown sections in `SPECIFICATION.md` — not prose narratives but referenceable analysis
- Use code references (file paths, line-level observations) to ground findings in the actual codebase
- For the injection-point analysis, be explicit about prompt-only vs. code-change requirements for each option

## Dependencies

None. This is Step 1 with no prior step dependencies.

## Files Affected

- `.pio/goals/git-lifecycle/SPECIFICATION.md` — created: integration-points section (extension point mapping, `gh pr create` evaluation, edge case catalog)
- `src/capabilities/create-goal.ts` — read-only: audit extension points in `prepareGoal()`, CAPABILITY_CONFIG, and tool execute handler
- `src/capabilities/finalize-goal.ts` — read-only: audit extension points in `validateFinalizeGoal()`, CAPABILITY_CONFIG, writeAllowlist, and tool execute handler
- `src/capabilities/session-capability.ts` — read-only: audit `prepareSession`, `postExecute`, and `before_agent_start` hooks
- `src/prompts/create-goal.md` — read-only: assess current prompt structure for injecting git instructions
- `src/prompts/finalize-goal.md` — read-only: assess current prompt structure for injecting git instructions
- `src/skills/pio-git/SKILL.md` — read-only: understand existing protocol patterns (convention lookup, staged commit, graceful failure) and "Future Extensibility" section

## Acceptance Criteria

- Integration points documented: clear mapping of which capability/prompt/skill handles branch checkout and PR creation, with recommendation for each
- `gh pr create` options evaluated: auth requirements, key flags (`--title`, `--body`, `--base`, `--head`), error modes documented in spec
- Edge cases catalogued: no git repo, detached HEAD, branch collision, no changes to commit, interrupted workflow, git not configured — each with a handling recommendation
- Research findings written into `.pio/goals/git-lifecycle/SPECIFICATION.md` as a structured section (not just notes or scratchpad)
- All file references in the spec correspond to actual files verified during research

## Risks and Edge Cases

- `SPECIFICATION.md` is a shared output file — Steps 2 and 3 will also write to it. Step 1 should write its section with clear headings so subsequent steps can append without conflict.
- Research into `gh pr create` may require checking external documentation (GitHub CLI docs). If web access is unavailable, rely on known behavior of the `gh` CLI from first principles and note any uncertainty explicitly.
- The executor must resist the temptation to also analyze branching strategies or worktrees — those belong in Steps 2 and 3 respectively.
