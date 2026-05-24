# Revise-plan: Prioritize archived PLAN.md over GOAL.md for implementation details

During `revise-plan`, the Plan Revision Agent should treat the archived `PLAN.md` as the primary authority on implementation details. The current prompt language — "Read GOAL.md, this is your contract" and "read archived plans for reference" — implies GOAL.md takes priority, causing the agent to discard deliberate implementation decisions from the original plan and diverge into unwanted scope changes.

## Current State

**Prompt:** `src/prompts/revise-plan.md`

The revise-plan prompt establishes this reading order:
1. **Step 1: Read GOAL.md** — "This is your contract — it defines what 'current state' means and what 'done' looks like."
2. **Step 2: Read archived plans** — "Read it for reference on what was planned before."

The language in Step 1 ("your contract") combined with Step 2's weaker framing ("for reference") implicitly signals that GOAL.md is the primary source of truth. The prompt lacks any explicit priority ordering when GOAL.md and the archived PLAN.md disagree on implementation details.

In **Step 5: Design new steps**, the guiding principle says "Stay within GOAL.md scope — do not add unrelated refactoring or improvements." This reinforces GOAL.md as the top-level authority but doesn't distinguish between *scope boundaries* (where GOAL.md is authoritative) and *implementation details* (where archived PLAN.md should be).

The `## Guidelines` section has no guidance about preserving implementation decisions from archived plans. It mentions "Reference real files only" and "No source code in PLAN.md" but nothing about hierarchy of references.

**Skill:** `src/skills/pio-planning/SKILL.md`

The pio-planning skill defines shared methodology for both `create-plan` and `revise-plan`. Under **Scope Discipline**, it states: "`GOAL.md` is read-only during planning. Never modify it." and "Stay within GOAL.md scope." However, it has no section addressing the priority hierarchy between GOAL.md, archived plans, and revision notes — a concept relevant primarily to revise-plan but worth documenting as shared planning knowledge.

**Capability:** `src/capabilities/revise-plan.ts`

The `defaultInitialMessage` tells the agent: "Read the archived plans and completed step folders, then write a fresh PLAN.md continuing from the last completed step." This is functionally correct but provides no priority guidance — it doesn't tell the agent which source to trust when details conflict.

**Observed behavior:** On the `execute-task-auto-commit` goal, revise-plan discarded deliberate decisions from the archived plan (short commit messages without "Step N" format, treating `.pio/PROJECT/GIT.md` as read-only) and reverted to GOAL.md specifications (longer `pio: Step N — <title>` format, modifying GIT.md). The resulting plan grew from 3 steps to 4 and included scope not present in the original plan.

## To-Be State

**Updated prompt (`src/prompts/revise-plan.md`):**

The revise-plan prompt explicitly establishes a priority hierarchy for resolving conflicts between sources:

> **Revision notes > archived PLAN.md > GOAL.md (for implementation details)**

- **Revision notes** (from `REVISE_PLAN_NEEDED`, trigger step's `TASK.md` and `DECISIONS.md`) — specific changes required. These override everything.
- **Archived PLAN.md** — primary reference for implementation details, formatting decisions, and architectural choices already made by the planning agent. Preserve all decisions from the archived plan unless revision notes explicitly require a change.
- **GOAL.md** — provides scope boundaries and high-level context. Use it to understand *what* should be built, but do not let its high-level description override specific *how* decisions already encoded in the archived plan.

Concrete prompt changes:
1. **Step 2 (Read archived plans):** Strengthen language from "read for reference" to explicitly state the archived plan is the primary authority on implementation details.
2. **Step 5 (Design new steps):** Add a principle stating that the *only* modifications to archived plan decisions should be: (a) changes explicitly requested in revision notes, (b) new steps required for gaps discovered during specification, (c) re-numbering after completed steps.
3. **Guidelines section:** Add a guideline about preserving implementation decisions from archived plans and not reverting them based on GOAL.md's high-level description.

**Updated skill (`src/skills/pio-planning/SKILL.md`):**

Add documentation of the priority hierarchy concept. This could be:
- A new subsection under **Scope Discipline** (or a sibling section) explaining that during revision, implementation details follow the hierarchy: revision notes > archived PLAN.md > GOAL.md.
- Clarification that GOAL.md defines *what* and scope boundaries, while archived PLAN.md defines *how* — and revise-plan should preserve the *how*.

This ensures any future planning-related agents or documentation updates inherit this methodology consistently.
