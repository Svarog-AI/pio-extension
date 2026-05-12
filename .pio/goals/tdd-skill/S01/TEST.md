# Tests: Write core SKILL.md content

**No test runner configured.** The project relies on `npm run check` (`tsc --noEmit`) for type checking and manual verification for content. Since the output is a `.md` file, TypeScript compilation will not validate its contents. All tests below are programmatic or manual checks.

## Programmatic Verification

Each test specifies a command to run and the expected result.

### File existence

- **What:** `src/skills/test-driven-development/SKILL.md` exists
- **How:** `test -f src/skills/test-driven-development/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### YAML frontmatter — name field

- **What:** Frontmatter contains `name: test-driven-development`
- **How:** `grep -q '^name: test-driven-development$' src/skills/test-driven-development/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### YAML frontmatter — description field

- **What:** Frontmatter contains a `description:` line with non-empty content
- **How:** `grep -q '^description: .\+' src/skills/test-driven-development/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### YAML frontmatter delimiters

- **What:** File starts with `---` and has a closing `---` before any markdown content
- **How:** `head -1 src/skills/test-driven-development/SKILL.md | grep -q '^---$' && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### Required sections present

For each required section, verify the heading exists:

- **Overview:** `grep -q '## Overview' src/skills/test-driven-development/SKILL.md && echo PASS || echo FAIL`
- **When to Use:** `grep -q '## When to Use' src/skills/test-driven-development/SKILL.md && echo PASS || echo FAIL`
- **TDD Cycle:** `grep -qi 'tdd.*cycle\|red.*green.*refactor' src/skills/test-driven-development/SKILL.md && echo PASS || echo FAIL`
- **Prove-It Pattern:** `grep -qi 'prove.*it\|bug fix' src/skills/test-driven-development/SKILL.md && echo PASS || echo FAIL`
- **Test Pyramid:** `grep -qi 'test pyramid\|pyramid' src/skills/test-driven-development/SKILL.md && echo PASS || echo FAIL`
- **Beyonce Rule:** `grep -qi 'beyonce' src/skills/test-driven-development/SKILL.md && echo PASS || echo FAIL`
- **Test Sizes:** `grep -qi 'test.*size\|small.*medium.*large' src/skills/test-driven-development/SKILL.md && echo PASS || echo FAIL`
- **Decision Guide:** `grep -qi 'decision guide\|decision.*tree' src/skills/test-driven-development/SKILL.md && echo PASS || echo FAIL`

### No language-specific code (TypeScript/Jest)

- **What:** File does not contain TypeScript-specific syntax as the only example type
- **How:** `grep -c 'describe\|it\(.*=>\|expect(.*toBe\|\.toThrow\|async function\|Promise<\|: Promise' src/skills/test-driven-development/SKILL.md` — count should be **0**
- **Expected result:** `0` (no matches for Jest/TypeScript-specific patterns)

### No Python-specific syntax as the only example type

- **What:** File does not contain Python-specific syntax as the only example type
- **How:** `grep -c 'def \|pytest\|assertEqual\|@pytest' src/skills/test-driven-development/SKILL.md` — count should be **0**
- **Expected result:** `0`

### No Rust-specific syntax as the only example type

- **What:** File does not contain Rust-specific syntax as the only example type
- **How:** `grep -c 'fn \|cargo test\|#\[test\]\|assert_eq!' src/skills/test-driven-development/SKILL.md` — count should be **0**
- **Expected result:** `0`

### No dead references

- **What:** File does not reference non-existent files
- **How:** `grep -c 'references/testing-patterns\.md\|browser-testing-with-devtools' src/skills/test-driven-development/SKILL.md` — count should be **0**
- **Expected result:** `0` (no dead references)

## Manual Verification

### Content quality review

- **What:** Each section contains meaningful content derived from the draft but generalized to pseudocode
- **How:** Read the file and verify:
  - Overview explains TDD clearly without framework references
  - When to Use lists applicable scenarios and exclusions
  - TDD Cycle shows RED → GREEN → REFACTOR with pseudocode examples for each phase
  - Prove-It Pattern describes the bug-fix workflow with a pseudocode example
  - Test Pyramid includes an ASCII diagram and the Beyonce Rule
  - Test Sizes table classifies Small / Medium / Large tests with language-agnostic examples
  - Decision Guide provides actionable guidance for choosing test types

### Pseudocode quality

- **What:** Code examples are genuinely language-agnostic
- **How:** Read each code block and ask: "Would a Python developer, Rust developer, and Java developer all understand this example without mental translation?" If any example requires knowledge of a specific framework (Jest `describe/it/expect`, pytest decorators, Rust macros), it needs to be rewritten.

### Frontmatter format consistency

- **What:** Frontmatter matches the convention of `src/skills/pio/SKILL.md`
- **How:** Compare `src/skills/test-driven-development/SKILL.md` frontmatter against `src/skills/pio/SKILL.md`. Both should use YAML between `---` delimiters with `name` and `description` fields.

## Test Order

Run in this priority:

1. File existence check
2. YAML frontmatter checks (name, description, delimiters)
3. Required sections present (all grep checks)
4. No language-specific code checks (TypeScript, Python, Rust)
5. No dead references
6. Manual content quality review
7. Manual pseudocode quality review
8. Manual frontmatter format comparison
