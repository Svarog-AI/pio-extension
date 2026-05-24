# Task: Inject PR creation into finalize-goal prompt

Add a new step to `src/prompts/finalize-goal.md` instructing the agent to create a pull request after producing the summary, following the PR Creation Protocol from the pio-git skill.

## Context

The finalize-goal prompt currently has 10 steps ending with "Signal completion". After the goal summary is produced (Step 9), the agent should create a PR for the goal's changes before signaling completion. Step 1 already added the "PR Creation Protocol" to `src/skills/pio-git/SKILL.md`. This step injects the prompt instruction that triggers it.

This follows the same pattern as Step 2 (injecting branch checkout into create-goal.md): the prompt states WHAT, the skill defines HOW. No implementation details leak into the prompt.

## What to Build

Insert a new step into `src/prompts/finalize-goal.md` between Step 9 ("Produce a summary output") and Step 10 ("Signal completion"). The new step (Step 10) instructs the agent to:

1. Create a pull request for this goal's changes
2. Follow the "PR Creation Protocol" from the "pio-git" skill
3. Pass relevant context (goal name, workspace path) to the protocol
4. Proceed with completion even if PR creation fails (graceful failure — consistent with "warn and skip" semantics)

After inserting the new step, re-number old Step 10 ("Signal completion") to Step 11. Update any total step count references in the prompt to reflect 11 steps total.

### Code Components

This is a content-only change to a markdown prompt file. No TypeScript code, functions, or modules are involved. The change consists of:

- **New Step 10 text:** A concise instruction block (~4 sentences) referencing "PR Creation Protocol" from the "pio-git" skill
- **Step re-numbering:** Old Step 10 → Step 11
- **Header update:** If the prompt header mentions a step count (e.g., "Follow these 10 steps"), update to reflect the new count

### Approach and Decisions

- **Mirror Step 2's pattern exactly:** Step 2 injected a branch checkout step into `create-goal.md` with 4 sentences, referencing "Branch Checkout Protocol" from "pio-git". Use the same structure for PR creation in `finalize-goal.md`.
- **Reference accumulated decisions (DECISIONS.md):** Both protocols reference `[REFERENCE.md](REFERENCE.md)` for edge case details. The prompt need not mention this — it simply references the skill by name, and the skill handles progressive disclosure internally.
- **No shell commands or implementation details:** Following the core pio principle: prompts define WHAT, skills define HOW. The step must NOT contain `gh pr create`, `gh auth status`, branch pushing commands, or any implementation-specific language.
- **Graceful failure clause:** Include language like "proceed with goal finalization even if PR creation fails" to maintain consistency with the "warn and skip" semantics from DECISIONS.md.

## Dependencies

- **Step 1 (add-git-protocols-to-skill):** The "PR Creation Protocol" section must exist in `src/skills/pio-git/SKILL.md` before this prompt can reference it. Step 1 is COMPLETED and APPROVED.

## Files Affected

- `src/prompts/finalize-goal.md` — add PR creation step between Steps 9 and 10, re-number subsequent steps (old Step 10 → Step 11)

## Acceptance Criteria

- `src/prompts/finalize-goal.md` contains a new step after old Step 9 ("Produce a summary output") instructing PR creation
- The new step references "PR Creation Protocol" from the "pio-git" skill by name
- The step contains no `gh pr create` commands, auth checks (`gh auth status`), or branch pushing details (`git push`)
- Subsequent steps are re-numbered sequentially (old Step 10 → Step 11, total of 11 steps)
- Total step count in the prompt is updated to reflect 11 steps (if a count is mentioned in the header)
- The new step includes graceful failure language (proceed with completion if PR creation fails)
- `npm run check` (`tsc --noEmit`) passes with exit code 0
- `npm test` passes with no new failures

## Risks and Edge Cases

- **Step numbering gaps:** Ensure re-numbering is applied consistently throughout the document (step headings, cross-references, total count). Step 2 had only Steps 4→5 and 5→6; finalize-goal.md has only one step after the insertion point (Step 10→11), reducing risk.
- **Prompt header references:** Check if the prompt intro text mentions a specific number of steps (e.g., "Follow these 10 steps"). Update accordingly.
- **Content leakage:** Verify no `gh` CLI commands, authentication details, or branch-pushing instructions appear in the new step. The skill handles all implementation details.
