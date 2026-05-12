# Plan: TDD Skill

Create a language-agnostic `test-driven-development` skill, register it in the extension, and wire references into the `execute-task` and `evolve-plan` prompts — all content based on `docs/tdd-skill-draft.md` but generalized to pseudocode.

## Prerequisites

None.

## Steps

### Step 1: Write core SKILL.md content

**Description:** Create `src/skills/test-driven-development/SKILL.md` with the foundational sections of the TDD skill. This covers roughly half the final file: YAML frontmatter, Overview, When to Use, TDD Cycle (RED → GREEN → REFACTOR), Prove-It Pattern, Test Pyramid (including Beyonce Rule), Test Sizes table, and Decision Guide. All code examples must be pseudocode — no TypeScript, Jest, or any language-specific syntax.

**Acceptance criteria:**
- [ ] `src/skills/test-driven-development/SKILL.md` exists with valid YAML frontmatter: `name: test-driven-development` and a concise description matching the format of `src/skills/pio/SKILL.md`
- [ ] Contains Overview, When to Use, TDD Cycle, Prove-It Pattern, Test Pyramid (with Beyonce Rule), Test Sizes table, and Decision Guide sections
- [ ] All code examples use pseudocode — zero language-specific imports, types, or framework APIs appear as the only example in any section
- [ ] No references to non-existent files (`references/testing-patterns.md`, `browser-testing-with-devtools`)
- [ ] File follows the same frontmatter format as `src/skills/pio/SKILL.md`

**Files affected:**
- `src/skills/test-driven-development/SKILL.md` — new file: core TDD skill content

### Step 2: Complete SKILL.md with remaining sections

**Description:** Append the remaining sections to the file created in Step 1. This covers the second half: Writing Good Tests (State over Interactions, DAMP over DRY, Prefer Real Implementations, Arrange-Act-Assert, One Assertion Per Concept, Descriptive Names), new "Assertion Patterns (Language-Agnostic)" reference table, Test Anti-Patterns table, Browser Testing section (generalized tool references, security boundaries), Running Tests section (multiple ecosystems as examples), Common Rationalizations table, Red Flags list, and Verification Checklist. All examples remain pseudocode. Remove any dead references from the original draft (`references/testing-patterns.md`, `browser-testing-with-devtools`).

**Acceptance criteria:**
- [ ] `src/skills/test-driven-development/SKILL.md` contains all sections listed in GOAL.md's "To-Be State": Writing Good Tests subsections, Assertion Patterns table, Test Anti-Patterns, Browser Testing, Running Tests, Common Rationalizations, Red Flags, Verification Checklist
- [ ] The "Assertion Patterns" reference table maps at least 7 common patterns (equality, inequality, truthiness, null/empty, type check, exception, containment) using pseudocode descriptions — no single-language syntax as the only representation
- [ ] Browser Testing section mentions Chrome DevTools MCP as one available option but is not tied to it exclusively
- [ ] Verification Checklist says "run your project's test suite" rather than `npm test`
- [ ] No dead references remain (`references/testing-patterns.md`, `browser-testing-with-devtools`)
- [ ] The complete file reads coherently as a single skill document

**Files affected:**
- `src/skills/test-driven-development/SKILL.md` — modified: append remaining sections, finalize content

### Step 3: Register skill in `src/index.ts`

**Description:** Add the new skill directory to the `skillPaths` array so pi's `resources_discover` handler returns it. The registration follows the existing pattern: `path.join(SKILLS_DIR, "test-driven-development")`.

**Acceptance criteria:**
- [ ] `src/index.ts` contains `path.join(SKILLS_DIR, "test-driven-development")` in the `skillPaths` array
- [ ] The entry follows the existing convention (same format as the `"pio"` entry)
- [ ] `npm run check` reports no TypeScript errors

**Files affected:**
- `src/index.ts` — modified: add `"test-driven-development"` to `skillPaths` array

### Step 4: Update `execute-task.md` with TDD skill reference

**Description:** Add an explicit reference to the `test-driven-development` skill near the top of the `execute-task.md` prompt. The execute-task capability is the primary consumer of this skill — it implements features using a test-first workflow. The reference should instruct the agent to follow the TDD skill's guidance when writing tests and implementing features. Additionally, generalize any remaining language-specific mentions (e.g., "Jest, Vitest") in Step 4 to be more framework-agnostic.

**Acceptance criteria:**
- [ ] `src/prompts/execute-task.md` contains a reference to the `test-driven-development` skill near the top of the prompt (before or around Step 1)
- [ ] The reference instructs agents to follow the TDD skill's guidance when writing tests and implementing features
- [ ] Any mentions of specific test runners (Jest, Vitest) in Step 4 are generalized to be framework-agnostic while still mentioning them as examples
- [ ] `npm run check` reports no TypeScript errors (unchanged for .md files, but ensures no accidental TS issues from context)

**Files affected:**
- `src/prompts/execute-task.md` — modified: add TDD skill reference near top, generalize test runner mentions in Step 4

### Step 5: Update `evolve-plan.md` with TDD skill reference

**Description:** Add a lighter reference to the `test-driven-development` skill in the evolve-plan prompt's section about writing TEST.md. The evolve-plan capability generates test specifications, so relevant guidance from the skill (Arrange-Act-Assert pattern, DAMP over DRY, one assertion per concept, test pyramid sizing) helps produce better test specs. A brief mention that TEST.md should follow principles from the `test-driven-development` skill is sufficient.

**Acceptance criteria:**
- [ ] `src/prompts/evolve-plan.md` contains a reference to the `test-driven-development` skill in or near Step 6 (Write TEST.md)
- [ ] The mention references relevant TDD principles: Arrange-Act-Assert, DAMP over DRY, one assertion per concept, test pyramid sizing
- [ ] The reference is brief — a paragraph or callout, not a full rewrite of the section

**Files affected:**
- `src/prompts/evolve-plan.md` — modified: add TDD skill reference in TEST.md guidance section (Step 6)

## Notes

- **Steps 3–5 are independent of each other.** They can be executed in parallel since they modify different files. All depend on Step 2 completing first (SKILL.md must exist before referencing it).
- **No test suite exists.** The only programmatic verification is `npm run check` (`tsc --noEmit`). Since the modified files are `.md`, type checking won't directly validate content — acceptance criteria for SKILL.md rely on file existence and manual content review.
- **The draft at `docs/tdd-skill-draft.md` should not be deleted.** It's source material; deletion is out of scope unless explicitly requested.
- **SKILLS_DIR resolution:** In `src/index.ts`, `SKILLS_DIR` is computed from `import.meta.url` via `fileURLToPath`. Adding a new entry to the array requires no changes to this logic — it already works for any subdirectory under `src/skills/`.
