# Tests: Extract planning methodology into shared skill

This step produces a documentation file (`SKILL.md`) with no TypeScript source code. Verification relies on programmatic content checks and type-checking the overall project (no new types introduced). No unit test file is needed — there is no executable code to test.

## Programmatic Verification

Each check specifies the exact command and expected result.

### File existence

- **What:** `src/skills/pio-planning/SKILL.md` exists as a non-empty file
- **How:** `test -s src/skills/pio-planning/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### YAML frontmatter with name and description

- **What:** The skill has valid YAML frontmatter containing `name: pio-planning` and a non-empty `description`
- **How:** `grep -q '^name: pio-planning' src/skills/pio-planning/SKILL.md && grep -q '^description:' src/skills/pio-planning/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### PLAN.md structure section (totalSteps, frontmatter format)

- **What:** The skill documents the YAML frontmatter with `totalSteps` requirement and that it must equal actual step count
- **How:** `grep -qi 'totalSteps' src/skills/pio-planning/SKILL.md && grep -qi 'frontmatter' src/skills/pio-planning/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### Step heading format documented

- **What:** The skill specifies the step heading format (`### Step N: <Title>`)
- **How:** `grep -qi 'Step.*N' src/skills/pio-planning/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### Acceptance criteria rules present

- **What:** The skill contains acceptance criteria guidelines (mandatory per step, programmatic verification preferred)
- **How:** `grep -qi 'acceptance criteri' src/skills/pio-planning/SKILL.md && grep -qi 'programmatic' src/skills/pio-planning/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### "No dedicated test steps" rule present

- **What:** The skill states that plan steps should not be dedicated to writing unit tests (that's evolve-plan territory)
- **How:** `grep -qi 'unit test' src/skills/pio-planning/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### No-source-code policy documented

- **What:** The skill contains the no-source-code policy (no function bodies, class implementations, multi-line logic blocks)
- **How:** `grep -qi 'function bod\|implementat.*code\|no source code' src/skills/pio-planning/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### Research instructions present

- **What:** The skill contains research/research-phase instructions (read OVERVIEW.md, trace dependencies, identify hidden complexity)
- **How:** `grep -qi 'research\|OVERVIEW\.md\|hidden complexit' src/skills/pio-planning/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### Step ordering principle present

- **What:** The skill states steps must reflect real implementation order and should not require reordering
- **How:** `grep -qi 'order\|depend' src/skills/pio-planning/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### Scope discipline present

- **What:** The skill contains scope rules (stay within GOAL.md scope, no unrelated refactoring)
- **How:** `grep -qi 'scope\|GOAL\.md' src/skills/pio-planning/SKILL.md && echo PASS || echo FAIL`
- **Expected result:** `PASS`

### TypeScript type check passes

- **What:** No new type errors introduced (creating a `.md` file shouldn't affect types, but verify project still compiles)
- **How:** `npx tsc --noEmit`
- **Expected result:** Exit code 0, no errors

## Test Order

Run in this order: file existence → content checks → TypeScript compilation. Content checks are independent and can run in any order among themselves.
