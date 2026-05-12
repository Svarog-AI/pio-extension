# Plan: Git Commit Conventions in Project Context

Update the project-context prompt to analyze git history (commits, tags, branches, signing) and document discovered conventions in PROJECT.md.

## Prerequisites

- The target project must have an initialized git repository (`git rev-parse --git-dir` succeeds). The prompt should instruct the analyzer to gracefully handle non-git projects (skip git analysis if no repo exists).

## Steps

### Step 1: Add git history analysis instructions to `src/prompts/project-context.md`

**Description:** Update the project-context prompt in three places to add git history analysis as part of the standard workflow:

1. **Phase 1 (Analysis):** Add a new subsection instructing the analyzer to run git commands and inspect the results. The analyzer should run:
   - `git log --oneline -50` — examine recent commit messages for Conventional Commits patterns (`type(scope): description`), custom prefixes, message formatting conventions, squash-merge vs individual commits, sign-off lines (`Signed-off-by:`), and evidence of GPG signing.
   - `git tag -l` — identify versioning schemes: semantic versioning (`v1.2.3`), calendar versioning, release candidates, pre-release patterns.
   - `git branch -a` — identify branching strategy: feature/fix prefixes, trunk-based development, release/hotfix branches, ticket number embedding in branch names.
   - The analyzer should also check for commit signing evidence (GPG signatures, DCO sign-offs).
   - If the project is not a git repository, skip gracefully and note "no git repository found".

2. **Phase 2 (Summarization):** Add a new question (numbered sequentially after the existing questions) asking about discovered commit conventions: message format patterns, versioning scheme from tags, branching strategy, and signing practices. This ensures findings are captured in notes before writing PROJECT.md.

3. **Phase 4 (Write PROJECT.md):** Add a new subsection under "Development Workflow" in the template output. This subsection should document:
   - Commit message conventions (Conventional Commits, custom prefixes, formatting rules)
   - Tag/versioning scheme (semver, calver, or none detected)
   - Branch naming patterns and branching strategy
   - Signing practices (GPG, DCO sign-off)
   - Confidence level for each finding ("appears to follow" vs "strictly enforced")

Follow the existing prompt's formatting conventions: consistent heading levels, markdown list syntax, and imperative instructions matching the tone of surrounding content.

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) reports no type errors
- [ ] `src/prompts/project-context.md` contains git analysis instructions in Phase 1 (references `git log`, `git tag -l`, `git branch -a`, and commit signing checks)
- [ ] `src/prompts/project-context.md` contains a new summarization question about commit conventions in Phase 2
- [ ] `src/prompts/project-context.md` contains a commit conventions subsection within the "Development Workflow" section of the Phase 4 template
- [ ] The prompt instructs graceful handling when no git repository is present
- [ ] The prompt instructs the analyzer to note confidence levels for detected conventions

**Files affected:**
- `src/prompts/project-context.md` — add git analysis instructions in Phase 1, new question in Phase 2, new template subsection in Phase 4

## Notes

- This is a prompt-only change. No TypeScript code, tool definitions, or capability logic is modified.
- The analyzer agent runs `bash` commands already (the prompt instructs exploration), so adding `git log`, `git tag -l`, and `git branch -a` follows the existing pattern of shell-based analysis.
- When the project-context prompt is used on a target project that isn't a git repo, the analyzer should handle this gracefully — the instructions should explicitly say to skip and note absence.
- The confidence-level guidance is important: detected patterns from recent history are not the same as enforced conventions (e.g., CI linting commit messages). The output should distinguish "observed" from "enforced".
- After this change, any project analyzed with `pio_create_project_context` will produce a PROJECT.md that includes git commit conventions — which downstream agents (implementing features, fixing bugs) can use to format their own commits correctly.
