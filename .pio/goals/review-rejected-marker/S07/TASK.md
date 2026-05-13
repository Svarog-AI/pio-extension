# Task: Implement automatic marker creation at `pio_mark_complete`

Add frontmatter parsing, automatic marker file creation, and post-creation state validation to the `pio_mark_complete` execute handler — scoped to `review-code` sessions only.

## Context

Currently `pio_mark_complete` validates that declared output files exist (`validateOutputs`) but does not parse `REVIEW.md` content, create marker files, or enforce state consistency. Step 3 added the `REJECTED` check to transitions, and Step 6 updated the review prompt to require YAML frontmatter in `REVIEW.md`. This step implements the core automation: when a `review-code` session calls `pio_mark_complete`, the infrastructure reads the frontmatter from `REVIEW.md`, creates the correct marker file (`APPROVED` or `REJECTED`), manages `COMPLETED`, and verifies final state consistency.

## What to Build

In `src/capabilities/validation.ts`, extend the `pio_mark_complete` execute handler with review-code-specific automation that runs **after** `validateOutputs` passes:

1. **Install `js-yaml`** — add `js-yaml` as a dependency in `package.json` for YAML parsing.
2. **Parse frontmatter** — read `S{NN}/REVIEW.md`, extract the YAML block between the first `---` and second `---`, parse with `js-yaml.load()`. Validate all required fields: `decision` (must be `"APPROVED"` or `"REJECTED"`), `criticalIssues`, `highIssues`, `mediumIssues`, `lowIssues` (must be integers). If frontmatter is missing, malformed, or has invalid values, return a validation failure with actionable guidance text.
3. **Create markers based on decision** — if `decision === "APPROVED"`: create empty `S{NN}/APPROVED`. If `decision === "REJECTED"`: create empty `S{NN}/REJECTED` and delete `S{NN}/COMPLETED` (so `isStepReady` in `execute-task.ts` permits re-execution).
4. **validateState** — after marker creation, verify exactly one of `APPROVED` or `REJECTED` exists on disk, and that it matches the `decision` field from frontmatter. If inconsistent, return a validation failure: "Review state is inconsistent after automation."

### Code Components

#### `parseReviewFrontmatter(reviewPath: string): ReviewFrontmatter | null`

Extracts and parses YAML frontmatter from a REVIEW.md file. Returns `null` if the file doesn't start with `---` or if the YAML block cannot be parsed. On success, returns an object with `decision`, `criticalIssues`, `highIssues`, `mediumIssues`, `lowIssues`.

Interface:
```typescript
interface ReviewFrontmatter {
  decision: "APPROVED" | "REJECTED";
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
}
```

#### `validateReviewFrontmatter(frontmatter: ReviewFrontmatter): string | null`

Validates that all required fields exist and have correct types. Returns `null` on success, or an error message string describing what's wrong. Checks: `decision` is exactly `"APPROVED"` or `"REJECTED"`, all count fields are non-negative integers.

#### `applyReviewDecision(workingDir: string, stepNumber: number, frontmatter: ReviewFrontmatter): void`

Creates marker files based on the parsed decision. For APPROVED: writes empty `S{NN}/APPROVED`. For REJECTED: writes empty `S{NN}/REJECTED` and deletes `S{NN}/COMPLETED`. Uses `fs.writeFileSync` and `fs.rmSync` (force:true for deletions).

#### `validateReviewState(workingDir: string, stepNumber: number, expectedDecision: "APPROVED" | "REJECTED"): boolean`

Post-creation consistency check. Verifies exactly one of `APPROVED`/`REJECTED` exists in `S{NN}/` and it matches `expectedDecision`. Returns `true` if consistent, `false` otherwise.

### Integration into `pio_mark_complete` execute handler

After the existing `validateOutputs(rules, dir)` check passes (inside the `if (result.passed)` branch), add review-code-specific automation:

```
// Pseudocode — not implementation code
if capability is "review-code" and stepNumber is defined:
  reviewPath = S{NN}/REVIEW.md in workingDir
  frontmatter = parseReviewFrontmatter(reviewPath)
  if frontmatter is null: return validation failure (missing/malformed frontmatter)

  error = validateReviewFrontmatter(frontmatter)
  if error is not null: return validation failure with error text

  applyReviewDecision(workingDir, stepNumber, frontmatter)

  consistent = validateReviewState(workingDir, stepNumber, frontmatter.decision)
  if not consistent: return validation failure (state inconsistent)

// Continue to existing auto-enqueue logic (unchanged)
```

For non-review-code sessions, behavior is unchanged — the automation block is skipped entirely.

### Approach and Decisions

- **Frontmatter extraction:** Split on `---` delimiters. The file must start with `---\n`. Find the second `---` line. Content between them is the raw YAML string. This avoids regex complexity and handles edge cases (empty lines, whitespace) correctly.
- **Use `js-yaml.load()` not `.safeLoad()`:** Modern `js-yaml` uses `.load()` as the safe default. `.safeLoad()` may still exist but `.load()` is the current API. Import pattern: `import * as jsyaml from "js-yaml"`.
- **Error messages must be actionable:** When frontmatter validation fails, provide specific guidance text that tells the agent exactly what to fix (e.g., "The `decision` field must be either `APPROVED` or `REJECTED`. Found: `<value>`.").
- **Use existing utilities:** Use `stepFolderName(stepNumber)` from `utils.ts` for folder naming. Use `path.join` consistently. The working directory is already available from `config.workingDir`.
- **Export new functions for testability:** Export `parseReviewFrontmatter`, `validateReviewFrontmatter`, `applyReviewDecision`, and `validateReviewState` so they can be unit-tested independently.
- **js-yaml ESM compatibility:** `js-yaml` supports ESM. Use `import * as jsyaml from "js-yaml"`. If pi's jiti runtime has issues, fall back to dynamic import: `const jsyaml = await import("js-yaml")`.

## Dependencies

- Step 3 (transition logic with REJECTED check) — completed
- Step 5 (write allowlist simplified for review-code) — completed
- Step 6 (review prompt requires YAML frontmatter) — completed

## Files Affected

- `package.json` — add `js-yaml` dependency
- `src/capabilities/validation.ts` — add `parseReviewFrontmatter`, `validateReviewFrontmatter`, `applyReviewDecision`, `validateReviewState`; extend `pio_mark_complete` execute handler with review-code automation block

## Acceptance Criteria

- [ ] `js-yaml` is added to dependencies in `package.json` and importable from `validation.ts`
- [ ] Frontmatter parsing extracts decision and issue counts from REVIEW.md for review-code sessions
- [ ] Missing/malformed frontmatter returns a validation failure with actionable guidance text
- [ ] APPROVED decision creates `S{NN}/APPROVED`, leaves `COMPLETED` intact
- [ ] REJECTED decision creates `S{NN}/REJECTED`, deletes `S{NN}/COMPLETED`
- [ ] validateState verifies marker consistency after creation (exactly one marker exists, matches decision)
- [ ] Non-review-code sessions are unaffected (validation behaves as before)
- [ ] `npm run check` reports no type errors

## Risks and Edge Cases

- **js-yaml ESM compatibility:** The pi jiti runtime may have quirks with third-party ESM packages. Test the import early — if `import * as jsyaml from "js-yaml"` fails, switch to dynamic `await import("js-yaml")` inside the execute handler.
- **Frontmatter edge cases:** REVIEW.md might have extra whitespace before/after `---`, or the YAML block might contain unexpected keys. The parser should be tolerant of extra keys but strict about required ones.
- **COMPLETED already deleted:** If `COMPLETED` was somehow already deleted before `pio_mark_complete` runs (e.g., agent manually deleted it), the REJECTED path's `fs.rmSync(COMPLETED, { force: true })` handles this gracefully — no crash on missing file.
- **Both APPROVED and REJECTED exist before automation:** Step 5's `prepareSession` deletes stale markers on startup, but if a race condition or manual intervention creates both files, the marker creation should overwrite cleanly (writing empty files). The `validateState` check catches inconsistency afterward.
- **YAML parsing errors:** `js-yaml.load()` throws on invalid YAML. Wrap in try/catch and return null/error — don't let raw exceptions propagate to the agent.
