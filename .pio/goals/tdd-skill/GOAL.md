# Test-Driven Development Skill

Create a new skill file at `src/skills/test-driven-development/SKILL.md` for the pio extension. This skill guides the `execute-task` and `execute-plan` capabilities in test-first implementation. The content is based on an existing draft at `docs/tdd-skill-draft.md` but must be generalized to be language-agnostic and framework-independent.

Register the new skill in `src/index.ts` by adding its directory to the `skillPaths` array so it appears in the `<available_skills>` section of pi's default system prompt.

## Current State

### Existing Skill Infrastructure
- **Skill convention:** Skills live at `src/skills/<name>/SKILL.md`. Currently only one skill exists: `src/skills/pio/SKILL.md`.
- **Frontmatter format:** YAML frontmatter with `name` and `description` fields (e.g., `---\nname: pio\ndescription: ...\n---`).
- **Registration:** `src/index.ts` resolves `SKILLS_DIR` from `__dirname + "/skills"` and returns `{ skillPaths: [path.join(SKILLS_DIR, "pio")] }` in the `resources_discover` handler. Adding a new skill requires appending its path to this array.

### Existing Draft
- A full TDD skill draft exists at `docs/tdd-skill-draft.md`. It contains comprehensive content but is **TypeScript/Jest-specific** throughout:
  - Code examples are exclusively TypeScript with Jest syntax (`describe`, `it`, `expect().toBe()`)
  - Test runner references mention `npm test` specifically
  - Assertion patterns use Jest matchers
  - The Prove-It Pattern, Test Pyramid, DAMP vs DRY, and Arrange-Act-Assert sections are conceptually universal but expressed in JS/TS terms

### Capabilities That Use This Skill
- **`execute-task`** (`src/capabilities/execute-task.ts`, prompt at `src/prompts/execute-task.md`) — explicitly follows a test-first workflow. Step 4 is "Write tests first (Red phase)", Step 5 is "Implement the feature (Green phase)". Currently mentions Jest/Vitest by name.
- **`execute-plan`** (`src/capabilities/execute-plan.ts`, prompt at `src/prompts/execute-plan.md`) — implements all plan steps, references test suites and type-checking. Mentions `npm run check` specifically.

### What Needs to Change in the Draft
1. **Code examples** — Replace or supplement TypeScript/Jest examples with multiple language variants (Python/pytest, Rust) or pseudocode
2. **Test assertion syntax** — Add a language-agnostic "Assertion Patterns" reference table instead of only Jest-specific `expect()` calls
3. **Test runner references** — Change "run `npm test`" to "run your project's test suite" with examples across ecosystems (`cargo test`, `go test`, `pytest`, etc.)
4. **Prove-It Pattern** — Keep as-is (conceptually universal), just generalize the code example
5. **Test Pyramid, DAMP over DRY, Arrange-Act-Assert** — Keep principles, generalize examples
6. **Anti-patterns table** — Already language-agnostic, keep as-is
7. **Common Rationalizations and Red Flags** — Already universal, keep as-is
8. **Browser Testing section** — Make tool-agnostic (currently references Chrome DevTools MCP specifically). Keep the workflow and security boundaries but generalize the tooling discussion

## To-Be State

### New Files
- **`src/skills/test-driven-development/SKILL.md`** — The new skill file containing:
  - YAML frontmatter: `name: test-driven-development` with a concise description matching the existing format
  - Overview, When to Use, and TDD Cycle (RED → GREEN → REFACTOR) sections
  - Code examples in multiple languages: JavaScript/TypeScript (Jest or Vitest), Python (pytest), and Rust — showing the same test concept across ecosystems
  - Prove-It Pattern with language-generalized examples
  - Test Pyramid with Beyonce Rule (keep as-is)
  - Test Sizes table and Decision Guide (keep as-is)
  - Writing Good Tests section: State over Interactions, DAMP over DRY, Prefer Real Implementations over Mocks, Arrange-Act-Assert, One Assertion Per Concept, Descriptive Names — all with generalized examples
  - **New section: "Assertion Patterns (Language-Agnostic)"** — a reference table mapping common assertion patterns (equality, inequality, truthiness, null/empty, type check, exception, containment, approximate) to syntax across multiple languages
  - Test Anti-Patterns table (keep as-is)
  - Browser Testing section — generalized tool references while keeping the workflow and security boundaries; mention Chrome DevTools MCP as one available option but don't tie the skill to it exclusively
  - Running Tests section — mentions multiple ecosystems' test commands as examples
  - Common Rationalizations table (keep as-is)
  - Red Flags list (keep as-is)
  - Verification Checklist — generalized "run your project's test suite" instead of `npm test`

### Modified Files
- **`src/index.ts`** — Add `path.join(SKILLS_DIR, "test-driven-development")` to the `skillPaths` array in the `resources_discover` handler. The new entry should follow the existing pattern (e.g., after `"pio"`).
- **`src/prompts/execute-task.md`** — Add an explicit reference to the TDD skill near the top of the prompt. The execute-task capability is the primary consumer of this skill — it implements features using a test-first workflow (RED → GREEN → REFACTOR). The reference should instruct the agent to follow the TDD skill's guidance when writing tests and implementing features. A short paragraph or callout referencing the `test-driven-development` skill by name is sufficient.
- **`src/prompts/evolve-plan.md`** — Add a lighter reference to the TDD skill in the section about writing `TEST.md`. The evolve-plan capability generates test specifications, so relevant guidance from the skill (Arrange-Act-Assert pattern, DAMP over DRY, one assertion per concept, test pyramid sizing) helps produce better test specs. A brief mention that TEST.md should follow principles from the `test-driven-development` skill is sufficient.

### Quality Bar
- A reader working on a Python, Rust, Go, Java, or JavaScript project should find every section directly applicable without needing to mentally translate Jest syntax
- No language-specific imports, types, or framework APIs appear as the *only* example in any section
- The skill is self-contained — no external references to `references/testing-patterns.md` (which doesn't exist)
- The skill follows the exact same frontmatter format and structure conventions as `src/skills/pio/SKILL.md`
