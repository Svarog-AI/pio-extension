# Task: Update evolve-plan prompt with DECISIONS.md instructions

Modify the Specification Writer prompt (`evolve-plan.md`) so that for Step 2+, it reads prior decisions, merges them into a new `S{NN}/DECISIONS.md`, and incorporates relevant decisions into `TASK.md`.

## Context

Currently, the Specification Writer only reads the immediately previous step's `SUMMARY.md` and `REVIEW.md`. This causes non-adjacent steps to miss critical context — e.g., a file-placement decision from Step 1 was lost by Step 3 because Step 3 could only read Step 2's files. The carryover mechanism introduces `DECISIONS.md` as an accumulating decision log. Step 1 (evolve-plan config) has already added `DECISIONS.md` to the validation and write-allowlist for step > 1. This step updates the prompt so the LLM agent actually produces and consumes the file.

## What to Build

Modify `src/prompts/evolve-plan.md` with four targeted changes:

### Code Components

#### 1. Extend Step 3 (Read previous step context)

The current Step 3 instructs the Specification Writer to read `S{NN-1}/SUMMARY.md` and `S{NN-1}/REVIEW.md`. Add instructions to also read `S{NN-1}/DECISIONS.md` when it exists:

- For Step 2: `S01/DECISIONS.md` does not exist (Step 1 produces no DECISIONS.md). The prompt must handle this gracefully — proceed using only `SUMMARY.md`.
- For Step 3+: `S{NN-1}/DECISIONS.md` exists. Read it alongside `SUMMARY.md`. Extract "Decisions Made" from `SUMMARY.md` and combine with the accumulated decisions from `DECISIONS.md`.

#### 2. New sub-step: Write S{NN}/DECISIONS.md (after Step 3, before Step 4)

Insert a new sub-step instructing the Specification Writer to produce `S{NN}/DECISIONS.md` for step > 1 (skip entirely for Step 1). The file should contain:

- **Selective accumulation — only forward-looking decisions:** Include only decisions that may impact future steps. Exclude implementation-only details, local design choices with no downstream consequences, and one-off decisions already fully applied in the completed step.
- **Deduplication:** If the same decision appears across multiple prior steps (e.g., "use optional chaining" repeated in Steps 1, 2, and 3), keep exactly one entry — do not repeat the same decision under different headings. Merge related decisions where they express the same underlying choice.
- **High-priority: plan deviations must be captured.** If a step adjusted or changed the original PLAN.md (e.g., moved a function to a different file than planned, chose a different architecture than specified), this is a must-carry decision. Mark these clearly so downstream agents know the actual state differs from the plan.
- **Merged decisions:** Combine accumulated decisions from the previous `DECISIONS.md` with new "Decisions Made" from the previous `SUMMARY.md`, applying the selectivity, deduplication, and prioritization rules above.
- **Rephrasing:** Don't just append verbatim — rephrase decisions to fit the current step's context and make them actionable for downstream consumers. Group related decisions logically rather than listing them chronologically.
- **Format:** A structured markdown document with a heading per decision. Use clear categorization: decisions that deviate from the original plan should be prominent (e.g., grouped under a "Plan Deviations" section or marked explicitly).
- **Style — brief and concise:** Each decision entry must be brief, on-point, and contain only what is needed for clarity. Do not overexplain. State the decision, the affected files/areas, and downstream impact — nothing more. Aim for 1–2 sentences per decision.

#### 3. Update Step 5 (Write TASK.md) — "Approach and Decisions" section

The TASK.md template already includes an "Approach and Decisions" section. Add instructions that the writer should reference relevant prior decisions from `DECISIONS.md` that directly affect the current step's implementation. This ensures the Execute Task Agent sees correct context directly in TASK.md without needing to read separate files.

#### 4. Update Step 7 (Signal completion)

Mention `DECISIONS.md` as an expected output file for Step 2+ (for agent awareness; actual validation is handled by the config from Step 1). This ensures `pio_mark_complete` validation includes `DECISIONS.md` for step > 1.

### Approach and Decisions

- Preserve all existing prompt instructions exactly as-is. The DECISIONS.md additions are purely additive — no existing behavior should be removed or weakened.
- Follow the existing tone, formatting conventions, and heading structure of the current evolve-plan.md (markdown headings, bullet lists, code spans).
- The merge/filter/rephrase logic lives entirely in prompt instructions — no TypeScript code changes needed beyond what Step 1 already did.
- Place the new DECISIONS.md writing sub-step between the existing Step 3 (read previous context) and Step 4 (research supporting context), as it logically follows reading prior decisions and precedes writing TASK.md.
- Use `S{NN}` notation consistently with the rest of the prompt (matching how `S{NN-1}` is already used).

## Dependencies

- **Step 1 must be completed:** `DECISIONS_FILE` constant and conditional config callbacks (`resolveEvolveValidation`, `resolveEvolveWriteAllowlist`) must already exist in `evolve-plan.ts`. The prompt references `DECISIONS.md` by name, which must match the constant value from Step 1.

## Files Affected

- `src/prompts/evolve-plan.md` — modified: add DECISIONS.md reading instructions to Step 3, insert new DECISIONS.md writing sub-step, update TASK.md template's "Approach and Decisions" section, mention DECISIONS.md in Step 7

## Acceptance Criteria

- [ ] The prompt instructs the Specification Writer to read `S{NN-1}/DECISIONS.md` (if it exists) alongside `SUMMARY.md`
- [ ] The prompt handles the missing DECISIONS.md gracefully for the Step 1 → Step 2 transition
- [ ] The prompt instructs the writer to produce `S{NN}/DECISIONS.md` for steps > 1 (not for step 1)
- [ ] The prompt instructs the writer to produce only forward-looking decisions (no implementation-only details, no local one-off choices)
- [ ] The prompt instructs the writer to deduplicate decisions — same decision across steps = one entry, not many
- [ ] The prompt identifies plan deviations (departures from PLAN.md) as high-priority must-carry decisions
- [ ] The prompt instructs the writer to rephrase for context and group related decisions logically (not just append verbatim)
- [ ] The prompt requires each DECISIONS.md entry to be brief, concise, and on-point — state the decision, affected files/areas, and impact; no overexplaining
- [ ] The prompt instructs the writer to incorporate relevant prior decisions into TASK.md's "Approach and Decisions" section
- [ ] All existing prompt instructions (TASK.md structure, TEST.md generation, Step 1–7 process flow, Guidelines) are preserved unchanged
- [ ] `npm run check` reports no TypeScript errors

## Risks and Edge Cases

- **Prompt length:** evolve-plan.md is already ~190 lines. Adding DECISIONS.md instructions increases token count. Keep additions concise to avoid overwhelming the agent context.
- **Step numbering confusion:** The new sub-step is inserted between existing Step 3 and Step 4. Ensure it has a clear heading so the agent can distinguish it from the main process steps. Consider using a sub-heading (e.g., "### Step 3b: Write DECISIONS.md") to avoid renumbering all subsequent steps.
- **Backwards compatibility:** Existing goal workspaces without `DECISIONS.md` must continue working. The prompt's "handle gracefully when missing" instruction is critical for the Step 1 → Step 2 transition.
- **No content duplication between TASK.md and DECISIONS.md:** The prompt should clarify that TASK.md references relevant decisions (not duplicates them), while DECISIONS.md serves as the full accumulated log for future steps.
- **Deduplication enforcement:** The LLM agent must actively merge identical or near-identical decisions. Without explicit instruction, the agent tends to append every decision from every step verbatim, causing the file to grow with redundancy. The prompt should make deduplication an explicit, non-negotiable requirement.
- **Plan deviation visibility:** State clearly when something deviates from the PLAN.md
