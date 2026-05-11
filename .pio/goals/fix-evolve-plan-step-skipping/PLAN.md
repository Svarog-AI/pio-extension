# Plan: Simplify evolve-plan step selection — "last defined + 1"

Replace the "find first incomplete step" logic with a simpler "find last defined step + 1" scan, and add instructions to read previous step context when writing new specs.

## Prerequisites

- Goal workspace exists with `GOAL.md` and `PLAN.md` already created (existing prerequisite, unchanged).

## Steps

### Step 1: Rewrite step-finding logic in evolve-plan.ts

**Description:** Remove the `isStepSpecComplete()` helper and rewrite `validateAndFindNextStep()` to find the highest-numbered step folder (`S{NN}/`) that contains both `TASK.md` and `TEST.md`, then return `N + 1`. If no step folders exist, return `1`. This replaces the current semantics ("find first incomplete step") with "find last defined step + 1", allowing users to evolve specs freely without being blocked by execution state.

The new algorithm:
1. Scan sequentially starting at step 1 (`S01/`, `S02/`, …).
2. For each folder that exists, check if both `TASK.md` and `TEST.md` are present.
3. Track the highest step number where both files exist.
4. Stop scanning when a folder doesn't exist (no more steps defined beyond this point).
5. Return `highestDefined + 1` (or `1` if no defined steps found).

The `stepFolderName()` helper and the directory/file existence checks should follow the existing pattern already used in evolve-plan.ts and other capabilities.

**Acceptance criteria:**
- [ ] `isStepSpecComplete()` is removed from `src/capabilities/evolve-plan.ts`
- [ ] `validateAndFindNextStep()` returns `1` when no step folders exist
- [ ] `validateAndFindNextStep()` returns `N + 1` where `N` is the highest step with both `TASK.md` and `TEST.md`
- [ ] `npm run check` (TypeScript type checking) reports no errors
- [ ] The tool description string still accurately describes the behavior ("next uncompleted" → "next" or similar update if needed)

**Files affected:**
- `src/capabilities/evolve-plan.ts` — remove `isStepSpecComplete()`, rewrite `validateAndFindNextStep()` loop, optionally update tool description

### Step 2: Update evolve-plan.md prompt to read previous step context

**Description:** Add instructions to the Specification Writer prompt (`src/prompts/evolve-plan.md`) telling the agent to read outputs from the previous step when available. Specifically, before writing the new spec, the agent should attempt to read `S{NN-1}/SUMMARY.md` and `S{NN-1}/REVIEW.md` for background context. This is optional enrichment — the agent must proceed gracefully (no errors, no blocking) if these files don't exist.

The instruction should be added as a new step or subsection in the Process section of the prompt, positioned after reading PLAN.md but before writing TASK.md. This ensures the agent has maximum relevant context when producing specifications.

**Acceptance criteria:**
- [ ] `src/prompts/evolve-plan.md` contains instructions to read previous step outputs (`SUMMARY.md`, `REVIEW.md`) for context
- [ ] The instructions explicitly state these files are optional — proceed gracefully if they don't exist
- [ ] The new instruction is logically positioned in the Process flow (after reading PLAN.md, before writing TASK.md)
- [ ] No source code changes are needed — this is a prompt-only change

**Files affected:**
- `src/prompts/evolve-plan.md` — add previous-step context reading instructions to the Process section

## Notes

- Neither step requires changes to other capabilities. `execute-task.ts`, `review-code.ts`, and `utils.ts` have their own step-finding logic that serves different purposes (finding ready-to-execute or reviewable steps) and should not be modified here.
- The `stepFolderName()` helper is already local to evolve-plan.ts — reuse it as-is.
- Step 2 depends on no code changes, so both steps are truly independent and could be done in parallel if desired.
- After this change, evolve-plan will allow "skipping ahead" — users can generate specs for Step 5 even if Steps 2-4 haven't been executed yet. This is the intended new behavior.
