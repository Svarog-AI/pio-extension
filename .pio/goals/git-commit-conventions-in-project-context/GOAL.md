# Git Commit Conventions in Project Context

When `pio_create_project_context` generates `.pio/PROJECT.md`, it should also inspect the target project's git history to discover and document commit conventions. Downstream agents (implementing features, fixing bugs) need to know how to format commit messages for the target repository — whether it uses Conventional Commits, squash-merge titles, signed commits, specific prefixes, or other patterns — so they can produce commits that fit the project's established style.

## Current State

The project-context prompt (`src/prompts/project-context.md`) instructs the analyzer to explore source code, configuration files, documentation, CI/CD, and test conventions — but it contains no instructions to inspect git history. Specifically:

- **No git log analysis:** The prompt never asks the agent to run `git log` or examine commit messages for patterns like Conventional Commits (`feat:`, `fix:`, `chore:`), custom prefixes, scope notation (`feat(scope):`), or message formatting rules.
- **No tag inspection:** Tags (semver `v1.2.3`, calendar versioning, release naming) are not examined, even though they encode release conventions downstream agents should follow.
- **No branch pattern analysis:** Branch naming conventions (e.g., `feature/`, `bugfix/`, `release/`, or trunk-based development) are not documented.
- **No signing detection:** GPG-signed commits (`gpg: good signature`) and commit message sign-offs (`Signed-off-by:`) are not checked for.

As a result, `.pio/PROJECT.md` lacks any section on commit conventions. Downstream agents that create commits (e.g., during `execute-task`) will produce arbitrary commit messages that may not match the project's style — making git history harder to read and potentially breaking tools that rely on Conventional Commits for changelog generation or semantic versioning.

Evidence from this repo itself: `git log --oneline` shows consistent use of type prefixes (`feat:`, `fix:`, `chore:`), indicating a Conventional Commits pattern that would be valuable to surface in PROJECT.md if analyzing another project exhibiting the same discipline.

## To-Be State

The project-context prompt (`src/prompts/project-context.md`) is updated to include git history analysis as part of Phase 1 (Analysis). The analyzer should:

1. **Inspect commit messages:** Run `git log --oneline -50` (or similar) to examine recent commit messages for patterns:
   - Conventional Commits compliance (`type(scope): description`)
   - Custom prefixes or type vocabulary
   - Message length and formatting conventions (imperative mood, line length limits)
   - Squash-merge vs. individual commit titles

2. **Inspect tags:** Run `git tag -l` to identify versioning schemes:
   - Semantic versioning (`v1.2.3`)
   - Calendar versioning (`2026.05`)
   - Release candidates, pre-release patterns
   - Any naming conventions in tag descriptions

3. **Inspect branch patterns:** Run `git branch -a` to identify branching strategy:
   - Feature prefix conventions (`feature/`, `feat/`, `fix/`)
   - Trunk-based development (single main/master)
   - Release branches, hotfix branches
   - Ticket/issue number embedding in branch names

4. **Check signing practices:** Look for evidence of GPG-signed commits and DCO-style sign-off lines in commit messages.

The summarized findings should appear in a new subsection within the "Development Workflow" section of PROJECT.md, clearly labeling what conventions were detected (and noting confidence — e.g., "appears to follow Conventional Commits based on recent history" vs. "strictly enforced by CI").

Additionally, Phase 2 (Summarization) should include a question about commit conventions, and Phase 4 (Write PROJECT.md) should include the commit conventions subsection in the template output.

Files affected:
- `src/prompts/project-context.md` — add git history analysis instructions in Phase 1, add summarization question in Phase 2, add commit conventions subsection in Phase 4 template
