# Prompt verification should be programmatic checks in TEST.md, not unit tests in .test.ts files

## Problem

Prompt files (`src/prompts/*.md`) are markdown documents injected as system prompts into sub-sessions. They have no executable behavior — testing them in `.test.ts` files produces brittle content checks (`toContain`, regex matches) that verify nothing meaningful about runtime behavior.

## Current anti-pattern

`src/index.test.ts` previously contained test blocks for `project-context.md` and `finalize-goal.md`:

```typescript
describe("finalize-goal.md prompt", () => {
  it("references DECISIONS.md", () => {
    const content = fs.readFileSync(promptPath, "utf-8");
    expect(content).toContain("DECISIONS.md");
  });
});
```

These tests:
- Read markdown files and assert string presence
- Break when prompt wording changes but intent is preserved
- Provide false confidence — they pass even if the prompt is semantically wrong
- Don't belong in a unit test suite (not testing code behavior)

## Correct approach

Prompt verification belongs in **TEST.md programmatic checks**, not `.test.ts` files:

### In TEST.md (correct):
```markdown
## Programmatic Verification

- **What:** Prompt file exists at correct path
  - **How:** `test -f src/prompts/finalize-goal.md && wc -l src/prompts/finalize-goal.md`
  - **Expected result:** File exists, line count > 10

- **What:** Prompt references pio-project-knowledge skill
  - **How:** `grep -c 'pio-project-knowledge' src/prompts/finalize-goal.md`
  - **Expected result:** Count >= 1

## Manual Verification

- **What:** Prompt follows structural conventions
  - **How:** Open and verify: agent identity, Setup, Process steps, Guidelines
```

### In `.test.ts` (should NOT exist):
No tests for prompt file content. Period.

## Guideline

**Unit tests verify code behavior.** Prompt files are configuration/content, not code. Verify them with:

1. **File existence checks** — `test -f` in TEST.md programmatic verification
2. **Content checks** — `grep`, `wc -l` in TEST.md programmatic verification
3. **Manual review** — human reads the prompt to verify structure and completeness

Never write `.test.ts` tests that `fs.readFileSync()` a `.md` file and assert string presence. This is testing file contents, not code behavior.

## Scope

Apply to all prompt files: `src/prompts/*.md` and skill files: `src/skills/*/SKILL.md`.

## Category

improvement

## Context

Files: `src/index.test.ts` (previously contained prompt content tests, now removed). Applies to all `src/prompts/*.md` files. Related to evolve-plan TEST.md generation — the evolve-plan agent should generate programmatic checks for prompt files, not unit test cases.
