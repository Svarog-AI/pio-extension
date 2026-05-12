# Task: Write core SKILL.md content

Create `src/skills/test-driven-development/SKILL.md` with the foundational sections of the TDD skill, using pseudocode throughout.

## Context

The pio extension currently has one skill (`src/skills/pio/SKILL.md`). A draft TDD skill exists at `docs/tdd-skill-draft.md` but is entirely TypeScript/Jest-specific. This step creates the first half of a new language-agnostic skill file that will guide the `execute-task` and `execute-plan` capabilities in test-first implementation across any programming ecosystem.

## What to Build

Write `src/skills/test-driven-development/SKILL.md` containing roughly the first half of the final skill document. This includes all foundational TDD concepts but **no language-specific code** — every example must use pseudocode so the skill is immediately useful to Python, Rust, Go, Java, and JavaScript developers alike.

### Code Components

This step produces a single markdown file with the following sections:

1. **YAML frontmatter** — `name: test-driven-development` with a concise description matching the format of `src/skills/pio/SKILL.md`
2. **Overview** — What TDD is and why it matters; generalizable language (no framework references)
3. **When to Use** — When to apply TDD and when it's not needed
4. **TDD Cycle (RED → GREEN → REFACTOR)** — The three phases with pseudocode examples showing each phase of the cycle
5. **Prove-It Pattern** — How to write reproduction tests for bug fixes; pseudocode example showing test-first bug fix workflow
6. **Test Pyramid** — ASCII pyramid diagram, Beyonce Rule, and guidance on where to invest testing effort
7. **Test Sizes table** — Small / Medium / Large resource model with examples described in language-agnostic terms
8. **Decision Guide** — Flowchart-style decision tree for choosing test types

### Approach and Decisions

- **Source material:** Use `docs/tdd-skill-draft.md` as content reference. Rewrite every TypeScript/Jest code block into pseudocode that communicates the same concept without any specific language syntax.
- **Pseudocode style:** Use generic constructs like `function`, `await`, `assert`, `expect`, `throw` — or descriptive pseudocode blocks that don't tie to any specific assertion library. Avoid language-specific keywords (`async/await`, `Promise`, TypeScript types, Python decorators, Rust macros).
- **Frontmatter format:** Match `src/skills/pio/SKILL.md` exactly: YAML between `---` delimiters with `name` and `description` fields only.
- **No dead references:** Do NOT include references to `references/testing-patterns.md` or `browser-testing-with-devtools` (these files don't exist and are removed in Step 2).
- **Scope boundary:** This step covers only the foundational sections listed above. The "Writing Good Tests" section, Assertion Patterns table, Anti-Patterns, Browser Testing, Running Tests, Common Rationalizations, Red Flags, and Verification Checklist are deferred to Step 2.

## Dependencies

None. This is Step 1.

## Files Affected

- `src/skills/test-driven-development/SKILL.md` — created: core TDD skill content (first half of the final file)

## Acceptance Criteria

- [ ] `src/skills/test-driven-development/SKILL.md` exists with valid YAML frontmatter: `name: test-driven-development` and a concise description matching the format of `src/skills/pio/SKILL.md`
- [ ] Contains Overview, When to Use, TDD Cycle, Prove-It Pattern, Test Pyramid (with Beyonce Rule), Test Sizes table, and Decision Guide sections
- [ ] All code examples use pseudocode — zero language-specific imports, types, or framework APIs appear as the only example in any section
- [ ] No references to non-existent files (`references/testing-patterns.md`, `browser-testing-with-devtools`)
- [ ] File follows the same frontmatter format as `src/skills/pio/SKILL.md`

## Risks and Edge Cases

- **Temptation to copy-paste from draft:** The draft at `docs/tdd-skill-draft.md` is full of TypeScript/Jest code. Resist copying it verbatim — rewrite every example into pseudocode.
- **Scope creep:** Step 2 covers the remaining sections (Writing Good Tests, Assertion Patterns, Anti-Patterns, etc.). Do not include those here — they're specified separately to keep each step focused.
- **"Pseudocode" ambiguity:** Pseudocode should be readable and illustrative but must not require knowledge of a specific language or framework to understand. If reading an example requires knowing Jest's `expect().toBe()`, it's too specific.
- **Browser Testing mention in "When to Use":** The draft references Chrome DevTools MCP in the "When to Use" section. Either generalize this reference or omit it entirely — the Browser Testing section (with tool-agnostic discussion) belongs in Step 2.
