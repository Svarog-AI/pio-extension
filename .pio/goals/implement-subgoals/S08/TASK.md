# Task: Prompts and skills documentation

Additive documentation updates to `create-plan.md`, `finalize-goal.md`, `pio-planning/SKILL.md`, and `pio/SKILL.md` so agents and users understand the subgoal feature. No code changes — purely prompt and skill file updates.

## Context

Steps 1–7 implemented the code infrastructure for nested subgoals: path resolution, queue keying, frontmatter-based step metadata, state machine transitions, test generation move, lifecycle wiring, and validation. The subgoal feature now works end-to-end at the code level. However, the agent-facing documentation has not been updated — the `create-plan` prompt doesn't instruct planners to use subgoals, the `finalize-goal` prompt doesn't know about subgoal summaries, and the skill files don't document the leaf-node criteria or decomposition guards. This step closes that gap so future pio sessions can discover and use subgoals.

## What to Build

Four documentation updates across two prompt files and two skill files. All changes are additive — existing content is preserved, new sections or paragraphs are inserted at appropriate locations.

### Code Components

#### 1. `src/prompts/create-plan.md` — Subgoal decomposition instructions

Add a new section after the "Step 4: Design the steps" section (before Step 5). This section instructs the Planning Agent to evaluate each step against leaf-node criteria and mark composite steps as subgoals in the PLAN.md frontmatter `steps` array.

**Content to add:**
- Reference the leaf-node criteria from `pio-planning/SKILL.md` (I/O contract test, encapsulation rule)
- Instruct: before finalizing the plan, evaluate each step — if it fails the leaf-node test (output requires listing internal sub-outputs), mark it with `complexity: "subgoal"` in the `steps` array
- The `name` field is always required — it serves as both the human-readable label and the subgoal workspace name when `complexity` is `"subgoal"`. Use a slugified version of the step title (lowercase, hyphens, no spaces). For example: "Implement OAuth flow" → `name: oauth-flow`
- Step count guard: if `totalSteps > 8`, decompose some steps into subgoals. A flat plan with more than 8 steps indicates composite steps warranting their own subgoal. Override only with explicit justification if all steps are genuinely small and independent.

The prompt should reference `pio-planning` skill for the detailed leaf-node criteria — the prompt says WHAT to do (evaluate and mark), the skill says HOW (detailed I/O contract test, encapsulation rule).

#### 2. `src/prompts/finalize-goal.md` — Subgoal-aware summary reading

In Step 2 ("Read per-step SUMMARY.md files"), add instructions for handling steps that contain subgoals. When scanning step folders (`S01/`, `S02/`, etc.), check for a `subgoals/` subdirectory inside each step folder. If present:

- Read the subgoal workspace's `GOAL.md` and final `DECISIONS.md` (from highest-numbered sub-step) for context on what was built
- Read per-sub-step `SUMMARY.md` files from the subgoal workspace
- Treat the subgoal as a single unit — don't confuse subgoal step folders with parent step folders

This enables the finalize-goal agent to correctly synthesize decisions from both flat steps and nested subgoals.

#### 3. `src/skills/pio-planning/SKILL.md` — Leaf-node criteria and decomposition guards

Add a new section called "## Subgoal Decomposition" after the "## Scope Discipline" section. This section contains the detailed methodology for determining when a step is leaf-level versus composite:

**I/O contract test:** A plan step is a coherent transformation. Can you state its output without listing internal sub-outputs? If yes → leaf step (`complexity` omitted or `"task"`). If no → composite step (`complexity: "subgoal"`). Include the examples from the feasibility study (JWT validation = leaf, OAuth flow = composite, etc.).

**Encapsulation rule:** Does the parent plan need to know *how* this deliverable is built? If yes → keep as a regular flat step. If no → subgoal (internal details are irrelevant to the parent). Include examples from the feasibility study.

**Step count guard:** Plans exceeding 8 steps should use subgoals. This is a soft guard — override with explicit justification if all steps are genuinely small and independent.

**Frontmatter-based declaration:** Subgoal metadata lives exclusively in PLAN.md frontmatter `steps` array. Each entry has required `name` (workspace name when composite) and optional `complexity` (`"task"` default, `"subgoal"` for composite). No in-body annotations or regex parsing — the frontmatter is the single source of truth.

#### 4. `src/skills/pio/SKILL.md` — Workflow lifecycle diagram update

Update the "Workflow lifecycle" section to show how subgoals fit into the pio workflow:

- After the existing Steps 1–5 description, add a paragraph explaining that `evolve-plan` can spawn a subgoal when a step has `complexity: "subgoal"`. The subgoal runs through the full pio lifecycle recursively (create-goal → create-plan → evolve-plan → execute-task → review-task → finalize-goal).
- After the subgoal's `finalize-goal`, completion propagates back to the parent's next step via `evolve-plan`.
- Update or add a note about `COMPLETED` markers being the authoritative signal — subgoal completion = parent step completion.
- Add `subgoals/` directory structure documentation: subgoals live at `S{NN}/subgoals/<name>/` inside parent step directories.

Update the command reference table: `/pio-evolve-plan` output should note "TASK.md (or spawns subgoal for composite steps)". The `/pio-execute-task` description already says TDD — no change needed there.

## Approach and Decisions

- **All changes are additive.** Preserve existing content entirely. Insert new sections or paragraphs at locations specified above.
- **Prompt-skill separation:** Prompts say WHAT to do, skills say HOW. `create-plan.md` references leaf-node criteria but the detailed I/O contract test and encapsulation rule live in `pio-planning/SKILL.md`. This follows existing pio convention.
- **Frontmatter-only subgoal declaration:** Per the plan deviation decision (confirmed in Steps 3–7), subgoal metadata lives exclusively in the `steps` frontmatter array with `complexity: "subgoal"`. No in-body `[subgoal]` annotations, no regex parsing. All documentation must reflect this.
- **No changes to `create-goal.md`:** The initial message from `transitionEvolvePlan` carries all necessary parent context (relative path to TASK.md). No prompt changes needed for create-goal.
- **No changes to `evolve-plan.md`:** With TASK.md as the universal output artifact, evolve-plan is identical for regular and subgoal steps. Subgoal detection happens in the state machine transition (Step 4), not in prompts.

## Dependencies

- **Step 3 (Plan frontmatter metadata):** The `steps` array with `name` + `complexity` is the mechanism for declaring subgoals. Step 8 documentation must accurately describe this schema.
- **Step 4 (State machine transitions):** Subgoal spawning via `transitionEvolvePlan` and completion propagation via `transitionFinalizeGoal` are the lifecycle mechanisms described in `pio/SKILL.md`.
- **Steps 5–7:** Confirm no code-level references that contradict documentation. Step 7's unique name validation informs the `name` field guidance.

## Files Affected

- `src/prompts/create-plan.md` — modified: add subgoal decomposition section (leaf-node criteria, frontmatter declaration, step count guard)
- `src/prompts/finalize-goal.md` — modified: add subgoal-aware summary reading in Step 2
- `src/skills/pio-planning/SKILL.md` — modified: add "Subgoal Decomposition" section (I/O contract test, encapsulation rule, step count guard, frontmatter declaration)
- `src/skills/pio/SKILL.md` — modified: update workflow lifecycle diagram to show subgoal spawning and completion propagation

## Acceptance Criteria

- [ ] All four files remain valid markdown (no syntax errors — verify by reading each file after edits)
- [ ] `create-plan.md` contains a section instructing the planning agent to evaluate steps against leaf-node criteria from `pio-planning/SKILL.md` and mark composite steps with `complexity: "subgoal"` in the `steps` array
- [ ] `create-plan.md` mentions the step count guard (`totalSteps > 8`) with soft-guard semantics (override with justification)
- [ ] `create-plan.md` instructs providing the `name` field for every step entry, noting it serves as the subgoal workspace name when `complexity` is `"subgoal"`
- [ ] `finalize-goal.md` contains instructions to check for `subgoals/` directories inside step folders and read subgoal summaries (GOAL.md, DECISIONS.md, per-sub-step SUMMARY.md) instead of flat step artifacts
- [ ] `pio-planning/SKILL.md` documents the I/O contract test with concrete examples (leaf vs. composite determinations)
- [ ] `pio-planning/SKILL.md` documents the encapsulation rule with concrete examples (parent-needs-to-know vs. internal details)
- [ ] `pio-planning/SKILL.md` documents the step count guard (threshold = 8, soft guard)
- [ ] `pio-planning/SKILL.md` documents frontmatter-based subgoal declaration: `steps` array with `name` + optional `complexity` (`"task"` default, `"subgoal"` for composite)
- [ ] `pio/SKILL.md` workflow lifecycle section describes subgoal spawning from evolve-plan (when step has `complexity: "subgoal"`)
- [ ] `pio/SKILL.md` workflow lifecycle section describes completion propagation (subgoal finalize-goal → parent evolve-plan)
- [ ] `pio/SKILL.md` documents the `S{NN}/subgoals/<name>/` directory structure for nested subgoals
- [ ] Existing content in all four files is preserved — no deletions of existing instructions
- [ ] No code changes: only `.md` files are modified

## Risks and Edge Cases

- **Overlapping with existing content:** Ensure new sections don't duplicate or contradict existing instructions. Read each file carefully before inserting new content.
- **Prompt verbosity:** `create-plan.md` already has substantial content. The subgoal section should be concise — reference the skill for details rather than duplicating them inline.
- **Frontmatter-only consistency:** The GOAL.md originally described `[subgoal]` in-body annotations as primary, but the plan implemented frontmatter-only. Ensure documentation reflects the actual implementation (frontmatter only) and does not confuse agents with references to body annotations.
- **Markdown formatting:** All files must use consistent markdown syntax. Pay attention to heading levels, code fences, and list formatting when inserting new sections.
