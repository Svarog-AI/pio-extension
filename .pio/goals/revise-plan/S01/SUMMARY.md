# Summary: Extract planning methodology into shared skill

## Status
COMPLETED

## Files Created
- `src/skills/pio-planning/SKILL.md` — shared planning methodology skill containing all planning conventions from `create-plan.md`

## Files Modified
- (none)

## Files Deleted
- (none)

## Decisions Made
- Organized the skill into 6 clear sections: Overview, PLAN.md Structure, Step Design Rules, Acceptance Criteria Guidelines, Research Process, Scope Discipline, User Interaction Protocol
- Used the existing skill format: YAML frontmatter with `name: pio-planning` and descriptive `description`, followed by markdown content
- Modeled structure and tone after `src/skills/pio-project-knowledge/SKILL.md`
- Excluded capability-specific instructions (e.g., "you are creating a fresh plan from GOAL.md") — those remain in `create-plan.md`
- Did NOT modify `src/prompts/create-plan.md` — that is Step 6 of the plan

## Test Coverage
All verification checks from TEST.md pass:
- File existence: `src/skills/pio-planning/SKILL.md` exists and is non-empty
- YAML frontmatter: contains `name: pio-planning` and non-empty `description`
- PLAN.md structure section: documents `totalSteps` and frontmatter format
- Step heading format: `### Step N: <Title>` documented
- Acceptance criteria rules: mandatory per step, programmatic verification preferred
- "No dedicated test steps" rule: present (unit testing is evolve-plan/execute-task territory)
- No-source-code policy: documented (no function bodies, interface signatures OK)
- Research instructions: read OVERVIEW.md, trace dependencies, identify hidden complexity
- Step ordering principle: steps must reflect real implementation order
- Scope discipline: stay within GOAL.md scope, no unrelated refactoring
- TypeScript type check: `npx tsc --noEmit` passes with no errors
- Full test suite: all 492 existing tests pass (no regressions)
