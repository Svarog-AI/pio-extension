# Summary: Rewrite grill-me skill as a reusable technique guide

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/skills/grill-me/SKILL.md` — complete rewrite from ~9 lines to 72-line technique guide covering four usage contexts (goal definition, plan creation, plan revision, reactive stress-testing), shared probing techniques, relationships with pio-planning and ask-user skills, and anti-patterns

## Files Deleted
- (none)

## Decisions Made
- Description field kept to 389 chars (well under 1024 limit) to fit all four context triggers in a single line
- Structured the skill with: Relationship with other skills → Usage contexts → Shared probing techniques → Anti-patterns
- Used context-describing language ("when validating assumptions after research...") instead of capability names to stay capability-agnostic
- Referenced pio-planning and ask-user by skill name only, not by file paths
- Kept file at 72 lines (under the 100-line threshold, no need for REFERENCE.md split)

## User-Requested Changes
- User requested removing the "Relationship with other skills" section — it was unnecessary overhead and the self-reference ("grill-me (this skill)") was ridiculous. Folded the pio-planning timing-vs-technique distinction into the intro paragraph. Added ask-user skill reference inline in the shared techniques section. Modified `src/skills/grill-me/SKILL.md`.

## Test Coverage
- No unit tests apply — per the TDD skill, content-based tests for `.md` files are excluded as they break on any rewording without indicating a behavioral regression
- Programmatic verification: `npm run check` (tsc --noEmit) passes, `npm test` (674 tests) passes with no regressions
- Acceptance criteria verified via grep/wc checks: description mentions all four contexts, no capability-specific filenames, four dedicated context sections, references to both pio-planning and ask-user, timing vs. technique distinction stated
