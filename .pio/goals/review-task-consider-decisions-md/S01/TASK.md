# Task: Add DECISIONS.md support to review-task

Enable the `review-task` capability to read `DECISIONS.md` (Step 2+) and understand user-requested changes from `SUMMARY.md`, so reviewers stop flagging legitimate deviations as errors.

## Context

The `review-task` capability currently reads a fixed set of files: `GOAL.md`, `PLAN.md`, `TASK.md`, `TEST.md`, and `SUMMARY.md`. It does not read `DECISIONS.md`, which accumulates architectural decisions from prior steps (created by `evolve-plan` for Step 2+). When implementation deviates from the original plan — file placements change, new abstractions are introduced — these deviations are documented in `DECISIONS.md` but invisible to the reviewer. This causes false-positive rejections when comparing implementation against `PLAN.md` alone.

Additionally, `SUMMARY.md` includes a **User-Requested Changes** section recording explicit user feedback during implementation. The reviewer reads `SUMMARY.md` but has no instructions to treat these changes as valid scope extensions — so legitimate user-approved changes can be incorrectly flagged as scope creep.

## What to Build

Two co-dependent changes:

### 1. `src/capabilities/review-task.ts` — Add DECISIONS.md to read-only files

Modify `resolveReviewReadOnlyFiles()` (currently at line ~72) to unconditionally include `${folder}/DECISIONS.md`. No conditional needed — `readOnlyFiles` is a write-blocklist resolved to absolute paths on `resources_discover`. If the file doesn't exist on disk (Step 1), nothing reads it; it just sits in the list. Including it for all steps is harmless and simpler.

- Define `DECISIONS_FILE = "DECISIONS.md"` as a constant alongside the existing file constants at the bottom of the file (after `REVIEW_FILE`).
- Add `${folder}/${DECISIONS_FILE}` to the returned array unconditionally. No `if (stepNumber > 1)` check needed.

The function currently returns:
```
[GOAL_FILE, PLAN_FILE, `${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`, `${folder}/${SUMMARY_FILE}]
```

After the change, it should return the same array with `DECISIONS.md` appended.

### 2. `src/prompts/review-task.md` — Prompt instructions for DECISIONS.md and user-requested changes

Update the prompt in three places:

#### a) Step 2 — "Read TASK.md, TEST.md, and SUMMARY.md"

Add content after the existing paragraph describing the three files. Instruct the reviewer that:

- `S{NN}/DECISIONS.md` may exist for Step 2+ (will not exist for Step 1 / `S01/`).
- It contains accumulated architectural decisions from preceding steps — file placement changes, departures from the original plan, interface choices.
- Treat it as supplementary context for evaluating whether implementation aligns with actual decisions made during the goal lifecycle.
- For Step 1 (`S01/`), this file will not exist; proceed using only `TASK.md`.

Add instructions about `SUMMARY.md`'s **User-Requested Changes** section:

- When present, treat listed changes as explicit user-approved scope extensions.
- The reviewer should NOT flag files or behaviors introduced by these changes as unauthorized modifications (HIGH severity).
- Instead, verify they were applied correctly and note them in the review.

Add an explicit **authority hierarchy** statement to guide how the reviewer resolves conflicts between specification sources. State it clearly, ordered from highest to lowest authority:

1. **User-Requested Changes** (`SUMMARY.md`) — user-approved scope extensions always take precedence
2. **Decisions** (`DECISIONS.md`) — architectural decisions and plan deviations override the original plan
3. **Task** (`TASK.md`), **Plan** (`PLAN.md`), and **Test** (`TEST.md`) — formal specification and verification contract; TASK elaborates PLAN, TESTS verify TASK
4. **Goal** (`GOAL.md`) — high-level target outcome; superseded by everything above

Instruct the reviewer: when implementation follows a higher-authority source but deviates from a lower one, this is not an issue. Flag deviations only when they violate a source at its own authority level without justification from a higher source.

#### b) Step 4 — "Analyze the implementation" / Alignment Check

The alignment check currently lists four dimensions: GOAL ↔ PLAN, PLAN ↔ TASK, TASK ↔ TESTS, TASK ↔ Implementation. Add two new dimensions:

- **TASK ↔ DECISIONS** — verify that architectural decisions and plan deviations documented in `DECISIONS.md` are respected by the implementation.
- **TASK ↔ User-Requested Changes** — when `SUMMARY.md`'s "User-Requested Changes" section lists changes, treat those as explicit scope extensions approved by the user. Do not flag files or behaviors introduced solely by user-requested changes as "accidental changes to unrelated files" (HIGH) or scope creep. Instead, verify correctness and document in the review.

**Important — explain how the hierarchy resolves conflicts:** When the reviewer finds a deviation from `TASK.md` or `PLAN.md`, they must check `DECISIONS.md` and `SUMMARY.md` before flagging an issue. A deviation is justified if it appears in either source at a higher authority level.

### Code Components

#### `resolveReviewReadOnlyFiles()` — modified return logic

The function signature and error handling remain unchanged. Only the returned array changes: append `DECISIONS.md` unconditionally (no conditional check).

The function currently returns:
```typescript
return [
  GOAL_FILE,
  PLAN_FILE,
  `${folder}/${TASK_FILE}`,
  `${folder}/${TEST_FILE}`,
  `${folder}/${SUMMARY_FILE}`,
];
```

Change to:
```typescript
return [
  GOAL_FILE,
  PLAN_FILE,
  `${folder}/${TASK_FILE}`,
  `${folder}/${TEST_FILE}`,
  `${folder}/${SUMMARY_FILE}`,
  `${folder}/${DECISIONS_FILE}`,
];
```

#### File constants — new constant

Add at the bottom of the file with existing constants:
```typescript
const DECISIONS_FILE = "DECISIONS.md";
```

### Approach and Decisions

- `readOnlyFiles` is a write-blocklist (enforced in `validation.ts` via `tool_call`). Including a non-existent file is harmless — it just sits in the resolved paths array. No conditional check needed.
- This differs from `evolve-plan.ts`, which uses conditionals for `DECISIONS.md` in `validation.files` and `writeAllowlist`. Those serve different purposes (validation checks existence, write allowlist gates writes). Our change is to read-only protection only.
- The prompt still instructs the reviewer that `DECISIONS.md` won't exist for Step 1 — this is a behavioral instruction, not a filesystem gate.
- No changes to `resolveReviewValidation()`, `resolveReviewWriteAllowlist()`, or any other function beyond `resolveReviewReadOnlyFiles()`.
- No changes to `evolve-plan.ts`, `execute-task.ts`, `execute-task.md`, `finalize-goal.md`, or any other capability.

## Dependencies

None. This is Step 1 of a single-step plan.

## Files Affected

- `src/capabilities/review-task.ts` — add `DECISIONS_FILE` constant, unconditionally append `${folder}/${DECISIONS_FILE}` to `resolveReviewReadOnlyFiles()` return value
- `src/prompts/review-task.md` — update Step 2 with DECISIONS.md instructions, User-Requested Changes instructions, and authority hierarchy; update alignment check section in Step 4 with two new dimensions

## Acceptance Criteria

- `npx tsc --noEmit` reports no errors
- `resolveReviewReadOnlyFiles()` always includes `${folder}/DECISIONS.md` in the returned array, regardless of step number
- `src/prompts/review-task.md` Step 2 contains instructions about reading `DECISIONS.md` for Step 2+
- `src/prompts/review-task.md` Step 2 contains instructions about treating "User-Requested Changes" as approved scope extensions
- `src/prompts/review-task.md` contains the authority hierarchy: User-Requested Changes > Decisions > Plan/Task/Test > Goal
- The alignment check section in `src/prompts/review-task.md` includes **TASK ↔ DECISIONS** and **TASK ↔ User-Requested Changes** dimensions
- `src/capabilities/review-task.test.ts` contains a test verifying `DECISIONS.md` appears in `readOnlyFiles` for any step number (e.g., `stepNumber: 1`)

## Risks and Edge Cases

- The `resolveReviewReadOnlyFiles()` function currently returns a fixed array. Adding one entry is straightforward — no branching needed.
- When adding tests, use the existing test patterns from `review-task.test.ts`. The test file currently has no `readOnlyFiles` tests — this will be the first set. Follow the pattern from `evolve-plan.test.ts` which uses `resolveCapabilityConfig()` to test capability config callbacks.
- Import `resolveCapabilityConfig` into the test file (it's not currently imported).
