# Task: Update execute-plan prompt with auto-commit instruction

Insert a git commit step into `src/prompts/execute-plan.md` so that the execute-plan agent commits all changes once after completing every plan step.

## Context

The `execute-plan` workflow implements all steps from PLAN.md in a single session. Currently, no git checkpoint is created — all changes remain uncommitted until the user manually commits after the session ends. Step 1 created the `pio-git` skill, and Step 2 updated the `execute-task` prompt with a similar commit instruction. This step applies the same pattern to `execute-plan`.

Unlike `execute-task`, there is no per-step `SUMMARY.md` in the `execute-plan` workflow. The `pio-git` skill handles this via its fallback protocol: when SUMMARY.md is absent, it uses `git status --porcelain` to determine which files to stage.

## What to Build

Modify `src/prompts/execute-plan.md` to insert a new commit step between Step 5 ("Final verification") and Step 6 ("Signal completion"). After insertion, renumber steps so they remain sequential (the new commit step becomes Step 6, "Signal completion" becomes Step 7).

The commit instruction must:
1. Instruct the agent to load the `pio-git` skill
2. Commit the changes — since no SUMMARY.md exists, the skill will use `git status --porcelain` to determine which files to stage
3. Include graceful failure semantics: if git fails, log a warning and proceed to signal completion

### Code Components

This is a prompt-only change — no TypeScript code modifications. The new step follows the same delegation pattern established in Step 2's `execute-task.md` update: reference the skill, let the skill fill in the protocol details.

### Approach and Decisions

- **Delegation over duplication:** Reference `pio-git` in the prompt; don't repeat skill internals. Follow the pattern from Step 2's `execute-task.md` commit instruction (see lines 154, 180).
- **Step numbering:** Insert as a new step between current Steps 5 and 6. Renumber all subsequent steps to maintain sequential order. Update any internal cross-references (e.g., if "Step 6" is mentioned elsewhere in the document, update to "Step 7").
- **No SUMMARY.md fallback needed:** The skill's unified protocol automatically falls back to `git status --porcelain` when no SUMMARY.md exists. No baseline recording or explicit comparison logic is needed in the prompt — the skill handles this.
- **Single commit at the end:** Unlike `execute-task` (one commit per step), `execute-plan` produces one commit covering all steps. The commit message should summarize the overall session work, not individual steps.

## Dependencies

- **Step 1** — the `pio-git` skill must exist and be registered at `src/skills/pio-git/SKILL.md`.
- **Step 2** — no direct dependency, but provides the pattern to follow for the commit instruction phrasing.

## Files Affected

- `src/prompts/execute-plan.md` — insert new commit step between "Final verification" and "Signal completion", renumber steps sequentially

## Acceptance Criteria

- A new commit step exists between "Final verification" and "Signal completion"
- The instruction references loading the `pio-git` skill
- The instruction instructs the agent to write a short one-liner commit message and commit
- The instruction includes graceful failure semantics (warn and proceed on git errors)
- Step numbering is updated to remain sequential after inserting the new step

## Risks and Edge Cases

- **Cross-references in the prompt:** If the document references step numbers elsewhere (e.g., "call `pio_mark_complete` as described in Step 6"), those references must be updated after renumbering.
- **Consistency with execute-task.md:** The commit instruction phrasing should be stylistically consistent with Step 2's instruction (`"load the pio-git skill and commit the changes"`), but adapted for the all-steps context (summarizing all changes, not per-step).
- **No tests to update:** This is a prompt-only change. Verify via grep/visual inspection that the new step exists at the correct position, references `pio-git`, includes graceful failure text, and step numbers are sequential.
