---
totalSteps: 3
steps:
  - name: register-skills-and-create-pio-git
    complexity: task
  - name: update-execute-task-prompt
    complexity: task
  - name: update-execute-plan-prompt
    complexity: task
---

# Plan: Auto-commit on task completion

Add automatic `git commit` to pio workflow agents via a new reusable `pio-git` skill and prompt changes to both `execute-task` and `execute-plan` workflows. Skill registration in `src/index.ts` is required for the agent to discover the new skill at runtime.

## Prerequisites

None.

## Steps

### Step 1: Register skills and create pio-git skill

**Description**

Two sub-tasks, in order:

1. **Register all skills:** Skills are registered via a hardcoded array in `src/index.ts` — not auto-discovered from the filesystem. Extract the skill registration into a `setupSkills()` function, register `write-a-skill` (file exists but was not registered), and add `pio-git` to the registry.
2. **Create `src/skills/pio-git/SKILL.md`:** Create a reusable skill that defines how pio agents perform git operations. Follow the `write-a-skill` conventions for SKILL.md authoring (now that it's registered and discoverable). The skill documents:
   - **Convention lookup:** Before performing any commit or branch operation, read `.pio/PROJECT/GIT.md` to learn the project's conventions (commit message format, types, scope, branch naming). The skill does not define its own conventions — it always defers to GIT.md.
   - **Staged commit protocol:** Stage only the files the agent actually changed — never `git add -A`. The skill uses a single unified staging approach:
     - **If `SUMMARY.md` exists in the working directory**, extract file paths from the "Files Created", "Files Modified", and "Files Deleted" sections, and stage those exact paths with `git add <paths>`. Note: `git add` on a deleted path correctly stages the deletion.
     - **Otherwise**, use `git status --porcelain` to determine all changed/untracked files, and stage them with `git add <paths>`.
   - **Commit message construction:** GIT.md is the absolute authority for commit message format. Read `.pio/PROJECT/GIT.md` and follow its conventions exactly. Only if the file does not exist should the agent fall back to a short descriptive one-liner (e.g., "implement path resolution utilities"). No "Step N" or similar substrings in commit messages.
   - **Graceful failure semantics:** Log a warning and proceed if git fails — never block workflow completion.
   - **Future extensibility:** The skill is structured to accommodate future operations (branch checkout on create-goal, PR creation on finalize-goal) without restructuring.

The skill does not reference specific capabilities — it provides one generic commit protocol that any prompt can invoke. It follows the established pattern: YAML frontmatter with `name` and `description`, organized sections mirroring existing skills like `pio-project-knowledge/SKILL.md`.

**Acceptance Criteria**

- `src/index.ts` contains a `setupSkills()` function that builds the skill paths array and registers it via `pi.on("resources_discover", ...)`
- All six skills are registered: `pio`, `test-driven-development`, `pio-project-knowledge`, `pio-planning`, `write-a-skill`, `pio-git`
- Existing tests in `src/index.test.ts` pass with no regressions after the refactoring
- `npx tsc --noEmit` reports no TypeScript errors
- `src/skills/pio-git/SKILL.md` exists with valid YAML frontmatter (`name: pio-git`)
- Skill documents the convention lookup rule (read GIT.md before operations, defer to its conventions)
- Skill documents the unified staged commit protocol: SUMMARY.md if present, otherwise `git status --porcelain`
- Skill specifies commit messages as short descriptive one-liners without "Step N" substrings
- Skill documents graceful failure semantics (warn and proceed, never block)
- Skill structure accommodates future git operations (branch checkout, PR creation) as out-of-scope extensions

**Files Affected**

- `src/index.ts` — extract `setupSkills()`, add `write-a-skill` and `pio-git` to skill registry
- `src/skills/pio-git/SKILL.md` — new file: shared git operations skill for pio agents
- `src/index.test.ts` — update skill registration tests to verify all six skills are present

### Step 2: Update execute-task prompt with auto-commit instruction

**Description**

Modify `src/prompts/execute-task.md` to insert a git commit step in Step 9 ("Write completion artifacts"). After writing `SUMMARY.md` and before calling `pio_mark_complete`, the agent must:

1. Load the `pio-git` skill
2. Write a short descriptive one-liner commit message summarizing what was done
3. Commit — since `SUMMARY.md` was just written, the skill will extract file paths from it
4. If git fails, log a warning and proceed to `pio_mark_complete`

The instruction must be placed between the SUMMARY.md writing instruction and the `pio_mark_complete` call in both the success (COMPLETED) and failure (BLOCKED) paths. On the BLOCKED path, the commit should still happen for whatever files were created/modified before the blocker.

**Acceptance Criteria**

- `src/prompts/execute-task.md` Step 9 contains a git commit sub-step between writing SUMMARY.md and calling `pio_mark_complete`
- The instruction references loading the `pio-git` skill
- The instruction instructs the agent to write a short one-liner commit message and commit
- The instruction includes graceful failure semantics (warn and proceed on git errors)
- The commit step is present in both the success path (COMPLETED) and failure path (BLOCKED)

**Files Affected**

- `src/prompts/execute-task.md` — add git commit instruction to Step 9 (between SUMMARY.md and pio_mark_complete)

### Step 3: Update execute-plan prompt with auto-commit instruction

**Description**

Modify `src/prompts/execute-plan.md` to insert a git commit step after Step 5 ("Final verification") and before Step 6 ("Signal completion"). The agent must:

1. Load the `pio-git` skill
2. Write a short descriptive one-liner commit message summarizing all changes made during the session
3. Commit — since no SUMMARY.md exists, the skill will use `git status --porcelain` to determine which files to stage
4. If git fails, log a warning and proceed to `pio_mark_complete`

This requires renumbering subsequent steps after insertion.

**Acceptance Criteria**

- A new commit step exists between "Final verification" and "Signal completion"
- The instruction references loading the `pio-git` skill
- The instruction instructs the agent to write a short one-liner commit message and commit
- The instruction includes graceful failure semantics (warn and proceed on git errors)
- Step numbering is updated to remain sequential after inserting the new step

**Files Affected**

- `src/prompts/execute-plan.md` — add auto-commit step before signal completion

## Notes

- **Step 1 now includes capability code changes:** Unlike the original plan's "no capability code changes" approach, Step 1 requires modifying `src/index.ts` to extract skill registration into `setupSkills()` and register all skills. Both `src/capabilities/execute-task.ts` and `src/capabilities/execute-plan.ts` remain unchanged.
- **Step 1 is independent** of Steps 2 and 3. Steps 2 and 3 have no dependency on each other. Both depend on Step 1 (the skill must exist for prompts to reference it).
- **Graceful failure is critical:** Git may not be configured, the repo may not exist, or the agent may lack permissions. The skill and prompts must ensure git never blocks workflow completion.
- **`.pio/PROJECT/GIT.md` is read-only:** It is maintained by pio itself. The skill reads it for conventions but never modifies it.
- **Capability-agnostic skill:** The `pio-git` skill does not reference specific capabilities. It provides one unified staging protocol: if SUMMARY.md exists, extract file paths from there; otherwise fall back to `git status --porcelain`.
- **Future extensibility:** Step 1's skill design should use a modular section structure so future goals can add "Branch Checkout Protocol" or "PR Creation Protocol" sections without restructuring the document.
