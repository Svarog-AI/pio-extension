# Task: Revise evolve-plan.md to add Unit Tests and Integration Tests to TEST.md template

Update `src/prompts/evolve-plan.md` so the Specification Writer produces TEST.md files with explicit Unit Tests and Integration Tests sections, enabling real test-first implementation.

## Context

The evolve-plan prompt (`src/prompts/evolve-plan.md`) currently generates TEST.md with only "Programmatic Verification" (shell commands, grep checks) and "Manual Verification" sections. The preamble mentions "TDD-style test plan" but the output is a verification checklist — no actual test files (`.test.ts`, `.spec.ts`) are prescribed. This task adds Unit Tests and Integration Tests sections to close the gap between the TDD claim and the generated output.

## What to Build

Modify `src/prompts/evolve-plan.md` in two targeted locations:

### Section A — Preamble instructions (before or near Step 1)

Add a new paragraph instructing the Specification Writer to:
1. Check whether the project has a test runner (Jest, Vitest, etc.) and existing test conventions before writing TEST.md
2. Prescribe actual test files (`.test.ts`/`.spec.ts`) with concrete test cases when the codebase supports it
3. Fall back to programmatic verification only when no test infrastructure exists — explicitly note this fallback in TEST.md
4. Omit empty sections — if a category doesn't apply, skip it rather than leaving a blank heading

The existing first sentence ("TDD-style test plan") should remain but be clarified: TEST.md should describe *actual test code* when the project supports it, not just a verification checklist.

### Section B — Step 6 TEST.md template

Restructure the TEST.md template (the markdown code block in Step 6) to include four verification sections in this order:
1. **Unit Tests** — describes test files to create (`.test.ts`/`.spec.ts`), individual test cases with inputs and expected outputs, and which test runner to use
2. **Integration Tests** — describes test cases that verify cross-module behavior, end-to-end flows, or tool interaction
3. **Programmatic Verification** — unchanged from current template content (commands, grep, file checks)
4. **Manual Verification (if any)** — unchanged from current template content

Retain the "Test Order" section but position it after all four verification categories, specifying: unit → integration → programmatic → manual.

### Code Components

No new code files. This is strictly a markdown prompt edit with two targeted modifications to `src/prompts/evolve-plan.md`.

### Approach and Decisions

- Preserve the existing file structure: section headings (Setup, Process Steps 1-7, Guidelines) remain unchanged except for the two modified regions
- The preamble addition should flow naturally — place it after the first paragraph where "TDD-style test plan" is mentioned
- The Step 6 template change replaces the existing template code block entirely with a new version containing four sections
- Keep existing section guidance text (the prose describing what to write) intact; only modify the actual template content inside the markdown code blocks
- Use consistent formatting with the rest of the prompt (markdown headings, bold labels, code formatting)

## Dependencies

None. This is Step 1 with no prerequisites.

## Files Affected

- `src/prompts/evolve-plan.md` — modified: add preamble instructions about test infrastructure checks; restructure Step 6 TEST.md template to include Unit Tests and Integration Tests sections

## Acceptance Criteria

- [ ] `npm run check` (`tsc --noEmit`) reports no TypeScript errors after changes
- [ ] The preamble of `src/prompts/evolve-plan.md` contains instructions to check for test infrastructure before writing TEST.md
- [ ] The preamble instructs the Specification Writer to prescribe actual test files (`.test.ts`/`.spec.ts`) when possible and to fall back to programmatic verification when no test runner exists
- [ ] The preamble instructs the Specification Writer to omit empty sections
- [ ] Step 6's TEST.md template contains a "Unit Tests" section describing test files, test cases with inputs/expected outputs, and test runner references
- [ ] Step 6's TEST.md template contains an "Integration Tests" section describing cross-module or end-to-end test cases
- [ ] Step 6's TEST.md template retains the "Programmatic Verification" section (unchanged in content/purpose)
- [ ] Step 6's TEST.md template retains the "Manual Verification (if any)" section (unchanged in content/purpose)
- [ ] The four verification sections appear in order: Unit Tests → Integration Tests → Programmatic Verification → Manual Verification
- [ ] The "Test Order" section appears after all four verification categories and specifies unit → integration → programmatic → manual ordering
- [ ] No other files in the repository were modified (this is strictly a prompt template change)

## Risks and Edge Cases

- **Markdown formatting:** The new content lives inside markdown code blocks within a larger markdown file. Ensure proper indentation and escaping so nested code blocks render correctly.
- **Prompt length:** Adding new instructions increases the prompt size. Keep additions concise to avoid token bloat.
- **Backward compatibility:** Projects without test infrastructure should still work — the prompt must make it clear that Unit/Integration sections are conditional (omit if not applicable).
- **Existing execute-task.md alignment:** The `execute-task.md` prompt already references unit/integration tests in Step 4. No changes needed there, but ensure the new evolve-plan output naturally feeds into the existing execute-task workflow without contradictions.
