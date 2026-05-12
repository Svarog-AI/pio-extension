# Tests: Update `execute-task.md` with TDD skill reference

No test runner is configured for this project. Verification relies on programmatic checks and manual review of the modified markdown file.

## Programmatic Verification

- **Skill reference present near top**
  - **What:** The `test-driven-development` skill is referenced in `execute-task.md`
  - **How:** `grep -c 'test-driven-development' src/prompts/execute-task.md`
  - **Expected result:** Output is `1` (exactly one reference)

- **Reference placement (before Setup or Step 1)**
  - **What:** The TDD skill reference appears before the `## Setup` heading
  - **How:** `grep -n 'test-driven-development' src/prompts/execute-task.md` — verify line number is less than the line number of `## Setup` (which can be found via `grep -n '## Setup' src/prompts/execute-task.md`)
  - **Expected result:** The skill reference line number is lower than the `## Setup` line number

- **Skill guidance instruction**
  - **What:** The reference instructs agents to follow the TDD skill's guidance
  - **How:** `grep -i 'follow' src/prompts/execute-task.md | grep -i 'test-driven-development'` or inspect manually that the paragraph directing agents to use the skill contains instructional language (e.g., "follow", "use", "refer to")
  - **Expected result:** At least one line references both the skill name and gives a directive

- **Step 4 generalized (no hardcoded-only runner mention)**
  - **What:** The specific mention of "Jest, Vitest" in Step 4 is now part of a broader framework-agnostic sentence
  - **How:** `grep -n 'Jest' src/prompts/execute-task.md` — verify the line also contains language indicating these are examples (e.g., "such as", "for example", "like")
  - **Expected result:** The Jest/Vitest mention is framed as examples, not as a directive to use only those tools

- **TypeScript still compiles**
  - **What:** No TypeScript errors from the change
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no errors reported

## Manual Verification

- **Reference placement and tone**
  - **What:** The TDD skill reference reads naturally and fits the existing prompt style
  - **How:** Read `src/prompts/execute-task.md` from top to bottom. Verify the reference is a concise paragraph (not a new section), uses direct instructional language consistent with the rest of the prompt, and appears before agents begin their Step 1 work

- **Step 4 behavior preserved**
  - **What:** The generalized text still allows adding a new test runner if none exists
  - **How:** Read Step 4 ("Write tests first — Red phase") in `src/prompts/execute-task.md`. Verify the sentence "If not but a test runner can be reasonably added, add one" (or equivalent) is still present after generalization

- **No unintended changes**
  - **What:** Only the two specified changes were made (skill reference + Step 4 generalization)
  - **How:** `git diff src/prompts/execute-task.md` — verify only the intended lines changed; no other sections, formatting, or content was modified

## Test Order

1. Programmatic verification checks (grep, npm run check)
2. Manual verification (read file, git diff)
