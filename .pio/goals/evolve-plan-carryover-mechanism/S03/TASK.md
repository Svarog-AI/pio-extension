# Task: Update execute-task prompt to mention DECISIONS.md

Add a note to the Execute Task Agent prompt (`execute-task.md`) so it knows that `DECISIONS.md` may exist in the step folder (Step 2+) as optional enrichment context.

## Context

Steps 1 and 2 of this plan have already wired up the carryover mechanism on the evolve-plan side: Step 1 updated capability config (validation + write allowlist), and Step 2 updated the evolve-plan prompt so the Specification Writer reads, merges, and writes `DECISIONS.md`. The final piece is to make the Execute Task Agent aware of this file. Currently, `execute-task.md` tells the agent to read `TASK.md` and `TEST.md` from its step folder — it has no mention of `DECISIONS.md`. For Step 2+ workspaces, the agent should know this supplementary file may exist and contain architectural decisions from earlier steps.

## What to Build

Modify `src/prompts/execute-task.md` with a single targeted change: add instructions about `DECISIONS.md` to Step 2 (Read TASK.md and TEST.md).

### Code Components

#### 1. Extend Step 2 (Read TASK.md and TEST.md)

The current Step 2 instructs the Execute Task Agent to read `TASK.md` and `TEST.md` from `S{NN}/`. Add a note that `DECISIONS.md` may also exist alongside these files for Step 2+. The note should communicate:

- **What it is:** `DECISIONS.md` contains accumulated architectural decisions from prior steps.
- **Availability:** Exists only for Step 2+ (Step 1 has no prior decisions to carry forward). This matches the convention established in Steps 1–2 — evolve-plan produces `DECISIONS.md` only when `stepNumber > 1`.
- **Optional enrichment:** Treat it as supplementary context. Read it if present but never treat it as a prerequisite. The primary source of truth for what to implement remains `TASK.md`.
- **Purpose:** Provides background on decisions made during implementation of earlier steps that may affect the current step's implementation (e.g., file placement changes, architectural choices).

### Approach and Decisions

- Follow the pattern established in the evolve-plan prompt: mention `DECISIONS.md` as optional enrichment, clarify TASK.md remains primary. This mirrors how the evolve-plan prompt itself handles missing DECISIONS.md gracefully.
- Keep the addition concise — a single paragraph or bullet within Step 2 is sufficient. Do not create a new dedicated step in the execute-task prompt for this; it's a supplementary note.
- Reference relevant prior decisions from `DECISIONS.md` that affect this step: the non-numbered sub-step convention (from S02) means we should avoid adding numbered steps to prompts unless absolutely necessary. In this case, we're modifying an existing step, not adding a new one, so this doesn't apply directly — but the principle of minimal prompt changes holds.

## Dependencies

- **Step 1** (evolve-plan capability config) — completed and approved. Establishes that `DECISIONS.md` exists in Step 2+ folders.
- **Step 2** (evolve-plan prompt update) — completed and approved. Instructs the Specification Writer to produce `DECISIONS.md`.

## Files Affected

- `src/prompts/execute-task.md` — modified: add DECISIONS.md mention to Step 2 (Read TASK.md and TEST.md)

## Acceptance Criteria

- [ ] The prompt mentions `DECISIONS.md` exists for Step 2+ as optional enrichment context
- [ ] The prompt clarifies that `TASK.md` remains the primary source of truth (`DECISIONS.md` is supplementary)
- [ ] All existing prompt instructions are preserved unchanged
- [ ] `npm run check` reports no TypeScript errors

## Risks and Edge Cases

- **Prompt step count:** The execute-task prompt uses numbered steps (### Step 1 through ### Step 8). Adding a new numbered step could affect any downstream validation that counts steps. Keep the change as an inline addition to Step 2, not a new numbered step.
- **Backwards compatibility:** Existing goal workspaces without `DECISIONS.md` must continue working. The "optional enrichment" framing handles this naturally.
- **No functional behavior change:** This is purely informational — the Execute Task Agent's existing behavior (read TASK.md/TEST.md, implement test-first) remains unchanged.
