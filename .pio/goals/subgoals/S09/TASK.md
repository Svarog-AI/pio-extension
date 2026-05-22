# Task: Dimension 9 — Planning awareness + synthesis

Produce the "Dimension 9: Planning awareness" analysis and the final synthesis section for `FEASIBILITY.md`, completing the Subgoals Feasibility Study with a go/no-go recommendation.

## Context

This is Step 9 of the Subgoals Feasibility Study — the final step. Dimensions 1–8 have been analyzed and documented in `FEASIBILITY.md` (~2498 lines). Dimension 9 covers how `create-plan` and `evolve-plan` distinguish subgoal steps from regular steps, and synthesizes all findings into a cohesive document.

Key challenge: currently, PLAN.md has no per-step metadata — only `totalSteps` in frontmatter. There is no way to mark "Step 3 is a subgoal step." This dimension must design the signaling mechanism (schema + prompt + behavior changes) and tie it together with all prior dimensions.

## What to Build

Append two major sections to `FEASIBILITY.md`:

### Section 1: Dimension 9 — Planning awareness

Analyze how the planning and specification layers detect and handle subgoal-type steps. Cover four sub-topics:

#### 1a. Step-level metadata in PLAN.md

Currently `PLAN_FRONTMATTER_SCHEMA` (`src/frontmatter-schemas.ts`, line ~30) contains only:
```typescript
Type.Object({ totalSteps: Type.Integer({ minimum: 1 }) })
```

Evaluate options for per-step or per-plan subgoal metadata:

- **Option A: Frontmatter-only approach.** Add a `subgoalSteps` array to frontmatter listing which step numbers are subgoals (e.g., `{ totalSteps: 5, subgoalSteps: [2, 4] }`). Simple but fragile — if plan body changes, frontmatter can drift out of sync.
- **Option B: In-body annotations.** Mark subgoal steps in the markdown body with a convention (e.g., `### Step 3: Build auth system [subgoal]`). Requires parsing step headings for markers. Backward compatible — missing markers = all regular steps.
- **Option C: Steps array in frontmatter.** Replace simple `totalSteps` with a full steps array: `{ steps: [{ number: 1, type: "regular" }, { number: 3, type: "subgoal", subgoalName: "auth-system" }] }`. Most flexible but most disruptive — changes the fundamental PLAN.md format.
- **Option D: Post-declaration at evolve-plan time.** No metadata at plan time. When `evolve-plan` encounters a step, it decides based on heuristics (content analysis) whether to spawn a subgoal. Maximum flexibility but least determinism.

For each option, evaluate: implementation complexity, backward compatibility with existing plans that have no subgoals, and integration with `postValidateCreatePlan()` in `create-plan.ts` (which validates `totalSteps` matches heading count).

#### 1b. create-plan prompt changes

Analyze `src/prompts/create-plan.md` — currently the Planning Agent produces numbered steps without any concept of subgoals. Document required changes:

- What instructions must be added to flag certain steps as subgoals?
- The leaf-node criteria from Dimension 4 (I/O contract test, encapsulation rule) should guide when a step warrants decomposition. How to encode these heuristics in the prompt?
- Step count guard: `totalSteps > 8` should trigger consideration of subgoal decomposition. Is this a hard rule or soft guidance?
- How does the Planning Agent communicate its subgoal designations? Via PLAN.md annotations only, or also via GOAL.md comments?

#### 1c. evolve-plan behavior divergence

Analyze `src/capabilities/evolve-plan.ts` — currently produces TASK.md + TEST.md for every step. When a step is flagged as a subgoal:

- **Option 1: Skip spec generation, spawn create-goal directly.** `validateAndFindNextStep()` detects subgoal-type step → instead of producing TASK.md/TEST.md, enqueue a `create-goal` task with parent context. This requires `evolve-plan` to be aware of step types — it must read PLAN.md metadata before deciding behavior.
- **Option 2: Produce wrapper specs that delegate.** Generate minimal TASK.md + TEST.md that describes the subgoal delegation contract. The execute-task agent then spawns the subgoal. Adds a layer of indirection but keeps `evolve-plan` behavior uniform.
- **Option 3: New capability or branching logic.** Introduce `evolve-subgoal` as a separate capability, or add conditional branching inside `transitionEvolvePlan()` in `src/state-machine.ts`.

Evaluate each option against: existing CAPABILITY_CONFIG expectations (TASK.md + TEST.md validation), state machine transitions, and user experience.

Cross-reference with Dimension 3 decisions (spawning mechanism, lifecycle composition) and Dimension 4 decisions (create-plan is primary initiation point).

#### 1d. Frontmatter schema evolution

Document the proposed `PLAN_FRONTMATTER_SCHEMA` changes in `src/frontmatter-schemas.ts`:

- New fields: identify exact TypeBox definitions needed (e.g., `subgoalSteps: Type.Array(Type.Integer())` or a per-step object)
- Backward compatibility: existing plans without subgoal metadata must still parse and function correctly. Use optional fields with defaults.
- Impact on `postValidateCreatePlan()` in `create-plan.ts`: validation logic may need to verify subgoal step references are valid (e.g., referenced step numbers exist).

### Section 2: Synthesis

Cross-reference all 9 dimensions and produce a cohesive conclusion containing:

#### 2a. Recommended approach summary

State the recommended nesting approach with justification, synthesizing decisions from Dimensions 1–8:
- Nesting structure: `S{NN}/subgoals/<name>/` (Dim 1)
- Queue keying: hierarchical `__` delimiters with `deriveQueueKey` (Dim 2)
- State machine: additive transitions, parent pause model (Dim 3)
- Trigger mechanism: create-plan primary initiation, leaf-node criteria (Dim 4)
- File protection: no changes to validation.ts, explicit params.workingDir (Dim 5)
- Session hierarchy: arbitrary depth supported, single-hop parent navigation acceptable (Dim 6)
- Completion propagation: subgoal COMPLETED is authoritative (Dim 7)
- Path resolution: centralized `resolveGoalDir` extension + explicit params (Dim 8)
- Planning awareness: **[recommended option from 1a]** for step-level metadata

#### 2b. Complete file modification inventory

Consolidate all changes across all dimensions into a single master table:

| File | Change Category | Dimensions Affected | Summary of Required Changes |
|------|----------------|---------------------|----------------------------|
| `src/fs-utils.ts` | new logic | D1, D8 | `resolveGoalDir` extension for nested paths; `deriveSessionName` formatting |
| ... | ... | ... | ... |

Ensure every file identified in Dimensions 1–9 is present. Resolve overlaps (e.g., `state-machine.ts` appears in D3, D5, D7, D8) into single entries with consolidated descriptions.

#### 2c. Identified risks or blockers

Document all significant risks across dimensions:
- Breaking changes risk (if any dimension requires backward-incompatible changes)
- Implementation complexity estimation (low/medium/high per file group)
- Coordination risks (e.g., multiple files must change in lockstep for path resolution)
- Test coverage gaps (new behavior with no existing test infrastructure)

#### 2d. Clear go/no-go recommendation

Provide a definitive recommendation:
- **GO** — if all dimensions are architecturally viable, changes are primarily additive/non-breaking, and risks are manageable
- **CONDITIONAL GO** — if specific risks must be addressed before proceeding
- **NO-GO** — if fundamental architectural conflicts make the approach unviable

Justify the recommendation with references to specific dimension findings. If GO or CONDITIONAL GO, outline next steps (e.g., "create a separate goal for implementation with phased rollout").

## Dependencies

- Depends on Steps 1–8 being completed and approved (context from `S09/DECISIONS.md`).
- FEASIBILITY.md must exist with Dimensions 1–8 already written (~2498 lines, confirmed).

## Files Affected

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 9 analysis + synthesis section (recommended ~300-500 additional lines)
- `.pio/goals/subgoals/SYNTHESIS.md` — new file: short executive summary of main conclusions (~1-2 pages). Distilled from all 9 dimensions. See "SYNTHESIS.md" below for structure.
- `.pio/goals/subgoals/COMPLETED` — created by the executor after all steps are done (Step 9 is the final step). Signal that feasibility study is complete.

## Acceptance Criteria

- `FEASIBILITY.md` contains a "Dimension 9: Planning awareness" section covering all four sub-topics: step-level metadata, create-plan prompt changes, evolve-plan behavior divergence, and frontmatter schema evolution.
- Each sub-topic evaluates multiple options (at least 2 per sub-topic) with trade-offs.
- `FEASIBILITY.md` contains a synthesis section with: recommended approach summary, complete file modification inventory table, identified risks or blockers, and clear go/no-go recommendation.
- The file modification inventory consolidates findings from all 9 dimensions into a single master table (no duplicate entries for the same file).
- Cross-references between dimensions are explicit (e.g., "Dimension 8 path changes resolve issues identified in Dimensions 1, 5, and planning-awareness requires Dim 4 leaf-node criteria").
- Each dimension's recommended changes are categorized as new fields, new logic, or breaking change.
- The go/no-go recommendation is clearly stated and justified with specific references to dimension findings.
- FEASIBILITY.md total line count is ≥ 2800 (synthesis adds substantial content).
- `SYNTHESIS.md` exists at `.pio/goals/subgoals/SYNTHESIS.md` with: clear go/no-go recommendation, one-paragraph summary per dimension, compact file inventory table, and top risks.
- `SYNTHESIS.md` is self-contained — readable without referring to FEASIBILITY.md.
- `SYNTHESIS.md` conclusions are consistent with FEASIBILITY.md (no contradictions).

### SYNTHESIS.md

In addition to FEASIBILITY.md, produce `SYNTHESIS.md` — a short executive summary (~1-2 pages, ~500-800 lines max) of the main conclusions from all 9 dimensions. This is a standalone reader-friendly document for decision-makers who don't need to read the full 3000+ line feasibility study.

**Target audience:** Project stakeholders deciding go/no-go on subgoals. Should be readable without referring back to individual dimension sections.

**Structure:**

```
# Subgoals — Feasibility Synthesis

## Recommendation
Clear GO / CONDITIONAL GO / NO-GO statement with 1-2 sentence justification.

## Recommended Approach (Summary)
Bulleted summary of key decisions from each dimension:
- Nesting: S{NN}/subgoals/<name>/
- Queueing: hierarchical keys with __ delimiters
- State machine: additive transitions, parent pause model
- Trigger: create-plan primary initiation
- ...

## Key Decisions by Dimension
One short paragraph per dimension (1-3 sentences) covering:
- What was studied
- What was decided
- Why this matters

## File Modification Inventory
Compact table of all affected files with change category and brief description.
Derived from the master table in FEASIBILITY.md but condensed for readability.

## Risks and Mitigations
Top 3-5 risks with one-line mitigations each.

## Next Steps
If GO or CONDITIONAL GO: outline next steps (e.g., create implementation goal).
```

**Rules:**
- **No detailed analysis.** SYNTHESIS.md is conclusions only — skip the option evaluations, code line numbers, and technical deep-dives. Those belong in FEASIBILITY.md.
- **Self-contained.** A reader should understand the recommendation without reading FEASIBILITY.md.
- **Cross-referenced.** Include a link or reference to `FEASIBILITY.md` for readers who want detail on any dimension.
- **Consistent with FEASIBILITY.md.** Conclusions must match what's written in FEASIBILITY.md — no new decisions or recommendations that contradict the detailed analysis.

## Risks and Edge Cases

- This is the final step — if synthesis reveals fundamental conflicts between dimensions, it could retroactively invalidate earlier findings. Document any such conflicts explicitly.
- The go/no-go recommendation must be definitive and justified — a vague or hedging conclusion undermines the entire study.
- Ensure the master file inventory table does not遗漏 (omit) files identified in earlier dimensions. Cross-reference against Dimension 8's comprehensive inventory.
- Backward compatibility is paramount: any schema or format changes must not break existing goals/plans that have no subgoal metadata.
