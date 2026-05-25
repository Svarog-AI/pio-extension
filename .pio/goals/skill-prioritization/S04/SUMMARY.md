# Summary: Wire capability-specific skill configs

## Status
COMPLETED

## Files Created
- `src/capabilities/test-no-skills-cap.ts` — test-only capability without skills (for passthrough test in capability-config.test.ts)

## Files Modified
- `src/capabilities/create-goal.ts` — added `skills` with mandatory: [pio-planning, grill-me, pio-git] and recommended: [source-research]
- `src/capabilities/create-plan.ts` — added `skills` with mandatory: [pio-planning, grill-me] and recommended: [source-research]
- `src/capabilities/evolve-plan.ts` — added `skills` with mandatory: [pio-planning, grill-me] (no recommended)
- `src/capabilities/execute-task.ts` — added `skills` with mandatory: [test-driven-development, pio-git] (no recommended)
- `src/capabilities/review-task.ts` — added `skills` with mandatory: [test-driven-development] (no recommended)
- `src/capabilities/execute-plan.ts` — added `skills` with mandatory: [test-driven-development, pio-git] (no recommended)
- `src/capabilities/revise-plan.ts` — added `skills` with mandatory: [pio-planning, grill-me] and recommended: [source-research]
- `src/capabilities/project-context.ts` — added `skills` with mandatory: [pio-project-knowledge] and recommended: [source-research]
- `src/capabilities/finalize-goal.ts` — added `skills` with mandatory: [pio-project-knowledge, pio-git] (no recommended)
- `src/capability-config.test.ts` — updated test that assumed create-plan had no skills to verify it now has correct skills

## Files Deleted
- `src/capabilities/capability-skills.test.ts` — deleted per user feedback: brittle snapshot tests of static config values that TypeScript already validates structurally

## Decisions Made
- `skills` field placed after `prompt` in all 9 config objects for consistency
- `recommended` key omitted entirely when no recommended skills exist (not an empty array)
- Consistent condition text for source-research across create-goal, create-plan, and revise-plan: `"when researching existing solutions or libraries"`
- project-context uses different condition: `"when researching project dependencies or external tools"`
- Updated pre-existing test in `capability-config.test.ts` that assumed create-plan had no skills

## User-Requested Changes
- User identified `capability-skills.test.ts` as brittle snapshot tests of static config values. Deleted the test file. TypeScript (`npx tsc --noEmit`) is the correct guard for config structure. Created `test-no-skills-cap.ts` to preserve the config-resolution passthrough test in `capability-config.test.ts`.

## Test Coverage
- No unit tests for this step — skill-to-capability mapping is static declarative data. TypeScript validates structure; manual verification against TASK.md mapping table confirms correctness.
- Full test suite (705 tests) passes with no regressions
- `npx tsc --noEmit` reports zero errors
