# Task: Complete SKILL.md with remaining sections

Append the second half of the TDD skill file — Writing Good Tests, Assertion Patterns table, Anti-Patterns, Browser Testing, Running Tests, Common Rationalizations, Red Flags, and Verification Checklist — all in pseudocode.

## Context

Step 1 created `src/skills/test-driven-development/SKILL.md` with the foundational sections (Overview through Decision Guide) using pseudocode examples. The file ends after the Decision Guide section. Source material for the remaining content exists at `docs/tdd-skill-draft.md` but uses TypeScript/Jest syntax throughout. This step appends the remaining sections, generalizing all examples to pseudocode consistent with Step 1's style.

## What to Build

Append the following sections to the existing `src/skills/test-driven-development/SKILL.md` file. The file must read coherently as a single skill document — no duplicate headings, no content overlap with Step 1's sections.

### Code Components

#### Writing Good Tests Section

A major section with six subsections, each explaining a test-writing principle with pseudocode examples:

- **Test State, Not Interactions** — Assert on outcomes, not internal method calls. Show a good (state-based) vs bad (interaction-based) example in pseudocode.
- **DAMP Over DRY in Tests** — Tests should be Descriptive And Meaningful Phrases. Duplication is acceptable when it makes each test independently readable. Show a DAMP vs over-DRY comparison.
- **Prefer Real Implementations Over Mocks** — Preference ordering: real > fake > stub > mock. Explain when to use mocks (slow, non-deterministic, side-effectful dependencies). Show the preference hierarchy visually.
- **Use the Arrange-Act-Assert Pattern** — Structure tests with clear Arrange / Act / Assert phases. Show a pseudocode example with labeled sections.
- **One Assertion Per Concept** — Each test verifies one behavior. Show good (separate tests) vs bad (multiple assertions in one test).
- **Name Tests Descriptively** — Test names should read like specifications. Show descriptive vs vague name comparisons.

All examples must use the same pseudocode style established in Step 1: `test "..."`, `assert x equals y`, `function` keyword, generic constructs — no `describe`, `it`, `expect`, or any framework-specific syntax.

#### Assertion Patterns (Language-Agnostic) Reference Table

A new section not present in the draft. A markdown table mapping common assertion patterns to pseudocode descriptions and notes about how different ecosystems express them:

| Pattern | Pseudocode | Notes |
|---------|-----------|-------|
| Equality | `assert actual equals expected` | Exact match; most frameworks have a dedicated matcher |
| Inequality | `assert actual not_equals expected` | Negative assertion |
| Truthiness | `assert value is truthy` / `assert value is falsy` | Language-dependent truth tables |
| Null / Empty | `assert value is null` / `assert collection is empty` | Distinct from false/zero in typed languages |
| Type check | `assert value is instance_of(Type)` | Verifies runtime type or structural conformance |
| Exception | `expect_call to raise ErrorType` | Verify expected failure modes |
| Containment | `assert container contains item` | Works for strings, arrays, maps, sets |
| Approximate | `assert actual approximately_equals expected (within delta)` | Floating-point comparison with tolerance |

At minimum, cover all 8 patterns listed. The pseudocode column must not use any single language's syntax exclusively.

#### Test Anti-Patterns Table

Keep the table from the draft as-is — it's already language-agnostic. Six anti-patterns: Testing implementation details, Flaky tests, Testing framework code, Snapshot abuse, No test isolation, Mocking everything.

#### Browser Testing Section

Generalize the draft's "Browser Testing with DevTools" section:

- Remove the specific tool name from the section heading — use a generic title like "Browser Testing"
- Keep the debugging workflow (Reproduce → Inspect → Diagnose → Fix → Verify) as-is — it's already tool-agnostic
- Keep the "What to Check" table as-is — it references DevTools concepts but they're universal
- Generalize tool references: mention Chrome DevTools MCP, Playwright, Puppeteer, or similar tools as *available options* without tying the skill to any single one
- Keep the Security Boundaries subsection as-is — it's already generic and important
- **Remove** the reference to `browser-testing-with-devtools` (dead link from the draft)
- **Remove** the "When to Use Subagents for Testing" subsection — it was in the draft but is not listed in GOAL.md's To-Be State

#### Running Tests Section

A brief section that mentions multiple ecosystems' test commands as examples. Something like:

- Run your project's test suite after every change
- Examples: `npm test` (JS/TS), `pytest` (Python), `cargo test` (Rust), `go test` (Go), `mvn test` (Java)
- Note about not repeating test runs on unchanged code

#### Common Rationalizations Table

Keep the table from the draft as-is — already language-agnostic. Seven rationalizations with reality checks.

#### Red Flags List

Keep the list from the draft as-is — already language-agnostic. Eight red flags indicating problematic testing behavior.

#### Verification Checklist

Generalize from the draft's "Verification" section:

- Replace `npm test` with "run your project's test suite"
- Keep all other checklist items as-is (they're already generic)

### Approach and Decisions

- **Append, don't rewrite.** Step 1's content is approved — only append new sections after the Decision Guide. Do not modify existing content.
- **Pseudocode consistency.** Follow Step 1's pseudocode style: `test "..."` blocks, `assert x equals y`, `function` keyword, generic constructs like `now()`, `generateId()`. The review noted that `#` for comments and `{}` for objects slightly lean toward Python/JS — use the same convention for consistency with Step 1 (matching the existing file is more important than achieving perfect neutrality).
- **Source material.** The draft at `docs/tdd-skill-draft.md` provides all the content structure. Rewrite examples from TypeScript/Jest to pseudocode. Do not copy-paste draft code directly.
- **Remove dead references.** Ensure `references/testing-patterns.md` and `browser-testing-with-devtools` do not appear anywhere in the file.
- **Markdown formatting.** Follow the existing document's heading hierarchy: `##` for major sections, `###` for subsections.

## Dependencies

- **Step 1 must be completed** — the SKILL.md file with foundational sections must already exist and be approved

## Files Affected

- `src/skills/test-driven-development/SKILL.md` — modified: append remaining sections (Writing Good Tests, Assertion Patterns, Anti-Patterns, Browser Testing, Running Tests, Common Rationalizations, Red Flags, Verification Checklist)

## Acceptance Criteria

- [ ] `src/skills/test-driven-development/SKILL.md` contains all sections listed in GOAL.md's "To-Be State": Writing Good Tests subsections, Assertion Patterns table, Test Anti-Patterns, Browser Testing, Running Tests, Common Rationalizations, Red Flags, Verification Checklist
- [ ] The "Assertion Patterns" reference table maps at least 7 common patterns (equality, inequality, truthiness, null/empty, type check, exception, containment) using pseudocode descriptions — no single-language syntax as the only representation
- [ ] Browser Testing section mentions Chrome DevTools MCP as one available option but is not tied to it exclusively
- [ ] Verification Checklist says "run your project's test suite" rather than `npm test`
- [ ] No dead references remain (`references/testing-patterns.md`, `browser-testing-with-devtools`)
- [ ] The complete file reads coherently as a single skill document

## Risks and Edge Cases

- **Content overlap risk:** Ensure no duplication between Step 1's existing content and the appended sections. The Decision Guide is the last section from Step 1; new content starts immediately after it.
- **Pseudocode consistency:** The review of Step 1 noted minor language-leaning syntax (`#` comments, `{}` objects). Maintain the same style for consistency — don't introduce a different pseudocode dialect mid-file.
- **Assertion Patterns originality:** This table is new (not in the draft). Ensure it's substantive and useful, not just a trivial mapping.
- **Dead reference removal:** The draft contains references to `references/testing-patterns.md` and `browser-testing-with-devtools`. These must be stripped — do not include them in the appended content.
- **Section ordering:** Follow GOAL.md's specified order for sections within Writing Good Tests: State over Interactions → DAMP over DRY → Prefer Real Implementations → Arrange-Act-Assert → One Assertion Per Concept → Descriptive Names.
