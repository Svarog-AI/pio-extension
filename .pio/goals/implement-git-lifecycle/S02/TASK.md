# Task: Inject branch checkout into create-goal prompt

Add a new step to `src/prompts/create-goal.md` instructing the agent to checkout a dedicated branch before writing `GOAL.md`, following the Branch Checkout Protocol from the pio-git skill.

## Context

Currently, `create-goal.md` has a 5-step process that writes `GOAL.md` directly on whatever branch is active. After Step 1 added the "Branch Checkout Protocol" to `src/skills/pio-git/SKILL.md`, this prompt must now instruct the agent to checkout a dedicated branch before writing `GOAL.md`. This isolates goal work from the main branch and enables PR-based review.

The prompt states WHAT (checkout a branch) and delegates HOW to the skill by name only — no shell commands, no branch naming details, no collision handling.

## What to Build

Modify `src/prompts/create-goal.md` to insert a new step between the existing Step 3 ("Fill gaps with targeted questions") and Step 4 ("Write GOAL.md"). The new step instructs the agent to:

1. Checkout a dedicated branch for this goal before writing `GOAL.md`
2. Follow the "Branch Checkout Protocol" from the "pio-git" skill

The step must reference the skill and protocol by name only. It must NOT contain:
- Shell commands (`git checkout`, `git branch`, etc.)
- Branch naming patterns or conventions
- Collision handling logic
- Subgoal detection details
- Any implementation-level detail — all HOW lives in the skill

After inserting the new step, re-number all subsequent steps sequentially and update any total step count references.

### Code Components

This is a content-only change to a single markdown file. No TypeScript code, no tests. The change consists of:

- **New step text** (Step 4): A paragraph or two instructing branch checkout, referencing the pio-git skill's Branch Checkout Protocol by name.
- **Re-numbered steps:** Old Step 4 → Step 5 ("Write GOAL.md"), old Step 5 → Step 6 ("Signal completion").
- **Updated step count:** If the prompt header or process intro mentions "Follow these steps in order" with a count, update it to reflect 6 steps total.

### Approach and Decisions

- Follow the existing prompt style: each step has a bold title and descriptive instructions. Match the tone and structure of existing steps.
- The new step should mention passing the goal name as context (the skill needs it for branch naming). This is consistent with how the Staged Commit Protocol references `SUMMARY.md` — the prompt provides context, the skill uses it.
- **From DECISIONS.md:** Both protocols now exist in SKILL.md per Step 1. Reference the exact section name "Branch Checkout Protocol" as it appears in the skill.
- Keep the step concise — 2-4 sentences max. The skill contains all the detail.

## Dependencies

- **Step 1 must be completed** — the "Branch Checkout Protocol" section must exist in `src/skills/pio-git/SKILL.md` for this prompt to reference it. Step 1 is APPROVED and complete.

## Files Affected

- `src/prompts/create-goal.md` — insert new Step 4 (branch checkout), re-number Steps 5–6

## Acceptance Criteria

- `src/prompts/create-goal.md` contains a new step between the old Step 3 ("Fill gaps with targeted questions") and old Step 4 ("Write GOAL.md")
- The new step instructs the agent to checkout a dedicated branch before writing `GOAL.md`
- The new step references "Branch Checkout Protocol" from the "pio-git" skill by name
- The new step contains no shell commands (no `git checkout`, `git branch`, `git symbolic-ref`, etc.)
- The new step contains no branch naming patterns (no `feat/<name>`, no hyphenation rules)
- The new step contains no collision handling details (no `ask_user`, no suffix logic)
- Subsequent steps are re-numbered sequentially: old Step 4 → Step 5, old Step 5 → Step 6
- Total step count references are updated (if the prompt mentions a specific number of steps)
- The new step text is consistent with existing prompt style (bold title, descriptive instructions)

## Risks and Edge Cases

- **Step numbering:** Ensure ALL step references are updated — including cross-references like "Step 5: Signal completion" becoming "Step 6". Check the entire file for hardcoded step numbers.
- **Process intro:** The "Follow these steps in order" line may implicitly reference a count — verify no orphaned references remain.
- **Prompt guidelines section:** The bottom "Guidelines" section mentions specific steps — check if any need updating after re-numbering.
