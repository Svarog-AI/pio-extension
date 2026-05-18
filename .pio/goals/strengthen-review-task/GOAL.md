# Strengthen review-task capability

Rename `review-code` to `review-task` for naming consistency with `execute-task`, and significantly tighten the review criteria so the gate-keeping mechanism actually rejects low-quality implementations. The new severity classifications and mandatory user confirmation on medium issues must be enforced by the prompt instructions in `src/prompts/review-task.md`.

## Current State

The review capability is defined as `review-code` across the codebase:

- **Capability module:** `src/capabilities/review-code.ts` exports `setupReviewCode`, registers the `pio_review_code` tool and `/pio-review-code` command. `CAPABILITY_CONFIG.prompt` points to `"review-code.md"`.
- **Prompt template:** `src/prompts/review-code.md` defines the "Code Review Agent" role with issue severity levels: CRITICAL, HIGH, MEDIUM, LOW. Current rules: critical/high → REJECT (mandatory), low/medium → at reviewer's discretion. The agent is told "when in doubt, use `ask_user` to decide" but has no mandatory handoff for medium issues.
- **Transition resolver:** `src/state-machine.ts` contains `transitionReviewCode` mapping `"review-code"` → `"evolve-plan"` (approved) or `"execute-task"` (rejected). The `resolveTransition` switch handles `"review-code"` as a case.
- **Validation guard:** `src/guards/validation.ts` checks `capabilityForAutomation === "review-code"` to trigger frontmatter parsing, marker file creation, and decision application in `pio_mark_complete`.
- **Entry point:** `src/index.ts` imports `setupReviewCode` from `./capabilities/review-code` and calls it.
- **Skill docs:** `src/skills/pio/SKILL.md` references `review-code` in the workflow lifecycle description and command table (`/pio-review-code`).
- **Tests:** `src/capabilities/review-code.test.ts` tests capability config and step discovery. Additional test files reference `"review-code"` as a capability name: `src/state-machine.test.ts`, `src/guards/validation.test.ts`, `src/capability-config.test.ts`, `src/model-config.test.ts`.
- **Existing issue:** `.pio/issues/rename-review-code-to-review-task.md` documents the file renames and function name changes needed for the rename portion.

The prompt (`review-code.md`) currently instructs: "High and critical issues must never be ignored. If any exist, the review is REJECTED." and "Low and medium issues are at your discretion. You may approve despite them if they don't affect correctness." This lenient policy lets many quality issues slip through — per the user, things go through that shouldn't.

The prompt's issue categorization provides no guidance on what specific patterns map to which severity levels. There is no explicit mention of test quality as a critical concern, no treatment of code smells or security risks as high-priority, and no classification for accidental changes to unrelated files.

## To-Be State

### 1. Rename `review-code` → `review-task` everywhere

Consistent rename across all references:

- **File renames:** `src/capabilities/review-code.ts` → `src/capabilities/review-task.ts`, `src/prompts/review-code.md` → `src/prompts/review-task.md`
- **Capability name string:** `"review-code"` → `"review-task"` in all config, transitions, validation checks, and test assertions
- **Tool/command names:** `pio_review_code` → `pio_review_task`, `/pio-review-code` → `/pio-review-task`
- **Function names:** `setupReviewCode` → `setupReviewTask`, `handleReviewCode` → `handleReviewTask`, `transitionReviewCode` → `transitionReviewTask` (and related callback names)
- **CAPABILITY_CONFIG.prompt:** `"review-code.md"` → `"review-task.md"`
- **State machine:** `resolveTransition` case and `transitionReviewTask` function in `src/state-machine.ts`
- **Validation guard:** `capabilityForAutomation === "review-code"` → `"review-task"` in `src/guards/validation.ts`
- **Index:** import and call site updated in `src/index.ts`
- **Skill docs:** All `review-code` mentions → `review-task` in `src/skills/pio/SKILL.md`
- **All test files:** Update capability name strings, module imports, describe block labels, and assertions

### 2. Medium issues require user confirmation

The prompt must be updated so that when medium-severity issues are found, the review agent is **required** to use `ask_user` to ask whether to REJECT or ACCEPT. The current "at your discretion" policy is replaced with a mandatory handoff: the agent cannot unilaterally approve or reject on medium issues alone — it must present findings and get explicit user direction. High and critical issues remain mandatory REJECT without user consultation (no change).

### 3. Test quality deviations are CRITICAL

The prompt must explicitly call out test quality as a first-class concern. The following are CRITICAL issues:

- Tests that deviate from what TEST.md specifies (the design spec)
- Meaningless tests — tests that don't actually verify behavior (e.g., checking cosmetic properties, presence of text lines, or trivial assertions)
- Tests that don't make sense for the domain being tested
- Good tests that cover important behavior are mandatory; their absence is also critical

This elevates test quality from a general "coverage" check to an explicit gate: bad or absent tests = immediate REJECT.

### 4. Code smells and unnecessary complexity are HIGH

Over-engineering, unnecessary abstractions, dead code, and overly complex implementations when simpler solutions satisfy the requirements are classified as HIGH issues (mandatory REJECT). This replaces the current vague "simplicity and quality" guidance with explicit severity assignment.

### 5. Security risks are HIGH

Any security concern is explicitly classified as HIGH: injection vulnerabilities, improper input validation, exposed credentials or secrets, unsafe deserialization, path traversal, etc. The prompt should enumerate these as examples but not be exhaustive — the agent must flag any security risk it identifies.

### 6. Accidental changes to previous functionality are HIGH

If the implementation modifies files or behavior unrelated to the task scope (as defined in TASK.md), this is a HIGH issue. The review agent must compare SUMMARY.md's "Files Modified" against what TASK.md says should change, and flag any unauthorized modifications. This prevents silent regressions and scope creep from passing through the gate.

### 7. Design flaws and code duplication are MEDIUM

Architectural concerns that don't immediately break functionality but indicate poor design choices: DRY violations, inappropriate abstractions, coupling issues, interface design problems. These trigger mandatory user confirmation (per rule 2 above).

The updated `src/prompts/review-task.md` should contain a clear severity classification table or list mapping these concrete patterns to their assigned levels, so the agent has unambiguous guidance rather than open-ended discretion.
