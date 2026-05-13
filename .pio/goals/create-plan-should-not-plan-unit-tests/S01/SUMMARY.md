# Summary: Add test-responsibility boundary guidance to create-plan prompt

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/create-plan.md` — Modified the Guidelines section to enforce the test-responsibility boundary between create-plan, evolve-plan, and execute-task

## Files Deleted
- (none)

## Changes Detail

Replaced one guideline ("Specify how each step is verified — don't write tests yourself.") with two new guidelines:

1. **Reworded acceptance-criteria guideline:** "Acceptance criteria verify completion — they do not plan tests." Clarifies that acceptance criteria describe programmatic verification of step completion, not test implementation.

2. **New prohibition guideline:** "You must not create dedicated plan steps for writing unit tests." Explicitly states that per-step unit testing belongs to `evolve-plan` (TEST.md) and `execute-task`. Includes an exception allowing integration verification steps that span multiple plan steps. Contains 5 concrete examples (3 Good, 2 Bad) distinguishing acceptable acceptance criteria from test-planning language.

## Decisions Made
- Placed the new guidelines immediately after the existing "Acceptance criteria are mandatory" guideline so they read as a coherent block about verification responsibility.
- Used "must not" (not "should avoid") for unambiguous prohibition language.
- Used inline "Good:" / "Bad:" prefixes for examples, matching the format specified in TASK.md and verifiable by TEST.md grep patterns.
- Added 3 Good examples and 2 Bad examples (slightly more than the minimum required) to provide clear disambiguation.

## Test Coverage
All programmatic verification checks from TEST.md pass:
- Prohibition statement with `must not` language: ✅ (1 match)
- References to `evolve-plan`: ✅ (2 matches)
- References to `TEST.md`: ✅ (2 matches)
- Integration exception language: ✅ (1 match each for "integration" and "cross-module/end-to-end")
- Good examples (≥ 2): ✅ (3 found)
- Bad examples (≥ 1): ✅ (2 found)
- Ambiguous phrase "don't write tests yourself" removed: ✅ (0 matches)
- `npm run check` (tsc --noEmit): ✅ (exit code 0)
- Only `src/prompts/create-plan.md` modified: ✅
