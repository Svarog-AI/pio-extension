# Task: Update `evolve-plan.md` with TDD skill reference

Add a brief reference to the `test-driven-development` skill in the evolve-plan prompt's TEST.md guidance section so specification writers produce better test specs.

## Context

The `evolve-plan` capability generates `TEST.md` files that specify test plans for each plan step. The `test-driven-development` skill (created in Steps 1–2, registered in Step 3) contains principles that directly improve test specification quality: Arrange-Act-Assert structure, DAMP over DRY, one assertion per concept, and test pyramid sizing. Currently, `evolve-plan.md` has no reference to this skill — unlike `execute-task.md` which was updated in Step 4 with a comprehensive TDD skill callout.

This step adds a lighter, focused reference appropriate for the specification-writing role (not implementation), guiding agents toward better test specs without overwhelming the prompt.

## What to Build

Add a single paragraph or callout to `src/prompts/evolve-plan.md` that references the `test-driven-development` skill. The reference should be placed in or near the TEST.md guidance section (currently described under "### Step 6: Write TEST.md" in the prompt).

The mention should highlight TDD principles most relevant to test specification (not implementation):
- **Arrange-Act-Assert** — helps structure individual test cases clearly
- **DAMP over DRY** — prevents over-abstraction in test specs
- **One assertion per concept** — keeps test cases focused and verifiable
- **Test pyramid sizing** — guides appropriate test category selection (unit vs. integration vs. verification)

### Approach and Decisions

- Follow the style established in Step 4 (`execute-task.md`) but keep it lighter: a single paragraph referencing the skill by name (`test-driven-development`) and listing relevant principles.
- Place the reference inside or immediately before the TEST.md guidance section so it's visible when agents are writing test specs.
- Use backtick formatting for the skill name: `` `test-driven-development` `` to match Step 4's convention.
- Do not rewrite existing TEST.md instructions — only add the reference as supplementary guidance.

## Dependencies

- **Step 2:** `src/skills/test-driven-development/SKILL.md` must exist with the referenced principles (Arrange-Act-Assert, DAMP over DRY, etc.)
- **Step 3:** The skill must be registered in `src/index.ts` so pi can discover it

## Files Affected

- `src/prompts/evolve-plan.md` — modified: add TDD skill reference paragraph near the TEST.md guidance section

## Acceptance Criteria

- [ ] `src/prompts/evolve-plan.md` contains a reference to the `test-driven-development` skill in or near Step 6 (Write TEST.md)
- [ ] The mention references relevant TDD principles: Arrange-Act-Assert, DAMP over DRY, one assertion per concept, test pyramid sizing
- [ ] The reference is brief — a paragraph or callout, not a full rewrite of the section

## Risks and Edge Cases

- **Placement matters:** If placed too early (e.g., near the top like Step 4), it may be missed when the agent reaches the TEST.md section. If placed too late, it won't influence the spec writing.
- **Scope creep:** This is a reference addition only — do not rewrite existing TEST.md instructions or add implementation guidance (that belongs in execute-task.md).
- **Consistency with Step 4:** The tone and formatting should match Step 4's approach but be proportionally lighter since evolve-plan generates specs, not code.
