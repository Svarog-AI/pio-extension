# Explicit Rejection Marker and Feedback Channel

Introduce structured outcome data (YAML frontmatter) in `REVIEW.md`, explicit marker files (`APPROVED` / `REJECTED`), automated marker creation at `pio_mark_complete`, and a feedback channel so re-execution sessions receive review context. All scoped to the `review-code` capability.

## Current State

### Review output is unstructured for automation

The `review-code` session writes `S{NN}/REVIEW.md` with a human-readable format. The prompt (`src/prompts/review-code.md` Step 7) requires a `## Decision` section as the first heading containing plain text `APPROVED` or `REJECTED`. To determine the outcome programmatically, the system must parse the body of REVIEW.md — there is no machine-readable section to scan.

### Rejection is signaled implicitly through absence of APPROVED

1. **Marker files:** The only positive markers are `COMPLETED` (written by `execute-task`), `BLOCKED` (written by `execute-task` on blocker), and `APPROVED` (written by `review-code` on approval). There is no `REJECTED` marker file.
2. **Transition logic:** In `src/utils.ts`, `CAPABILITY_TRANSITIONS["review-code"]` checks for `S{NN}/APPROVED`. If it exists → advance to `evolve-plan` (next step). If absent → fall through to `execute-task` (re-execute same step). Rejection is inferred from the *absence* of `APPROVED`, not from a positive signal.
3. **State ambiguity:** Absence of `APPROVED` could mean "not yet reviewed", "reviewed and rejected", "review started but agent forgot the marker", or "agent crashed mid-review". There's no way to distinguish from markers alone.

### No automation at pio_mark_complete for review-code

In `src/capabilities/validation.ts`, `pio_mark_complete` runs `validateOutputs()` which checks that declared files (e.g. `S{NN}/REVIEW.md`) exist on disk. It does not:
- Parse REVIEW.md content to extract the decision
- Create marker files (`APPROVED`/`REJECTED`) based on the decision
- Validate consistency between the decision in REVIEW.md and any marker files that *do* exist

### Review agent relies on discipline, not enforcement

The review prompt (`src/prompts/review-code.md` Step 8) instructs the agent to: write `APPROVED` + leave `COMPLETED` on approval, or delete `COMPLETED` + don't write `APPROVED` on rejection. The write allowlist (`resolveReviewWriteAllowlist` in `src/capabilities/review-code.ts`) permits `[`${folder}/REVIEW.md`, `${folder}/APPROVED`]`. There is no enforcement — if the agent forgets or crashes, the step enters an undefined state.

### No feedback channel on re-execution

When `review-code` rejects and transitions to `execute-task`, the re-execution session receives the generic initial message from `CAPABILITY_CONFIG.defaultInitialMessage` in `src/capabilities/execute-task.ts`: `"Read TASK.md and TEST.md ... write tests first, then implement."` There is no mention of rejection, no reference to `REVIEW.md`, and no summary of what needs fixing. The implementation agent starts blind — it would need to coincidentally discover `REVIEW.md` on its own to know what was wrong.

## To-Be State

### YAML frontmatter in REVIEW.md

`REVIEW.md` begins with a YAML frontmatter block containing structured outcome data, before any markdown headings:

```yaml
---
decision: APPROVED | REJECTED
criticalIssues: <number>
highIssues: <number>
mediumIssues: <number>
lowIssues: <number>
---
# Code Review: <Step Title> (Step N)
## Decision
APPROVED or REJECTED
...
```

The `decision` field is the authoritative outcome. The issue count fields are populated by the review agent based on its analysis. This allows the infrastructure to determine approval/rejection by reading only the first ~5 lines of REVIEW.md — no full-document scanning required.

The `## Decision` body section remains (preserves human readability) but the frontmatter is the source of truth for automation.

### Session lifecycle pattern: prepare → work → markComplete → validateState

A capability session follows a structured lifecycle:

1. **prepareSession** — run before the agent starts. Cleans up stale state from previous runs of the same session type, ensuring a clean slate.
2. **Agent work** — the agent does its job within file protections (readOnly/writeAllowlist).
3. **markComplete** — agent calls `pio_mark_complete`. Infrastructure validates outputs and performs automation (marker creation, transition routing).
4. **validateState** — after automation, verify the final state is consistent. This runs as part of `pio_mark_complete` and gates session exit.

This pattern should be reusable across all capabilities. For this goal it is implemented for `review-code`; other capabilities can adopt it later.

### prepareSession for review-code (stale marker cleanup)

When a `review-code` session starts, clean up markers from any previous review attempt on the same step:
- Delete `S{NN}/APPROVED` if it exists
- Delete `S{NN}/REJECTED` if it exists

This ensures the session starts from a known state. There is no point in carrying over old approval/rejection markers — a new review means the outcome is undecided again.

### Automatic marker creation at pio_mark_complete

When `pio_mark_complete` runs during a `review-code` session:

1. **Parse the frontmatter** from `S{NN}/REVIEW.md`. Extract `decision`, issue counts, and validate all required fields.
2. **If frontmatter is missing or malformed:** Return a validation failure with guidance: "REVIEW.md is missing valid YAML frontmatter at the top of the file. Review your document and add a `---` block containing `decision`, `criticalIssues`, `highIssues`, `mediumIssues`, and `lowIssues`. Ensure the decision field matches your actual review outcome." The agent must fix REVIEW.md before proceeding.
3. **If decision is APPROVED:** Create `S{NN}/APPROVED` (empty file). Do not delete `COMPLETED`.
4. **If decision is REJECTED:** Create `S{NN}/REJECTED` (empty file). Delete `S{NN}/COMPLETED` (so `isStepReady` in `execute-task.ts` will allow re-execution).
5. **Validate final state (validateState):** After marker creation, verify exactly one of `APPROVED` or `REJECTED` exists and it matches the `decision` field from frontmatter. If both exist, or neither exists, or they don't match — report a validation failure: "Review state is inconsistent after automation. The marker files do not match the decision in REVIEW.md frontmatter." This indicates an internal error and the session should not proceed until resolved.

This replaces the current approach where the *agent* writes markers manually. The infrastructure guarantees marker correctness based on the structured data the agent provides.

### Transition logic updated to check REJECTED explicitly

In `src/utils.ts`, `CAPABILITY_TRANSITIONS["review-code"]` checks for `REJECTED` explicitly:
- `APPROVED` exists → advance to `evolve-plan` (next step)  
- `REJECTED` exists → route to `execute-task` for the same step, with a `reexecutedAfterRejection: true` flag in params (or a different initialMessage?)
- Neither exists → current fallback behavior (route to re-execution), but this path should ideally never occur once automation is in place

### Re-execution feedback channel

When the transition detects rejection and routes back to `execute-task`:
- The transition passes context indicating this is a re-execution after rejection
- `CAPABILITY_CONFIG.defaultInitialMessage` in `src/capabilities/execute-task.ts` branches on this context
- The implementation agent receives an initial message explicitly stating: "This is a re-execution after rejection — read `S{NN}/REVIEW.md` for feedback before implementing."

### Write allowlist updated

`resolveReviewWriteAllowlist` in `src/capabilities/review-code.ts` permits only `REVIEW.md` (the marker files are created automatically by `pio_mark_complete`, not by the agent). This simplifies the agent's job — it writes one file (`REVIEW.md`) and the infrastructure handles markers.

### Files to modify

- `src/utils.ts` — `CAPABILITY_TRANSITIONS["review-code"]` (add REJECTED check, pass re-execution context)
- `src/prompts/review-code.md` — Step 7 format (require YAML frontmatter), Step 8 instructions (agent writes only REVIEW.md; automation handles markers)
- `src/capabilities/review-code.ts` — `resolveReviewWriteAllowlist` (simplify to REVIEW.md only, markers are auto-created); add `prepareSession` hook for stale marker cleanup
- `src/capabilities/execute-task.ts` — `CAPABILITY_CONFIG.defaultInitialMessage` (branch on re-execution context, include REVIEW.md reference)
- `src/capabilities/validation.ts` — `pio_mark_complete` handler: add frontmatter parsing for review-code sessions, automatic marker creation, validateState after automation
- `src/capabilities/session-capability.ts` — wire the lifecycle pattern (prepareSession runs before agent starts; validateState runs during markComplete)

### Files NOT to modify

Unrelated capabilities (`create-plan`, `evolve-plan`, `create-goal`, etc.), prompt templates for other sessions, core extension wiring (`src/index.ts`), and the `execute-plan` workflow. Scope is strictly `review-code`.
