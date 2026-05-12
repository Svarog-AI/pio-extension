# Task: Register skill in `src/index.ts`

Add the `test-driven-development` skill directory to the `skillPaths` array so pi's `resources_discover` handler returns it alongside the existing `pio` skill.

## Context

The pio extension discovers skills at startup via the `resources_discover` event handler in `src/index.ts`. Currently only one skill (`pio`) is registered. Step 2 (approved) created the complete SKILL.md at `src/skills/test-driven-development/SKILL.md`. This step makes that new skill discoverable by pi so it appears in the `<available_skills>` section of the default system prompt.

## What to Build

A single-line addition to the `skillPaths` array in `src/index.ts`. The array currently contains one entry:

```typescript
const skillPaths = [
  path.join(SKILLS_DIR, "pio"),
];
```

Add a second entry following the exact same pattern.

### Code Components

No new functions or modules. The change is a data-level addition to an existing array literal:

- **`skillPaths` array in `src/index.ts`:** Append `path.join(SKILLS_DIR, "test-driven-development")` as a second element, placed after the `"pio"` entry.

### Approach and Decisions

- Follow the existing pattern exactly: `path.join(SKILLS_DIR, "<name>")`.
- `SKILLS_DIR` is already defined at module level (`path.join(__dirname, "skills")`) — no path resolution logic changes needed.
- Place the new entry after `"pio"` to maintain alphabetical-ish ordering (both skills start with different letters but `pio` was first).
- No import changes are required — this is a string path, not a module import.

## Dependencies

- **Step 2 must be completed:** `src/skills/test-driven-development/SKILL.md` must exist before this registration is meaningful. Step 2 is APPROVED.

## Files Affected

- `src/index.ts` — modified: add `path.join(SKILLS_DIR, "test-driven-development")` to the `skillPaths` array

## Acceptance Criteria

- [ ] `src/index.ts` contains `path.join(SKILLS_DIR, "test-driven-development")` in the `skillPaths` array
- [ ] The entry follows the existing convention (same format as the `"pio"` entry — uses `path.join`, references `SKILLS_DIR`)
- [ ] `npm run check` reports no TypeScript errors

## Risks and Edge Cases

- **Trailing comma:** If adding a second element to an array literal, ensure proper comma placement (both entries should be comma-separated).
- **Path correctness:** The directory name must match exactly: `test-driven-development` (with hyphens), matching the actual filesystem directory created in Step 2.
- **No accidental reformatting:** Keep surrounding code unchanged — this is a minimal surgical edit to a single array.
