# Task: Extract planning methodology into shared skill

Create `src/skills/pio-planning/SKILL.md` containing all planning methodology currently embedded in `src/prompts/create-plan.md`, so both `create-plan` and future `revise-plan` capabilities can reference identical conventions.

## Context

Currently, all planning knowledge (step structure rules, acceptance criteria guidelines, research approach, file format conventions) lives exclusively in `src/prompts/create-plan.md`. This means any new planning-related capability (like the upcoming `revise-plan`) must duplicate these conventions or risk divergence. The GOAL.md for this goal calls for extracting methodology into a shared skill so both capabilities use identical conventions.

## What to Build

A new self-contained SKILL.md at `src/skills/pio-planning/SKILL.md` that documents the complete planning methodology. A reader who reads only this file should understand exactly how to write a `PLAN.md` — including YAML frontmatter format, step heading structure, acceptance criteria rules, research instructions, and the no-source-code policy — without needing to reference any prompt file.

### Code Components

This is a documentation-only task. The single deliverable is `src/skills/pio-planning/SKILL.md`. The skill must follow the existing skill format: YAML frontmatter with `name` and `description`, followed by markdown content.

**Required sections to extract from `create-plan.md`:**

1. **PLAN.md structure conventions:**
   - YAML frontmatter with `totalSteps` field (must equal actual step count)
   - Document title format: `# Plan: <Goal Name>`
   - Required sections: Prerequisites, Steps, Notes
   - Step heading format: `### Step N: <Descriptive Title>`

2. **Step design rules:**
   - Each step must have: Description, Acceptance criteria, Files affected
   - Description: natural language, what changes (added/removed/modified)
   - Interface signatures (type stubs) are OK; full function bodies are not
   - Steps should be concrete, ordered, sized for a single session (~minutes to an hour)
   - Mark independent steps as parallel-eligible where applicable

3. **Acceptance criteria rules:**
   - Mandatory: every step must have at least one acceptance criterion
   - Prefer programmatic checks: `npx tsc --noEmit`, existing test suites, build commands, HTTP checks, file existence
   - Criteria verify completion — they do NOT plan tests (that's evolve-plan/execute-task territory)
   - Do not create dedicated plan steps for writing unit tests
   - A criterion is too vague if an executor could disagree about whether it's met
   - If programmatic verification truly isn't possible, state so explicitly and provide the best manual alternative

4. **Research instructions:**
   - Read `.pio/PROJECT/OVERVIEW.md` if it exists (project entry point)
   - Read every file referenced in `GOAL.md`, trace dependencies and imports
   - Understand existing patterns, conventions, testing setup, build config, CI pipeline
   - Identify hidden complexity: shared utilities, circular dependencies, migration requirements, backwards-compatibility
   - Look at existing tests to understand how things are tested today

5. **File conventions:**
   - `GOAL.md` is read-only during planning — never modify it
   - Output is `PLAN.md` only — no source code creation
   - Reference real files only — every path must correspond to a file actually read or confirmed to exist

6. **No-source-code policy:**
   - PLAN.md is a planning document, not an implementation draft
   - Describe every step in natural language or high-level pseudocode
   - Short interface signatures (type stubs) are allowed to clarify contracts
   - Never write full function bodies, class implementations, or multi-line logic blocks
   - If writing `if`/`for`/`while` blocks, stop and rewrite as description

7. **Step ordering principles:**
   - Steps reflecting real implementation order — if step 3 needs an export from step 1, that must be clear
   - An executor should never have to reorder steps

8. **Scope discipline:**
   - Stay within GOAL.md scope
   - Do not add steps for refactoring unrelated code, fixing style issues, or "while you're at it" improvements

9. **User interaction guidelines:** (relevant for revise-plan too)
   - Present research findings before asking decisions
   - Use `ask_user` with structured options for architecture choices
   - One question at a time, 2-5 clear choices with trade-off descriptions
   - Max 2 attempts per boundary decision
   - Summarize plan structure (step count + titles) before writing PLAN.md
   - Don't over-interview: keep to 2-3 exchange rounds total

### Approach and Decisions

- Follow the existing skill format: YAML frontmatter with `name: pio-planning` and a descriptive `description` field, then markdown content. Model after `src/skills/pio-project-knowledge/SKILL.md` for structure and tone.
- The skill should be organized into clear sections (not a flat list) so readers can navigate to specific topics. Suggested headings: Overview, PLAN.md Structure, Step Design Rules, Acceptance Criteria Guidelines, Research Process, Scope Discipline, User Interaction Protocol.
- Do NOT include capability-specific instructions like "you are creating a fresh plan from GOAL.md" — those stay in `create-plan.md`. The skill contains methodology shared across all planning capabilities.
- Do NOT modify `src/prompts/create-plan.md` in this step — that's Step 6 of the plan.

## Dependencies

None.

## Files Affected

- `src/skills/pio-planning/SKILL.md` — new file: shared planning methodology skill

## Acceptance Criteria

- [ ] `src/skills/pio-planning/SKILL.md` exists with comprehensive planning methodology content
- [ ] All step structure, acceptance criteria, and research instructions from current `create-plan.md` are captured in the skill
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Completeness:** Ensure nothing is lost — every planning rule currently in `create-plan.md` must appear in the skill. Step 6 will verify this when shrinking `create-plan.md`.
- **No duplication of capability-specific content:** The skill should contain shared methodology only. Role definitions like "you are a Planning Agent" belong in prompt files, not skills.
- **Skill discoverability:** The `name` and `description` fields in YAML frontmatter will be used by pi's skill discovery system. Make the description concise but informative so agents know when to reference this skill.
