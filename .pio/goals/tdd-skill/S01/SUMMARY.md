# Summary: Write core SKILL.md content

## Status
COMPLETED

## Files Created
- `src/skills/test-driven-development/SKILL.md` — Core TDD skill content (first half): YAML frontmatter, Overview, When to Use, TDD Cycle (RED → GREEN → REFACTOR), Prove-It Pattern, Test Pyramid (with Beyonce Rule), Test Sizes table, and Decision Guide

## Files Modified
- (none)

## Files Deleted
- (none)

## Decisions Made
- All code examples rewritten as pseudocode using generic constructs (`test "..."`, `assert`, `function`, `now()`) — no language-specific syntax
- Removed Chrome DevTools MCP reference from "When to Use" section (Browser Testing belongs in Step 2)
- Pseudocode uses descriptive assertions like `assert x equals y` and `assert x is a date` instead of framework-specific matchers
- Frontmatter matches `src/skills/pio/SKILL.md` format exactly: YAML between `---` delimiters with `name` and `description` fields only

## Test Coverage
All programmatic verification checks pass:
- File existence: PASS
- YAML frontmatter (name, description, delimiters): PASS
- Required sections (Overview, When to Use, TDD Cycle, Prove-It Pattern, Test Pyramid, Beyonce Rule, Test Sizes, Decision Guide): all PASS
- No TypeScript/Jest patterns (`describe`, `it(...)`, `expect().toBe`, etc.): 0 matches — PASS
- No Python patterns (`def `, `pytest`, `assertEqual`): 0 matches — PASS
- No Rust patterns (`fn `, `cargo test`, `#[test]`, `assert_eq!`): 0 matches — PASS
- No dead references (`references/testing-patterns.md`, `browser-testing-with-devtools`): 0 matches — PASS
- `npm run check` (tsc --noEmit): no errors — PASS
