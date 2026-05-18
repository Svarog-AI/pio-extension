# Plan: Strengthen Review Task

Rename `review-code` to `review-task` for naming consistency with `execute-task`, and significantly tighten review criteria so the gate actually rejects low-quality implementations.

## Prerequisites

None.

## Steps

### Step 1: Rename `review-code` → `review-task` everywhere

**Description:** Perform a consistent rename across the entire codebase. This involves file renames, capability name string replacements, tool/command name changes, function name changes, and updating all references in source files, test files, and documentation. The rename is mechanical — no behavior changes, just identifier updates.

Specifically:
- Rename `src/capabilities/review-code.ts` → `src/capabilities/review-task.ts`
- Rename `src/prompts/review-code.md` → `src/prompts/review-task.md`
- Rename `src/capabilities/review-code.test.ts` → `src/capabilities/review-task.test.ts`
- Update capability name string `"review-code"` → `"review-task"` in: `CAPABILITY_CONFIG.prompt`, error messages, tool definition (`pio_review_code` → `pio_review_task`), command registration (`/pio-review-code` → `/pio-review-task`), and enqueue task calls within the renamed capability module
- Rename exported functions: `setupReviewCode` → `setupReviewTask`, `handleReviewCode` → `handleReviewTask`
- Update `src/state-machine.ts`: rename `transitionReviewCode` → `transitionReviewTask`, update `resolveTransition` switch case, update transition target in `transitionExecuteTask`, and update doc comments
- Update `src/guards/validation.ts`: change `capabilityForAutomation === "review-code"` → `"review-task"`
- Update `src/index.ts`: import and call `setupReviewTask` from `./capabilities/review-task`
- Update `src/skills/pio/SKILL.md`: all mentions of `review-code` in workflow lifecycle, command table, and cycle description
- Update all test files: `src/capabilities/review-task.test.ts` (renamed), `src/state-machine.test.ts`, `src/guards/validation.test.ts`, `src/capability-config.test.ts`, `src/model-config.test.ts`, `src/goal-state.test.ts` — capability name strings, module imports, describe block labels, and assertions

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no type errors (imports resolve correctly after file renames)
- [ ] All existing tests pass with no regressions: `npx vitest run` exits successfully
- [ ] No remaining references to `review-code` in `src/` (verifiable via `grep -r "review-code" src/`)

**Files affected:**
- `src/capabilities/review-code.ts` → `src/capabilities/review-task.ts` — rename file, update all capability name strings, tool/command names, function names
- `src/prompts/review-code.md` → `src/prompts/review-task.md` — rename file only (prompt content changes in Step 2)
- `src/capabilities/review-code.test.ts` → `src/capabilities/review-task.test.ts` — rename file, update imports and references
- `src/state-machine.ts` — rename transition function, update switch case, update transition targets and comments
- `src/guards/validation.ts` — change capability name string in automation check (line ~309)
- `src/index.ts` — update import path and function call
- `src/skills/pio/SKILL.md` — update workflow lifecycle description, command table references
- `src/state-machine.test.ts` — update capability strings, describe blocks, assertions
- `src/guards/validation.test.ts` — update describe block labels (integration test section)
- `src/capability-config.test.ts` — update capability name strings in test params and assertions
- `src/model-config.test.ts` — update capability name string in test assertion
- `src/goal-state.test.ts` — update capability name string in test fixture data

### Step 2: Strengthen review prompt with new severity classification rules

**Description:** Rewrite `src/prompts/review-task.md` to replace the current lenient and open-ended review criteria with concrete severity classifications. The prompt must provide unambiguous guidance so the review agent actually rejects low-quality implementations.

Changes to the prompt content:
1. **Medium issues require mandatory user confirmation:** Replace "at your discretion" policy with a hard requirement — when medium-severity issues are found (and no critical/high exist), the agent must use `ask_user` to get explicit REJECT or ACCEPT direction before proceeding. High and critical remain mandatory REJECT without consultation.
2. **Test quality deviations are CRITICAL:** Explicitly call out test quality as a first-class concern. Define these patterns as CRITICAL: tests that deviate from TEST.md specifications, meaningless tests (checking cosmetic properties, trivial assertions), tests that don't make sense for the domain, and absence of tests covering important behavior.
3. **Code smells and unnecessary complexity are HIGH:** Over-engineering, unnecessary abstractions, dead code, and overly complex implementations when simpler solutions satisfy requirements are classified as HIGH (mandatory REJECT).
4. **Security risks are HIGH:** Injection vulnerabilities, improper input validation, exposed credentials/secrets, unsafe deserialization, path traversal, etc. Enumerate examples but note agent must flag any security risk identified.
5. **Accidental changes to previous functionality are HIGH:** Modifications to files or behavior unrelated to TASK.md scope. Agent must compare SUMMARY.md's "Files Modified" against what TASK.md says should change and flag unauthorized modifications.
6. **Design flaws and code duplication are MEDIUM:** DRY violations, inappropriate abstractions, coupling issues, interface design problems. These trigger mandatory user confirmation per rule 1 above.
7. **Add a severity classification table or list** mapping concrete patterns to assigned severity levels so the agent has unambiguous guidance rather than open-ended discretion.

The existing prompt structure (process steps, YAML frontmatter format, REVIEW.md template) should be preserved. Only the issue categorization rules and approval logic are being tightened.

**Acceptance criteria:**
- [ ] `src/prompts/review-task.md` exists (file was renamed in Step 1) and contains severity classification guidance
- [ ] Prompt explicitly states medium issues require `ask_user` for mandatory user confirmation (searchable: "ask_user" appears in a context about medium issues)
- [ ] Prompt classifies test quality deviations as CRITICAL level (searchable: test-related patterns under a CRITICAL section or reference)
- [ ] Prompt classifies code smells/complexity as HIGH level
- [ ] Prompt classifies security risks as HIGH level
- [ ] Prompt classifies accidental changes to unrelated files as HIGH level
- [ ] Prompt classifies design flaws/duplication as MEDIUM level
- [ ] `npx tsc --noEmit` reports no errors (no TypeScript impact, but verifies overall health)

**Files affected:**
- `src/prompts/review-task.md` — rewrite issue categorization section (Step 5 of prompt process), update approval decision rules (Step 6), add severity classification mapping

## Notes

- **User config rename:** If `~/.pi/pio-config.yaml` contains `capabilities.review-code:`, rename the key to `capabilities.review-task:` (manual edit outside the repo).
- **Stale session queue files: Any `.pio/session-queue/task-*.json` file referencing `"review-code"` as a pending capability would fail to resolve after rename (dynamic import of `./capabilities/review-code` would 404). Users should discard stale queue files if they have any mid-workflow during deployment. This is acceptable — queue files are ephemeral.
- **No changes needed in:** `capability-config.ts` (resolves capabilities by dynamic import, no hardcoded names), `execute-plan.ts` (no direct review-code references), `fs-utils.ts`, `queues.ts`, `goal-state.ts`.
- **File rename mechanics:** Use actual filesystem rename (not delete+create) to preserve any editor state. In a git context this would be `git mv`, but for the executor the key is that import paths are updated everywhere to match new filenames.
