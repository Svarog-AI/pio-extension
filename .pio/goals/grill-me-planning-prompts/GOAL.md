# Align grill-me skill across create-goal, create-plan, and revise-plan

Decouple the WHAT (capability prompts) from the HOW (skills) for user interviewing throughout the pio workflow. The `grill-me` skill needs a substantial rewrite to be a proper reusable technique guide—not just a 7-line reactive instruction. It should serve three distinct contexts with different dynamics: goal definition (understanding scope), plan creation (validating assumptions), and plan revision (confirming pivots). All three prompts (`create-goal.md`, `create-plan.md`, `revise-plan.md`) must reference grill-me appropriately: declaring WHAT outcomes are needed in the prompt, while the skill provides HOW to interview.

## Current State

**`src/skills/grill-me/SKILL.md`** needs a substantial rewrite, not incremental augmentation. Current state (~7 lines of body): The description—"Interview the user relentlessly about a plan or design until reaching shared understanding"—focuses on stress-testing an *existing* plan. It doesn't cover proactive validation during planning, scoped probing during goal definition, or revision-specific negotiation. The trigger phrase "Use when user wants to stress-test a plan, get grilled on their design, or mentions 'grill me'" is purely reactive—it won't activate naturally when an agent should proactively validate assumptions. Per pio core principles (capabilities describe WHAT, skills describe HOW), this skill should be a proper technique guide usable across all three capability prompts.

**`src/prompts/create-plan.md`** embeds HOW-level instructions about grill-me directly in the process steps:
- Step 2 ("Deep research") ends with: "Use the grill-me skill to resolve any doubts that popped up in the research that are challenging the feasibility or practicallity of the goal." This tells the agent *how* to resolve doubts (use a specific tool) rather than declaring *what* outcome is needed.
- Step 3 ("Validate assumptions and gather preferences") ends with: "Use the grill-me skill to make sure you clarify as much as possible from the user." Same problem—prescribes technique instead of outcome.
- The `Skill References` section at the bottom documents only `pio-planning`. It does not reference `grill-me`, so an agent following the skill reference convention wouldn't know to load grill-me for details on user interviewing techniques.

**`src/prompts/revise-plan.md`** has no user interaction step whatsoever. The process flows: Read GOAL.md → Read archived plans → Identify completed steps → Research supporting context → Design new steps → Write PLAN.md. It never asks the user anything. This is problematic because revision occurs mid-flight—architectural decisions may be invalidated, scope may have shifted, and the trigger for revision (from `REVISE_PLAN_NEEDED`) may require explicit user confirmation before committing to a new plan direction.

**`src/prompts/create-goal.md`** already handles user interaction at the WHAT level—Steps 1 and 3 say "ask open-ended but focused questions" and "keep to 2-3 exchange rounds." However, it has no `Skill References` section at all (unlike create-plan and revise-plan). There's no explicit cross-reference to grill-me or any interviewing technique. This means the agent relies entirely on inline prompt instructions for HOW to ask good questions—no skill provides the technique.

**`src/skills/pio-planning/SKILL.md`** contains a comprehensive "User Interaction Protocol" section (Section 8) that covers: presenting research findings, using `ask_user`, max 2 attempts per boundary, summarizing before writing, and not over-interviewing. This already defines the HOW for general user interaction during planning. The gap is: grill-me's relentless interviewing technique isn't integrated here, and only create-plan references pio-planning explicitly (revise-plan does too, create-goal doesn't).

**`src/prompts/_skill-loading.md`** instructs agents to scan `<available_skills>` and load matching skills at session start. This means `grill-me` IS discoverable—the skill appears in the available_skills block. The issue isn't discoverability; it's that the prompt instructions prescribe HOW to use a specific tool inline, and the skill definition is too thin to actually drive the behavior when loaded.

## To-Be State

### Rewritten `src/skills/grill-me/SKILL.md`

The skill should be rewritten as a proper reusable technique guide, not just augmented. It must support three usage contexts with different interaction dynamics:

1. **Goal definition** (create-goal): Probing user intent to clarify scope. Ask focused questions about the problem, affected areas, and constraints. Recommend answers but stay light—goal definition is directional, not exhaustive. Stop after 2-3 rounds per section.
2. **Plan creation** (create-plan): Validating assumptions after research. When feasibility doubts emerge or multiple valid approaches exist, probe the user to resolve gaps before committing to a plan. Present findings concisely, ask one decision at a time, recommend answers.
3. **Plan revision** (revise-plan): Confirming pivots mid-flight. The revision trigger revealed something broke—validate that the new direction is acceptable, negotiate scope changes, confirm which completed work to preserve.
4. **Reactive stress-testing** (existing, all prompts): User says "grill me." Walk down each decision tree branch relentlessly. Ask one at a time. Recommend answers.

The description field must be broadened so the skill matches all planning/definition contexts naturally. Something like: "Probe user intent and validate assumptions during goal definition, planning, and plan revision. Also used reactively when the user wants stress-testing on a plan or design (mentions 'grill me')."

The skill body should provide concrete technique guidance (HOW) for each context: how to structure questions, when to recommend answers, when to stop probing, how to handle ambiguity vs. confirmed decisions.

### Updated `src/prompts/create-plan.md`

Remove inline HOW references to grill-me:
- Step 2 ends with a WHAT-level instruction instead of "Use the grill-me skill..." — e.g., "When research reveals feasibility doubts or ambiguous areas, engage the user to resolve them before proceeding."
- Step 3 already contains detailed user interaction guidance—remove the trailing "Use the grill-me skill to make sure you clarify as much as possible" since the step body says WHAT and the loaded skills provide HOW.
- The `Skill References` section adds `grill-me` alongside `pio-planning`, noting it covers resolving research gaps and validating assumptions.

### Updated `src/prompts/revise-plan.md`

Gain a new Step 5 ("Validate revision direction with the user") between existing Step 4 (Research) and Step 5 (Design). Declare WHAT outcomes:
- Present what changed: summarize revision trigger reason, how remaining work differs from the archived plan.
- Validate assumptions: confirm new direction aligns with user intent—especially around scope changes, architectural pivots, or invalidated decisions.
- Negotiate scope: if remaining work fundamentally changed in character, confirm whether to proceed, split into subgoals, or adjust approach.
- Summarize and confirm: recap key decisions before designing steps.

No "use the grill-me skill" phrasing—declare WHAT (engage user to validate), let the loaded skill provide HOW.

The `Skill References` section adds `grill-me` alongside `pio-planning`.

### Updated `src/prompts/create-goal.md`

Add a `Skill References` section (currently absent). Reference both `pio-planning` and `grill-me`. The existing steps (1, 3) already handle user interaction at the WHAT level—no inline changes needed there. The skill reference ensures the agent knows to load grill-me for interviewing technique during Steps 1 and 3.

### Net effect across all three prompts

All three capability prompts describe outcomes (WHAT: understand intent, validate assumptions, resolve ambiguity, confirm scope) without prescribing tool usage (HOW: use grill-me). The HOW lives in the rewritten `grill-me/SKILL.md`, which is auto-loaded via `<available_skills>`. The `pio-planning` skill's existing "User Interaction Protocol" handles general patterns. Grill-me provides the probing technique when deeper interviewing is needed.

The relationship between `pio-planning/User Interaction Protocol` (light interaction guidelines) and `grill-me` (deep probing technique) should be clear in both documents—pio-planning says *when* to ask, grill-me says *how* to probe effectively.
