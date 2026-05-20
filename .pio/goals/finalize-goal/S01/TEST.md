# Tests: Create pio-project-knowledge skill

This step produces a single markdown file (`src/skills/pio-project-knowledge/SKILL.md`). There is no TypeScript code to unit test. Verification relies on programmatic checks (file existence, content presence) and manual review of documentation quality.

## Programmatic Verification

### File existence and format

- **What:** SKILL.md exists at the correct path
- **How:** `test -f src/skills/pio-project-knowledge/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

- **What:** YAML frontmatter contains `name: pio-project-knowledge`
- **How:** `head -5 src/skills/pio-project-knowledge/SKILL.md | grep 'name: pio-project-knowledge'`
- **Expected result:** Match found (exit code 0)

- **What:** YAML frontmatter contains a non-empty `description` field
- **How:** `head -10 src/skills/pio-project-knowledge/SKILL.md | grep '^description:'`
- **Expected result:** Match found with non-empty value

### All 7 PROJECT files documented

For each of the 7 canonical paths, verify they appear in the skill:

- **What:** OVERVIEW.md is referenced with canonical path `.pio/PROJECT/OVERVIEW.md`
- **How:** `grep '\.pio/PROJECT/OVERVIEW\.md' src/skills/pio-project-knowledge/SKILL.md`
- **Expected result:** Match found (exit code 0)

- **What:** DEVELOPMENT.md is referenced with canonical path `.pio/PROJECT/DEVELOPMENT.md`
- **How:** `grep '\.pio/PROJECT/DEVELOPMENT\.md' src/skills/pio-project-knowledge/SKILL.md`
- **Expected result:** Match found (exit code 0)

- **What:** CONVENTIONS.md is referenced with canonical path `.pio/PROJECT/CONVENTIONS.md`
- **How:** `grep '\.pio/PROJECT/CONVENTIONS\.md' src/skills/pio-project-knowledge/SKILL.md`
- **Expected result:** Match found (exit code 0)

- **What:** GIT.md is referenced with canonical path `.pio/PROJECT/GIT.md`
- **How:** `grep '\.pio/PROJECT/GIT\.md' src/skills/pio-project-knowledge/SKILL.md`
- **Expected result:** Match found (exit code 0)

- **What:** ARCHITECTURE.md is referenced with canonical path `.pio/PROJECT/ARCHITECTURE.md`
- **How:** `grep '\.pio/PROJECT/ARCHITECTURE\.md' src/skills/pio-project-knowledge/SKILL.md`
- **Expected result:** Match found (exit code 0)

- **What:** DEPENDENCIES.md is referenced with canonical path `.pio/PROJECT/DEPENDENCIES.md`
- **How:** `grep '\.pio/PROJECT/DEPENDENCIES\.md' src/skills/pio-project-knowledge/SKILL.md`
- **Expected result:** Match found (exit code 0)

- **What:** GLOSSARY.md is referenced with canonical path `.pio/PROJECT/GLOSSARY.md`
- **How:** `grep '\.pio/PROJECT/GLOSSARY\.md' src/skills/pio-project-knowledge/SKILL.md`
- **Expected result:** Match found (exit code 0)

### Update Rules section exists and covers key categories

- **What:** An "Update Rules" or equivalent section exists in the skill
- **How:** `grep -i 'update rule' src/skills/pio-project-knowledge/SKILL.md`
- **Expected result:** At least one match (exit code 0)

- **What:** Update rules map decision categories to specific PROJECT files (not just file names)
- **How:** `grep -cE '(OVERVIEW|DEVELOPMENT|CONVENTIONS|GIT|ARCHITECTURE|DEPENDENCIES|GLOSSARY)\.md' src/skills/pio-project-knowledge/SKILL.md`
- **Expected result:** Count ≥ 7 (all files referenced in update rules context)

### TypeScript compilation unaffected

- **What:** Creating the skill directory does not affect type checking
- **How:** `npx tsc --noEmit`
- **Expected result:** Exit code 0, no errors

## Manual Verification

- **What:** Section structure descriptions match actual PROJECT file templates from `src/prompts/project-context.md` Phase 2
- **How:** Compare headings listed in the skill against Phase 2 output templates in `src/prompts/project-context.md`. Verify each of the 7 files has documented sections that align with what the project-context agent produces.

- **What:** Update rules are specific and actionable (not vague like "anything about architecture")
- **How:** Read the update rules section. Each rule should state: (1) a decision category, (2) a target PROJECT file, and optionally (3) a specific section within that file.

- **What:** YAML frontmatter format matches existing skills (e.g., `src/skills/pio/SKILL.md`)
- **How:** Compare the first 5 lines of both SKILL.md files. Frontmatter should use the same delimiter style (`---`), field ordering, and quote conventions.

## Test Order

1. File existence and format checks (fastest — filesystem only)
2. Content presence checks (grep/string matching)
3. TypeScript compilation check (ensures no regressions)
4. Manual review of documentation quality
