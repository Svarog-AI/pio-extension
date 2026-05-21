# Task: Integrate evolve-plan marker writing

Enable the Specification Writer (evolve-plan agent) to signal that plan revision is needed by writing a `REVISE_PLAN_NEEDED` marker file inside its step folder, and provide the prompt instructions for when to do so.

## Context

The revise-plan capability (Steps 1–7) introduces an auto-trigger mechanism: during specification (evolve-plan), if decisions make future steps impossible or require significant restructuring, the agent should write a `REVISE_PLAN_NEEDED` marker file in its step folder (`S{NN}/REVISE_PLAN_NEEDED`). The state machine (Step 4) checks for this marker via `revisionNeeded()` on StepStatus and routes to revise-plan instead of execute-task.

Two gaps remain: (1) the write allowlist doesn't permit writing the marker, and (2) the evolve-plan prompt doesn't instruct when to write it. This step closes both gaps.

## What to Build

### 1. Update `resolveEvolveWriteAllowlist()` in `src/capabilities/evolve-plan.ts`

Add `S{NN}/REVISE_PLAN_NEEDED` to the write allowlist returned by `resolveEvolveWriteAllowlist()`. This permits the Specification Writer to create the marker file inside its step folder. The marker path should be computed using the existing `folder` variable (`stepFolderName(stepNumber)`) concatenated with `/REVISE_PLAN_NEEDED`.

The constant for the marker filename should use the same string as in `revise-plan.ts`: `"REVISE_PLAN_NEEDED"`. Either define a local constant or reuse the value — consistency with the existing revise-plan implementation is important.

The marker should be included for **all step numbers** (including step 1). There is no reason to exclude it based on step number.

### 2. Update `src/prompts/evolve-plan.md` with marker writing instructions

Insert a **new assessment step** into the prompt process, positioned between the existing "Step 6: Write TEST.md" and "Step 7: Signal completion". The new step should be numbered accordingly (renumbering subsequent steps if needed). This placement is deliberate: the agent must have written TASK.md and TEST.md first — those are always required. The marker is an *additional* file, not a replacement for normal output.

**Order of operations within this new step:**
1. Evaluate whether any trigger conditions below are met based on decisions made during specification
2. If triggered: write `REVISE_PLAN_NEEDED` inside the current `S{NN}/` folder (same folder as TASK.md and TEST.md)
3. Call `pio_mark_complete` as normal — **do not call `pio_revise_plan` or any other tool**

**Important clarification for the prompt:** The agent must be explicitly told that writing the marker file is sufficient. Upon session completion, the state machine (`transitionEvolvePlan`) automatically checks `revisionNeeded()` on the current step and routes to revise-plan if the marker exists. No explicit tool call is required or expected.

**When to write `REVISE_PLAN_NEEDED`:**
1. Decisions make at least one future step impossible as-planned
2. Decisions require changes to implementations in already-completed previous steps
3. Decisions require additional steps beyond what the plan accounts for
4. The next step's spec diverges significantly from the original plan, making it confusing to read both side by side

**When NOT to write it:**
- Only minor descriptive changes needed in a single future step
- All steps stay roughly the same with minor additions/removals (file descriptions, test counts, constraints)

**Marker file format:** Markdown with YAML frontmatter containing structured fields:
```yaml
---
reason: "impossible_future_steps" | "requires_completed_changes" | "additional_steps_needed" | "significant_divergence"
decisions:
  - "decision description 1"
  - "decision description 2"
---
```
Followed by a markdown body explaining the context, decisions made, and constraints discovered.

**Note on frontmatter parsing:** The `reason` and `decisions` fields are purely informational for human review (e.g., audit trails). No code downstream parses these fields — `prepareSession` in revise-plan simply detects file existence via `fs.existsSync()` and deletes the marker. The executor should not implement any frontmatter parsing logic for this marker.

## Dependencies

- **Step 2:** `revisionNeeded()` method exists on `StepStatus` (in `src/goal-state.ts`)
- **Step 3:** `revise-plan` capability exists with `REVISE_PLAN_NEEDED` constant and marker handling in `prepareSession`
- **Step 4:** State machine routes `evolve-plan → revise-plan` when `revisionNeeded()` is true

## Files Affected

- `src/capabilities/evolve-plan.ts` — modified: add `S{NN}/REVISE_PLAN_NEEDED` to write allowlist in `resolveEvolveWriteAllowlist()`
- `src/prompts/evolve-plan.md` — modified: add new process step (between existing Step 6 and Step 7) with marker writing instructions, trigger conditions, non-trigger conditions, file format, and auto-detection explanation

## Acceptance Criteria

- [ ] `resolveEvolveWriteAllowlist()` includes `S{NN}/REVISE_PLAN_NEEDED` in the returned allowlist for all step numbers (including step 1)
- [ ] The marker filename constant (`"REVISE_PLAN_NEEDED"`) matches the value used in `src/capabilities/revise-plan.ts`
- [ ] `src/prompts/evolve-plan.md` contains a new process step inserted between "Write TEST.md" and "Signal completion"
- [ ] The new prompt step instructs when to write the marker (four trigger conditions listed)
- [ ] The new prompt step specifies criteria for NOT writing the marker (minor changes only)
- [ ] Marker file format is specified: markdown with YAML frontmatter containing `reason` (enum) and `decisions` (array of strings) fields
- [ ] Prompt explicitly instructs agent that writing the marker alone is sufficient — state machine auto-detects on session completion via `revisionNeeded()`
- [ ] Prompt explicitly instructs agent NOT to call `pio_revise_plan` or any other tool after writing the marker — just proceed to `pio_mark_complete`
- [ ] Prompt makes clear that TASK.md and TEST.md are always required regardless of whether a marker is written
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Constant consistency:** The string `"REVISE_PLAN_NEEDED"` must match exactly between evolve-plan.ts, revise-plan.ts, and goal-state.ts. A mismatch would break the auto-detection chain. Using the literal string in evolve-plan.ts is acceptable — tests should verify consistency.
- **Prompt step numbering:** Inserting a new step into evolve-plan.md will shift subsequent step numbers. The executor must renumber "Step 7: Signal completion" to "Step 8" (or whatever follows). Ensure all cross-references remain coherent.
- **Timing matters:** The marker file must be written BEFORE `pio_mark_complete`. If validation or transition checks run before the file exists, `revisionNeeded()` will return false and the route to revise-plan won't trigger.
