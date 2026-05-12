# Tests: Complete SKILL.md with remaining sections

**Note:** No test runner is configured in this project. The only programmatic verification available is `npm run check` (`tsc --noEmit`) and shell-based content checks (grep, file existence). All tests below use programmatic or manual verification.

## Programmatic Verification

### File and Section Existence

For each, the command should return a non-zero match count (or 0 exit code for grep):

1. **Writing Good Tests section exists**
   - How: `grep -c "## Writing Good Tests" src/skills/test-driven-development/SKILL.md`
   - Expected: `1` or greater

2. **Test State, Not Interactions subsection exists**
   - How: `grep -c "Test State" src/skills/test-driven-development/SKILL.md` (or similar heading match)
   - Expected: `1` or greater

3. **DAMP Over DRY subsection exists**
   - How: `grep -ci "DAMP" src/skills/test-driven-development/SKILL.md`
   - Expected: `1` or greater

4. **Prefer Real Implementations subsection exists**
   - How: `grep -ci "Prefer.*Real\|real implementation" src/skills/test-driven-development/SKILL.md`
   - Expected: `1` or greater

5. **Arrange-Act-Assert subsection exists**
   - How: `grep -ci "Arrange.*Act.*Assert\|arrange-act-assert" src/skills/test-driven-development/SKILL.md`
   - Expected: `1` or greater

6. **One Assertion Per Concept subsection exists**
   - How: `grep -ci "one assertion" src/skills/test-driven-development/SKILL.md`
   - Expected: `1` or greater

7. **Descriptive Names subsection exists**
   - How: `grep -ci "descriptive.*name\|name.*test.*descript" src/skills/test-driven-development/SKILL.md`
   - Expected: `1` or greater

8. **Assertion Patterns table section exists**
   - How: `grep -ci "assertion pattern" src/skills/test-driven-development/SKILL.md`
   - Expected: `1` or greater

9. **Test Anti-Patterns section exists**
   - How: `grep -ci "anti-pattern" src/skills/test-driven-development/SKILL.md`
   - Expected: `1` or greater

10. **Browser Testing section exists (generalized heading)**
    - How: `grep -ci "browser test" src/skills/test-driven-development/SKILL.md`
    - Expected: `1` or greater

11. **Running Tests section exists**
    - How: `grep -ci "running test\|run.*test.*suite" src/skills/test-driven-development/SKILL.md`
    - Expected: `1` or greater

12. **Common Rationalizations section exists**
    - How: `grep -ci "rationalization" src/skills/test-driven-development/SKILL.md`
    - Expected: `1` or greater

13. **Red Flags section exists**
    - How: `grep -ci "red flag" src/skills/test-driven-development/SKILL.md`
    - Expected: `1` or greater

14. **Verification Checklist section exists**
    - How: `grep -ci "verif" src/skills/test-driven-development/SKILL.md`
    - Expected: `1` or greater

### Assertion Patterns Table Completeness

Count the number of assertion patterns in the table (rows with pipe-delimited content after the header):

15. **At least 7 assertion patterns present**
    - How: Extract lines between "Assertion Patterns" heading and next `##` heading, count pipe-separated rows (excluding header/separators). Or simpler: grep for key pattern names:
    - How: `grep -ci "equality" src/skills/test-driven-development/SKILL.md && grep -ci "inequality\|not_equal\|not equal" src/skills/test-driven-development/SKILL.md && grep -ci "truthy\|falsy" src/skills/test-driven-development/SKILL.md && grep -ci "null\|empty" src/skills/test-driven-development/SKILL.md && grep -ci "type.*check\|instance_of\|is instance" src/skills/test-driven-development/SKILL.md && grep -ci "exception\|raise\|throw" src/skills/test-driven-development/SKILL.md && grep -ci "contain" src/skills/test-driven-development/SKILL.md`
    - Expected: All sub-checks return non-zero matches

### Language-Agnostic Verification

16. **No Jest-specific syntax in appended sections**
    - How: Check the portion of the file after Step 1's content (after "Decision Guide") for `describe(`, `it(`, `expect(`, `.toBe(`, `.toThrow(`
    - How: Get line number of "Decision Guide" with `grep -n "Decision Guide" src/skills/test-driven-development/SKILL.md`, then run `tail -n +LINE src/skills/test-driven-development/SKILL.md | grep -cE "describe\(|it\(|expect\(|\.toBe\(|\.toThrow\("`
    - Expected: `0`

17. **No TypeScript-specific syntax in appended sections** (same approach)
    - How: After Decision Guide line, check for `const `, `await `, `Promise<`, `import `, `export `, `.ts`
    - Expected: `0` matches for framework-specific patterns (`describe(`, `it(`, `expect(`)

### Dead Reference Removal

18. **No reference to `references/testing-patterns.md`**
    - How: `grep -c "references/testing-patterns.md" src/skills/test-driven-development/SKILL.md`
    - Expected: `0`

19. **No reference to `browser-testing-with-devtools`**
    - How: `grep -c "browser-testing-with-devtools" src/skills/test-driven-development/SKILL.md`
    - Expected: `0`

### Browser Testing Generalization

20. **Browser Testing mentions Chrome DevTools MCP as one option (not exclusively)**
    - How: `grep -ci "chrome devtools\|chromium" src/skills/test-driven-development/SKILL.md`
    - Expected: `1` or greater (mentioned but not the only tool)

21. **Browser Testing heading is generic (not DevTools-specific)**
    - How: `grep "^## Browser Test" src/skills/test-driven-development/SKILL.md` should NOT contain "DevTools" or "MCP" in the heading itself
    - Expected: Heading contains "Browser Testing" without tool-specific names

### Verification Checklist Generalization

22. **Verification uses generic test command language**
    - How: Check that the Verification section does NOT contain a bare `npm test` as the primary instruction
    - How: `grep -A 10 -i "verif" src/skills/test-driven-development/SKILL.md | grep -c "npm test"` — should be 0 or only appear as an example among others
    - Expected: The checklist says "run your project's test suite" or similar generic language, not exclusively `npm test`

### Document Coherence

23. **No duplicate major headings (Step 1 content was not modified)**
    - How: `grep "^## " src/skills/test-driven-development/SKILL.md | sort | uniq -d`
    - Expected: Empty output (no duplicates)

24. **npm run check passes**
    - How: `npm run check` (tsc --noEmit)
    - Expected: Exit code 0, no TypeScript errors

## Manual Verification

### Content Quality Review

Read the complete file and verify:

1. **All Writing Good Tests subsections have pseudocode examples** — Each of the six subsections should contain at least one code example using the same pseudocode style as Step 1 (`test "..."`, `assert x equals y`)
2. **Assertion Patterns table is substantive** — The table should have meaningful descriptions, not trivial placeholders. Pseudocode column should use generic syntax
3. **Browser Testing section has security boundaries** — The security warnings about untrusted browser data must be present
4. **Common Rationalizations has 7+ entries** — Match the draft's comprehensiveness
5. **Red Flags has 8+ entries** — Match the draft's comprehensiveness
6. **The file reads as one coherent document** — No jarring transitions between Step 1 and Step 2 content; consistent tone, formatting, and pseudocode style throughout

### Section Order Verification

Verify sections appear in the order specified by GOAL.md:
Writing Good Tests (with subsections: State → DAMP → Real Impls → Arrange-Act-Assert → One Assertion → Descriptive Names) → Assertion Patterns → Anti-Patterns → Browser Testing → Running Tests → Common Rationalizations → Red Flags → Verification Checklist

## Test Order

1. Run all programmatic checks (file existence, section grep, dead reference removal, language-agnostic verification)
2. Run `npm run check` to confirm no TypeScript errors
3. Perform manual content quality review
4. Verify section ordering
