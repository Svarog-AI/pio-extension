# Evolve-Plan Carryover Mechanism

Add a `DECISIONS.md` file to each step folder (`S{NN}/`) so that architectural decisions made during implementation of earlier steps are automatically carried forward to later specification and implementation sessions. Currently, the Specification Writer (`evolve-plan`) reads only the immediately previous step's `SUMMARY.md` and `REVIEW.md`, causing non-adjacent steps to miss critical context (e.g., a file placement decision from Step 1 was lost by Step 3).

## Current State

### How evolve-plan gathers context today

When `pio_evolve_plan` launches for Step N, the Specification Writer reads:
- `GOAL.md` — big picture (current state + to-be state)
- `PLAN.md` — full plan with all step descriptions and acceptance criteria
- `S{NN-1}/SUMMARY.md` — what was built in the previous step (optional enrichment)
- `S{NN-1}/REVIEW.md` — review feedback on the previous step (optional enrichment)

This is defined in the evolve-plan prompt (`src/prompts/evolve-plan.md`, Step 3). The capability config (`src/capabilities/evolve-plan.ts`) produces only `TASK.md` and `TEST.md` inside `S{NN}/`. The `writeAllowlist` permits writing to these files plus a root-level `COMPLETED` marker.

### How decisions are captured today

- **execute-task** writes `SUMMARY.md` in `S{NN}/` with a "Decisions Made" section listing key technical decisions during implementation. This is defined in `src/prompts/execute-task.md`, Step 8.
- **review-code** writes `REVIEW.md` in `S{NN}/` with categorized issues and findings. The review prompt (`src/prompts/review-code.md`) reads `SUMMARY.md` and references the decisions section.
- These decisions are scoped to a single step — there is no mechanism to propagate them forward to later steps.

### How create-plan initializes a goal

When `pio_create_plan` launches, the Planning Agent produces `PLAN.md`. The capability config (`src/capabilities/create-plan.ts`) has:
- `readOnlyFiles: ["GOAL.md"]` — prevents modification of the goal definition
- `writeAllowlist: ["PLAN.md"]` — can write only the plan

No auxiliary files (like a decisions log) are created during planning. The create-plan prompt (`src/prompts/create-plan.md`) instructs the agent to write `PLAN.md` and nothing else.

### Concrete failure observed

During the `refactor-module-boundaries` goal:
1. `PLAN.md` stated `stepFolderName()` would live in `src/transitions.ts`
2. During Step 1 implementation, a decision was made to put it in `fs-utils.ts` instead (better semantic fit)
3. The decision was documented in `S01/SUMMARY.md` under "Decisions Made"
4. Step 3's Specification Writer read `PLAN.md` literally and specified the wrong placement — had to be corrected manually
5. Step 3 could not read Step 1's context because it only reads the immediately previous step (Step 2)

### Relevant files

- `src/capabilities/evolve-plan.ts` — evolve-plan capability: validation, config, tool/command registration
- `src/prompts/evolve-plan.md` — Specification Writer prompt: reads GOAL.md, PLAN.md, and optionally previous step's SUMMARY.md/REVIEW.md
- `src/capabilities/create-plan.ts` — create-plan capability: creates PLAN.md
- `src/prompts/create-plan.md` — Planning Agent prompt
- `src/prompts/execute-task.md` — Execute Task prompt: documents decisions in SUMMARY.md "Decisions Made" section
- `src/prompts/review-code.md` — Code Review prompt: reads SUMMARY.md and references decisions

## To-Be State

### DECISIONS.md chain per step (Step 2+)

Each step folder from `S02/` onward will contain a `DECISIONS.md` file that accumulates all relevant decisions from **all preceding steps**. Step 1 (`S01/`) produces no `DECISIONS.md` — there are no prior decisions to carry forward.

**Step N (N > 1):** evolve-plan reads:
- `S{NN-1}/SUMMARY.md` — new decisions from the immediately previous implementation
- `S{NN-1}/DECISIONS.md` — accumulated decisions from all steps before N-1 (for Step 2, this file does not exist; evolve-plan handles the missing file gracefully and uses only SUMMARY.md)
- Merges these into an updated `S{NN}/DECISIONS.md` containing all relevant carry-forward decisions for downstream steps

The Specification Writer filters out decisions that are no longer relevant (e.g., implementation-only details) and retains architectural choices affecting future steps.

### Decisions incorporated into TASK.md

Beyond writing `DECISIONS.md`, evolve-plan must incorporate relevant prior decisions into `TASK.md` itself. The "Approach and Decisions" or equivalent section of `TASK.md` should reference decisions from `DECISIONS.md` that directly affect the current step's implementation. This ensures the Execute Task Agent sees the correct context directly in its task specification without needing to read separate files.

### execute-task can optionally read DECISIONS.md

The execute-task prompt will be updated to note the existence of `DECISIONS.md` in the step folder as optional enrichment context. The primary carry-forward mechanism remains TASK.md content, but execute-task may reference `DECISIONS.md` for additional background on decisions from earlier steps.

### Files to change

- `src/capabilities/evolve-plan.ts` — update config: add `DECISIONS.md` to validation files and write allowlist for Step 2+; handle gracefully when previous step has no DECISIONS.md (Step 1 → Step 2 transition)
- `src/prompts/evolve-plan.md` — instruct the Specification Writer to read previous SUMMARY.md + DECISIONS.md (if it exists), merge decisions into a new `S{NN}/DECISIONS.md`, and incorporate relevant decisions into TASK.md
- `src/prompts/execute-task.md` — mention that `S{NN}/DECISIONS.md` may exist as optional enrichment context (Step 2+ only)

### Acceptance criteria

- Running `pio_evolve_plan` for Step 1 produces `S01/TASK.md` and `S01/TEST.md` only (no DECISIONS.md)
- Running `pio_evolve_plan` for Step 2 reads the previous step's `SUMMARY.md`, handles the missing `DECISIONS.md` gracefully, and produces `S02/TASK.md`, `S02/TEST.md`, and `S02/DECISIONS.md`
- Running `pio_evolve_plan` for Step 3+ reads the previous step's `SUMMARY.md` and `DECISIONS.md`, produces an updated `S{NN}/DECISIONS.md` with accumulated decisions, and incorporates relevant prior decisions into `S{NN}/TASK.md`
- `npm run check` reports no TypeScript errors after all changes
- Existing behavior (TASK.md + TEST.md generation) is preserved — DECISIONS.md is additive only
