# Task: Update `execute-task.md` with TDD skill reference

Add an explicit reference to the `test-driven-development` skill near the top of the `execute-task.md` prompt and generalize language-specific test runner mentions.

## Context

The `test-driven-development` skill has been created (Steps 1–2) and registered in `src/index.ts` (Step 3). The `execute-task` capability is the primary consumer of this skill — it implements features using a test-first workflow (RED → GREEN → REFACTOR). Currently, `src/prompts/execute-task.md` mentions "Jest, Vitest" by name in Step 4 but never references the TDD skill itself. The prompt needs to explicitly direct agents to follow the TDD skill's guidance.

## What to Build

Modify `src/prompts/execute-task.md` with two changes:

### 1. Add a TDD skill reference near the top

Insert a short paragraph or callout after the introduction (before "## Setup") that instructs the Execute Task Agent to follow the `test-driven-development` skill's guidance when writing tests and implementing features. This should be a concise directive — not a full rewrite of the prompt. The reference should make it clear that the skill is an available resource for TDD best practices.

### 2. Generalize Step 4 ("Write tests first — Red phase")

In Step 4, the current text reads:

> If the project has a test runner (Jest, Vitest, etc.), use it.

Generalize this to be framework-agnostic while still mentioning Jest and Vitest as examples. The language should convey that any appropriate test runner for the project's ecosystem should be used, with specific runners mentioned only as illustrations.

### Approach and Decisions

- Keep the change minimal — only modify what's necessary to add the skill reference and generalize Step 4.
- Place the skill reference before `## Setup` (in the introductory section) so it's visible early.
- The reference should be a single paragraph, not a new section heading.
- Follow the same style as the existing prompt: direct instructional language, markdown formatting consistent with the rest of the file.

## Dependencies

- **Step 1:** SKILL.md core content must exist (completed and approved).
- **Step 2:** SKILL.md remaining sections must exist (completed and approved).
- **Step 3:** Skill must be registered in `src/index.ts` (completed and approved).

## Files Affected

- `src/prompts/execute-task.md` — modified: add TDD skill reference near top, generalize Step 4 test runner mentions

## Acceptance Criteria

- [ ] `src/prompts/execute-task.md` contains a reference to the `test-driven-development` skill near the top of the prompt (before or around Step 1)
- [ ] The reference instructs agents to follow the TDD skill's guidance when writing tests and implementing features
- [ ] Any mentions of specific test runners (Jest, Vitest) in Step 4 are generalized to be framework-agnostic while still mentioning them as examples
- [ ] `npm run check` reports no TypeScript errors

## Risks and Edge Cases

- The prompt is a markdown file — `npm run check` won't validate its content directly, but it confirms no unrelated TypeScript files were broken.
- Ensure the reference is placed naturally — not so early that it breaks the flow, not so late that agents miss it before starting work.
- Don't over-restrict: Step 4 should still allow adding a new test runner if one doesn't exist; the generalization shouldn't change this behavior.
