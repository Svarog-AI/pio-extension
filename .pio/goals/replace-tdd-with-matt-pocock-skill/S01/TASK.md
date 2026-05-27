---
skills:
  mandatory:
    - pio-git
---

# Task: Rename all references to the new skill name

Rename `test-driven-development` to `tdd` in all capability config `mandatory` arrays, prompt examples, and test data. Pure string replacements — no content changes or logic modifications.

## Context

Two TDD-related skills currently exist: `src/skills/test-driven-development/` (our old skill) and `src/skills/tdd/` (Matt Pocock's new skill, already copied). All code references still point to the old name. This step performs a mechanical rename so all references target `tdd` instead of `test-driven-development`. The old directory itself is not deleted until Step 3.

## What to Build

Replace every occurrence of the string `"test-driven-development"` with `"tdd"` across TypeScript source files, prompt markdown files, and test files. This is a pure find-and-replace operation — no logic changes, no refactoring, no content modifications beyond the skill name string itself.

**Important distinction for `src/prompts/execute-task.md`:** Line 92 contains `Follow the \`test-driven-development\` skill for test structure guidance`. Rename only the skill name to `tdd` — do NOT refactor the surrounding TDD methodology patterns (RED→GREEN, Arrange-Act-Assert, etc.). That content refactoring belongs in Step 2.

### Replacement Map

Every occurrence of `test-driven-development` → `tdd` in the following files:

| File | Line(s) | Context |
|------|---------|---------|
| `src/capabilities/execute-task.ts` | 52 | `mandatory: ["test-driven-development", "pio-git"]` |
| `src/capabilities/review-task.ts` | 135 | `mandatory: ["test-driven-development"]` |
| `src/capabilities/execute-plan.ts` | 15 | `mandatory: ["test-driven-development", "pio-git"]` |
| `src/capabilities/test-skills-cap.ts` | 11 | `mandatory: ["test-driven-development", "pio-git"]` |
| `src/prompts/evolve-plan.md` | 98 | Example in skills.mandatory description |
| `src/prompts/evolve-plan.md` | 113 | Example TASK.md frontmatter template |
| `src/prompts/execute-task.md` | 92 | Skill name reference only — do NOT refactor surrounding content |
| `src/index.test.ts` | 106 | Discovery assertion: `toContain("test-driven-development")` → `toContain("tdd")` |
| `src/frontmatter-schemas.test.ts` | 143, 156 | Test data and assertion (2 occurrences) |
| `src/types.test.ts` | 45, 52, 136, 141 | Test data and assertions (4 occurrences) |
| `src/capability-config.test.ts` | 831 | Expected skills assertion |
| `src/fs-utils.test.ts` | 422, 429 | Base capability skills array and assertion (2 occurrences) |

**Total: 17 string replacements across 10 files.**

### Approach and Decisions

- Use exact string replacement — the skill name appears as a plain string literal or in markdown backticks. No regex or complex matching needed.
- Do not modify any test logic, only the string values inside assertions and test data.
- The `src/skills/test-driven-development/SKILL.md` file itself is NOT modified in this step — it will be deleted in Step 3 along with its directory.
- After all replacements, verify with: `grep -rn "test-driven-development" src/ --include="*.ts" --include="*.md"` — the only remaining hit should be inside `src/skills/test-driven-development/SKILL.md` itself.

## Skills

No additional skills recommended beyond the mandatory pio skill and pio-git (for committing changes).

## Dependencies

None. This is Step 1 with no dependencies on other plan steps.

## Files Affected

- `src/capabilities/execute-task.ts` — modified: `"test-driven-development"` → `"tdd"` in `skills.mandatory`
- `src/capabilities/review-task.ts` — modified: same rename
- `src/capabilities/execute-plan.ts` — modified: same rename
- `src/capabilities/test-skills-cap.ts` — modified: same rename
- `src/prompts/evolve-plan.md` — modified: same rename in 2 example occurrences
- `src/prompts/execute-task.md` — modified: skill name reference only (line 92)
- `src/index.test.ts` — modified: discovery assertion string
- `src/frontmatter-schemas.test.ts` — modified: test data frontmatter and assertion strings (2 occurrences)
- `src/types.test.ts` — modified: test data and assertion strings (4 occurrences)
- `src/capability-config.test.ts` — modified: expected skill name assertion
- `src/fs-utils.test.ts` — modified: base capability skills array and assertion (2 occurrences)

## Acceptance Criteria

- `grep -rn "test-driven-development" src/ --include="*.ts" --include="*.md"` returns only hits inside `src/skills/test-driven-development/SKILL.md` (the old skill directory itself, not deleted yet)
- All 17 replacements have been applied across the 10 files listed above
- `npm run check` (tsc --noEmit) reports no errors
- Full test suite passes: `npx vitest run` exits with code 0

## Risks and Edge Cases

- **Test data vs. test logic:** Some test files use `"test-driven-development"` as fixture data that validates against capability configs. When you rename the string in fixture data, ensure the assertion expectations match (e.g., `types.test.ts` line 52 asserts `toEqual(["test-driven-development"])` — both the fixture AND the assertion must be renamed).
- **`index.test.ts` discovers skills from filesystem:** The test checks that `test-driven-development` appears in discovered skill paths. After renaming to `tdd`, the filesystem still contains BOTH directories (`src/skills/tdd/` and `src/skills/test-driven-development/`). The test should now check for `"tdd"` instead. Since the old directory still exists at this point, the grep would find both — but we're checking that our code references use `tdd`, not that only one directory exists (that's Step 3's job).
- **`execute-task.md` has dual responsibilities:** Step 1 renames the skill reference; Step 2 refactors the TDD methodology content. Do NOT touch anything beyond the skill name string in this step. If you accidentally remove RED→GREEN→REFACTOR or Arrange-Act-Assert mentions, Step 2 won't have the expected content to refactor.
