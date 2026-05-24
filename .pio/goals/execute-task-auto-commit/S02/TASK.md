# Task: Update execute-task prompt with auto-commit instruction

Insert a git commit sub-step into `src/prompts/execute-task.md` Step 9, so the execute-task agent commits changes after each plan step before signaling completion.

## Context

The execute-task agent currently writes `COMPLETED`/`BLOCKED` markers and `SUMMARY.md`, then calls `pio_mark_complete`. No git commit occurs — all changes remain uncommitted until the user manually runs git commands. Step 1 created the `pio-git` skill (auto-discovered, registered). This step adds the prompt instruction to invoke it.

The `pio-git` skill uses SUMMARY.md-based staging by default: since SUMMARY.md lists all files created/modified/deleted, the skill can extract exact paths and stage only those. Therefore the commit instruction must come **after** SUMMARY.md is written.

## What to Build

Modify Step 9 ("Write completion artifacts") in `src/prompts/execute-task.md` to insert a git commit sub-step between writing `SUMMARY.md` (step 2) and calling `pio_mark_complete` (step 3). This change applies to both the success path and the failure path.

### Code Components

No TypeScript code changes. This is a prompt-only modification:

- **Success path (COMPLETED):** Insert as step 2b or 3a — after SUMMARY.md is written, before `pio_mark_complete`. The agent loads `pio-git`, commits using the skill's protocol (which will auto-detect SUMMARY.md and extract file paths), then proceeds to `pio_mark_complete`.
- **Failure path (BLOCKED):** Insert similarly — after SUMMARY.md is written, before `pio_mark_complete`. Even on failure, whatever files were created/modified should be committed as a checkpoint.

### Approach and Decisions

- **Placement:** The commit sub-step goes between writing SUMMARY.md and calling `pio_mark_complete` in both paths. This order is critical: SUMMARY.md must exist first so the `pio-git` skill can extract file paths from it.
- **Skill loading instruction:** Tell the agent to load the `pio-git` skill. The skill documentation (Step 1) already specifies all the operational details — staging, commit messages, graceful failure. The prompt need only instruct to load and execute; no inline bash commands in the prompt.
- **Commit message instruction:** Instruct the agent to write a short descriptive one-liner summarizing what was done. The `pio-git` skill will read `.pio/PROJECT/GIT.md` for conventions if it exists.
- **Graceful failure is built into the skill:** The `pio-git` skill already documents "log a warning and proceed — never block workflow completion." The prompt should mention this but need not duplicate the full error handling protocol.
- **Reference prior decisions from S02/DECISIONS.md:** The pio-git skill exists and is auto-discovered. Follow its unified staging protocol (SUMMARY.md extraction when available).

## Dependencies

- **Step 1 (Register skills and create pio-git skill):** Must be completed first. The `pio-git` skill must exist at `src/skills/pio-git/SKILL.md` for the prompt instruction to reference it.

## Files Affected

- `src/prompts/execute-task.md` — modified: insert git commit sub-step into Step 9 (both success and failure paths, between SUMMARY.md writing and `pio_mark_complete`)

## Acceptance Criteria

- `src/prompts/execute-task.md` Step 9 contains a git commit sub-step between writing SUMMARY.md and calling `pio_mark_complete`
- The instruction references loading the `pio-git` skill
- The instruction instructs the agent to write a short one-liner commit message summarizing the change and then commit using the skill's protocol
- The instruction includes graceful failure semantics (warn and proceed on git errors, never block completion)
- The commit step is present in both the success path (COMPLETED) and failure path (BLOCKED)

## Risks and Edge Cases

- **Ordering matters:** If the commit runs before SUMMARY.md is written, the `pio-git` skill won't find it and will fall back to `git status --porcelain`, which could stage unrelated files. Ensure commit comes after SUMMARY.md.
- **BLOCKED path should still commit:** Even when a step is blocked, partial work (files created/modified before the blocker) should be committed as a checkpoint. The instruction must appear in both paths.
- **Don't over-specify in the prompt:** The `pio-git` skill already contains detailed protocols (staging strategy, message construction, error handling). The prompt should instruct to load and use the skill — not re-implement bash commands inline.
