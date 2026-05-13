# Plan: Explicit Rejection Marker and Feedback Channel

Introduce YAML frontmatter in `REVIEW.md`, explicit `REJECTED` marker files, automatic marker creation at `pio_mark_complete`, the `prepareSession` lifecycle hook for stale-state cleanup, and a feedback channel so re-execution sessions receive review context.

## Prerequisites

- `npm install` has been run (project dependencies available)
- No running pi sub-sessions that could conflict with file changes under `.pio/`

## Steps

### Step 1: Add `prepareSession` lifecycle type and config resolution

**Description:** Extend the capability configuration types to support a `prepareSession` hook — an async function that runs before the agent starts, enabling stale-state cleanup. Add the field to `StaticCapabilityConfig`, wire it through `resolveCapabilityConfig` in `utils.ts`, and export from `types.ts`. The hook signature: `(workingDir: string, params?: Record<string, unknown>) => void | Promise<void>`.

**Acceptance criteria:**
- [ ] `StaticCapabilityConfig` has an optional `prepareSession` property of the correct callback type
- [ ] `resolveCapabilityConfig` resolves `prepareSession` (invoking callbacks with workingDir/params, passing static values through)
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/types.ts` — add `prepareSession` to `StaticCapabilityConfig`; add callback type if needed
- `src/utils.ts` — resolve `prepareSession` in `resolveCapabilityConfig` alongside the other config callbacks (`validation`, `readOnlyFiles`, `writeAllowlist`)

### Step 2: Wire `prepareSession` into the session lifecycle

**Description:** In `session-capability.ts`, invoke the `prepareSession` hook during `resources_discover` — after reading the capability config but before the agent starts. This is the "prepare" phase of the lifecycle pattern (prepare → work → markComplete → validateState). The hook should run for any capability that defines it; other capabilities skip it naturally since the field is optional.

**Acceptance criteria:**
- [ ] `session-capability.ts` calls `config.prepareSession(workingDir, sessionParams)` during `resources_discover` when the field exists
- [ ] Capabilities without `prepareSession` continue to work unchanged
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/capabilities/session-capability.ts` — add prepareSession invocation in the `resources_discover` handler

### Step 3: Update `review-code` transition with explicit `REJECTED` check

**Description:** Modify `CAPABILITY_TRANSITIONS["review-code"]` in `src/utils.ts` to explicitly check for `S{NN}/REJECTED` alongside the existing `APPROVED` check. When `REJECTED` exists, route to `execute-task` for the same step with a flag indicating this is a re-execution after rejection (e.g., `rejectedAfterReview: true` in params). When neither marker exists, keep current fallback behavior (route to re-execution).

**Acceptance criteria:**
- [ ] Transition resolver checks `REJECTED` file existence alongside existing `APPROVED` check
- [ ] Rejection routes to `execute-task` with same step number and a `rejectedAfterReview: true` param
- [ ] Approval still routes to `evolve-plan` with incremented step number (unchanged)
- [ ] Neither-exists fallback still routes to `execute-task` (unchanged)
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/utils.ts` — modify `CAPABILITY_TRANSITIONS["review-code"]` resolver callback

### Step 4: Add re-execution feedback channel in `execute-task`

**Description:** In `src/capabilities/execute-task.ts`, update `CAPABILITY_CONFIG.defaultInitialMessage` to detect when a step is being re-executed after rejection. Check for the `rejectedAfterReview` flag (passed via params from the transition) and, if present, include an initial message that instructs the implementation agent to read `S{NN}/REVIEW.md` for feedback before implementing.

**Acceptance criteria:**
- [ ] `defaultInitialMessage` detects `params.rejectedAfterReview` and includes a rejection-aware message referencing `S{NN}/REVIEW.md`
- [ ] Normal first-time execution message is unchanged when the flag is absent
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/capabilities/execute-task.ts` — branch `defaultInitialMessage` on rejection context

### Step 5: Simplify write allowlist and add `prepareSession` for review-code

**Description:** Two changes in `src/capabilities/review-code.ts`: (1) Simplify `resolveReviewWriteAllowlist` to permit only `S{NN}/REVIEW.md` — marker files are now created automatically by `pio_mark_complete`, so the agent no longer writes them. Remove `APPROVED` from the allowlist. The file-protection system in `validation.ts` already permits writes inside the session's own goal workspace, but for safety keep REVIEW.md explicit. (2) Add a `prepareSession` callback that deletes stale `APPROVED` and `REJECTED` marker files at the step folder on startup, ensuring a clean slate for each new review attempt.

**Acceptance criteria:**
- [ ] `resolveReviewWriteAllowlist` returns only `[S{NN}/REVIEW.md]` (no longer includes `APPROVED`)
- [ ] `prepareSession` is defined and deletes both `APPROVED` and `REJECTED` if they exist in the step folder
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/capabilities/review-code.ts` — simplify write allowlist; add `prepareSession` to `CAPABILITY_CONFIG`

### Step 6: Require YAML frontmatter in the review prompt

**Description:** Update `src/prompts/review-code.md` Step 7 to require YAML frontmatter at the top of `REVIEW.md`. The agent must write a `---` block containing `decision`, `criticalIssues`, `highIssues`, `mediumIssues`, and `lowIssues` fields before any markdown headings. Update Step 8 to instruct the agent that it only writes `REVIEW.md` — marker files (`APPROVED`/`REJECTED`) are created automatically by `pio_mark_complete`, so the agent should no longer write or delete them manually.

**Acceptance criteria:**
- [ ] Step 7 includes the YAML frontmatter format with all required fields and example structure
- [ ] Step 8 removes manual marker instructions (no more "write APPROVED file" or "delete COMPLETED")
- [ ] Step 8 instructs agent to call `pio_mark_complete` — automation handles markers
- [ ] Human-readable `## Decision` section is still required in the markdown body

**Files affected:**
- `src/prompts/review-code.md` — update Steps 7 and 8 with frontmatter format and simplified instructions

### Step 7: Implement automatic marker creation at `pio_mark_complete`

**Description:** This is the core automation step. In `src/capabilities/validation.ts`, modify the `pio_mark_complete` execute handler so that when validation passes *and* the capability is `review-code`, it performs: (1) **Add dependency** — install `js-yaml` in `package.json`. (2) **Parse frontmatter** — read `S{NN}/REVIEW.md`, extract the YAML frontmatter block, parse it with js-yaml. Validate all required fields exist (`decision`, `criticalIssues`, `highIssues`, `mediumIssues`, `lowIssues`). If missing or malformed, return a validation failure with guidance for the agent to fix REVIEW.md. (3) **Create markers** — if decision is `APPROVED`: create empty `S{NN}/APPROVED`. If `REJECTED`: create empty `S{NN}/REJECTED` and delete `S{NN}/COMPLETED`. (4) **validateState** — after marker creation, verify exactly one of `APPROVED` or `REJECTED` exists and it matches the `decision` field. Report failure if inconsistent.

**Acceptance criteria:**
- [ ] `js-yaml` is added to dependencies in `package.json` and importable from `validation.ts`
- [ ] Frontmatter parsing extracts decision and issue counts from REVIEW.md for review-code sessions
- [ ] Missing/malformed frontmatter returns a validation failure with actionable guidance text
- [ ] APPROVED decision creates `S{NN}/APPROVED`, leaves `COMPLETED` intact
- [ ] REJECTED decision creates `S{NN}/REJECTED`, deletes `S{NN}/COMPLETED`
- [ ] validateState verifies marker consistency after creation (exactly one marker exists, matches decision)
- [ ] Non-review-code sessions are unaffected (validation behaves as before)
- [ ] `npm run check` reports no type errors

**Files affected:**
- `package.json` — add `js-yaml` dependency
- `src/capabilities/validation.ts` — add frontmatter parsing, marker creation logic, and validateState in the `pio_mark_complete` execute handler

## Notes

- **File-protection interaction:** Step 5 removes `APPROVED` from the write allowlist. The review agent might still try to create it (old habit from the prompt). This is resolved because Step 6 updates the prompt to tell the agent not to write markers — but there's a brief period during development where the old prompt is live and the new allowlist is active. Since `validation.ts` also permits writes inside the session's own goal workspace directory, writing `APPROVED` will still succeed even without explicit allowlist entry (the default-deny rule permits writes within workingDir). Verify this behavior during implementation.

- **js-yaml ESM compatibility:** `js-yaml` supports ESM imports. Use `import * as jsyaml from "js-yaml"` or the named import pattern — verify it resolves correctly under pi's jiti runtime.

- **Backwards compatibility with existing REVIEW.md files:** Old `REVIEW.md` files without frontmatter will fail validation when an agent calls `pio_mark_complete`. This is intentional — the new prompt (Step 6) ensures all future reviews include frontmatter. Any in-progress reviews using the old prompt will need to be re-done or manually updated.

- **validateState failure handling:** If validateState detects inconsistency after marker automation, return a validation failure from `pio_mark_complete`. This blocks session exit — consistent with existing behavior for other validation failures. The agent must fix REVIEW.md and retry.
