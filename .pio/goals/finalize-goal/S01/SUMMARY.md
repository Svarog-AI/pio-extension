# Summary: Create pio-project-knowledge skill

## Status
COMPLETED

## Files Created
- `src/skills/pio-project-knowledge/SKILL.md` — Shared knowledge source documenting the 7 `.pio/PROJECT/*.md` files: canonical paths, section structure, and update rules for routing decisions during finalization

## Files Modified
- (none)

## Files Deleted
- (none)

## Decisions Made
- **Section structure derived from two sources:** Combined the Phase 2 output templates from `src/prompts/project-context.md` with the actual headings observed in the 7 existing `.pio/PROJECT/` files to produce canonical section descriptions
- **Update rules organized as tables per PROJECT file:** Each table maps decision categories to target file + section + action, making them easy for the finalize-goal agent to evaluate decisions against
- **Decision Filtering section added:** Provides explicit guidance on what to skip (implementation-only details, local design choices, one-off decisions) to prevent forced or low-value updates
- **YAML frontmatter follows existing SKILL.md format:** Matches the `name`/`description` pattern from `src/skills/pio/SKILL.md` and `src/skills/test-driven-development/SKILL.md`
- **Description uses "Use when..." pattern:** Follows the convention of existing skills — describes when to load the skill and which capabilities (`project-context`, `finalize-goal`) are most likely to need it

## Test Coverage
- File existence: `test -f src/skills/pio-project-knowledge/SKILL.md` — PASS
- YAML frontmatter `name: pio-project-knowledge` — PASS
- YAML frontmatter `description` non-empty — PASS
- All 7 PROJECT files referenced with canonical paths (`.pio/PROJECT/*.md`) — PASS (all 7)
- "Update Rules" section exists — PASS
- PROJECT file references count ≥ 7 — PASS (22 references)
- TypeScript compilation (`npx tsc --noEmit`) — PASS (exit code 0)
- All existing tests (`npm test`) — PASS (449/449)
