# Tests: Add test-responsibility boundary guidance to create-plan prompt

This step modifies a markdown prompt file (`src/prompts/create-plan.md`), not TypeScript source code. Traditional unit tests are not applicable — verification is through programmatic content checks against the modified file.

The project uses Vitest (`npm run test`) but existing tests target TypeScript modules in `__tests__/`. No existing tests verify prompt (`.md`) file content.

## Programmatic Verification

### Prohibition statement exists

- **What:** The prompt contains an explicit statement prohibiting dedicated "write tests" or "add unit tests" plan steps, with a reference to `evolve-plan` and `TEST.md`
- **How:** `grep -c "must not.*create.*step.*test\|must not.*dedicated.*step.*test" src/prompts/create-plan.md` (should return ≥ 1) AND `grep -ci "evolve.plan" src/prompts/create-plan.md` (should return ≥ 1) AND `grep -ci "TEST.md" src/prompts/create-plan.md` (should return ≥ 1)
- **Expected result:** All three grep commands return a count ≥ 1

### Integration-test exception exists

- **What:** The prompt includes an exception allowing integration verification steps that span multiple plan steps
- **How:** `grep -ci "integration.*step\|integration.*verification" src/prompts/create-plan.md` (should return ≥ 1) AND `grep -ci "span.*multiple.*step\|cross-module\|end-to-end" src/prompts/create-plan.md` (should return ≥ 1)
- **Expected result:** Both grep commands return a count ≥ 1

### Good vs bad examples present

- **What:** The prompt contains concrete examples distinguishing good acceptance criteria from bad test-planning language
- **How:** `grep -i "good:" src/prompts/create-plan.md | wc -l` (should return ≥ 2) AND `grep -i "bad:" src/prompts/create-plan.md | wc -l` (should return ≥ 1)
- **Expected result:** At least 2 "Good:" examples and at least 1 "Bad:" example found

### Ambiguous phrase removed or replaced

- **What:** The phrase "don't write tests yourself" no longer appears in the prompt (or has been replaced with unambiguous language)
- **How:** `grep -c "don't write tests yourself" src/prompts/create-plan.md`
- **Expected result:** Returns 0 (phrase is gone)

### No other files modified

- **What:** Only `src/prompts/create-plan.md` was changed
- **How:** `git diff --name-only HEAD` (or compare against known file list: `ls src/capabilities/*.ts src/prompts/*.md`)
- **Expected result:** Output contains only `src/prompts/create-plan.md`

### TypeScript still passes type checking

- **What:** The change does not introduce any structural issues that would affect the build
- **How:** `npm run check`
- **Expected result:** Exit code 0, no errors

## Manual Verification

### Prompt readability and coherence

- **What:** The modified Guidelines section reads naturally and the new guideline fits with surrounding guidelines in tone and structure
- **How:** Open `src/prompts/create-plan.md` in an editor. Navigate to the Guidelines section. Read the acceptance-criteria paragraph(s). Verify: (1) the prohibition is stated clearly, (2) the integration exception is nearby but distinct, (3) examples are formatted consistently with backticks, (4) no other sections were accidentally modified

### Example quality check

- **What:** The "Good:" and "Bad:" examples are concrete, actionable, and clearly distinguishable
- **How:** Read each example. Verify: (1) Good examples describe programmatic checks or verifiable facts, (2) Bad examples reference test-planning language that belongs to evolve-plan/execute-task

## Test Order

1. Programmatic verification (all grep-based checks) — fast, deterministic
2. `npm run check` — validates TypeScript integrity is unaffected
3. Manual verification — subjective quality check of the final prompt
