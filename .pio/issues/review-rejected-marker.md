# Review doesn't add a REJECTED marker file when rejecting — should be explicit and automated

When the review agent rejects a step, it currently signals rejection implicitly: delete `COMPLETED` but don't write `APPROVED`. The transition logic in `utils.ts` routes back to `execute-task` simply because `APPROVED` is absent.

**Problems:**

1. **Ambiguous state:** Absence of `APPROVED` could mean "not yet reviewed", "reviewed and rejected", or "review started but agent forgot the marker". There's no way to tell.
2. **No proof of rejection:** Unlike approval (which writes an explicit `APPROVED` file), rejection leaves no positive marker — only `REVIEW.md` content saying "REJECTED", which requires parsing text to detect.
3. **Relies on agent discipline:** The prompt instructs the agent to write `APPROVED` and delete `COMPLETED`, but there's no enforcement or automation. If the agent forgets, the step is stuck in an undefined state.
4. **No feedback to the re-execution session:** When review-code rejects and transitions back to execute-task, the new session gets the generic initial message: "Read TASK.md and TEST.md ... write tests first, then implement." There's no mention that this is a **re-execution after rejection**, no reference to REVIEW.md, and no summary of what needs fixing. The implementation agent starts blind — it would need to coincidentally discover `REVIEW.md` on its own to know what was wrong.

**Proposed solution:**

- Add a `REJECTED` marker file (like `APPROVED`) that the review agent writes when rejecting.
- Update the transition logic in `CAPABILITY_TRANSITIONS["review-code"]` to explicitly check for `REJECTED` rather than relying on absence of `APPROVED`.
- Consider automating the marker writing: if `REVIEW.md` contains "REJECTED" in the Decision section but no `REJECTED` file exists, auto-create it during `pio_mark_complete` validation.
- Update the review prompt (`src/prompts/review-code.md`) to write `S{NN}/REJECTED` and update the write allowlist (`resolveReviewWriteAllowlist`) accordingly.

**Proposed solution (feedback channel):**

When review-code → execute-task transition detects a rejection, the re-execution session should receive context about what needs fixing:

- **In the initialMessage:** Append "⚠️ This is a re-execution after rejection. Read S{NN}/REVIEW.md for feedback before implementing."
- **In session params:** Pass `reviewFeedback: true` so `defaultInitialMessage` can branch on it and include rejection context.
- **As a system prompt preamble:** Inject REVIEW.md contents directly into the execute-task prompt when re-executing (similar to how PROJECT.md is injected before capability prompts).
- The ideal approach ensures the implementation agent sees review feedback without requiring manual discovery.

**File references:**
- `src/utils.ts` — `CAPABILITY_TRANSITIONS["review-code"]` (line ~250), `resolveNextCapability`
- `src/prompts/review-code.md` — Step 8 marker instructions
- `src/capabilities/review-code.ts` — `resolveReviewWriteAllowlist`, `CAPABILITY_CONFIG`
- `src/capabilities/execute-task.ts` — `CAPABILITY_CONFIG.defaultInitialMessage` (generic message, no rejection awareness)
- `src/utils.ts` — `resolveCapabilityConfig` (resolves `initialMessage` from params or falls back to default)

## Category

improvement
