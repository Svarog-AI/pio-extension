# Tests: Evaluate Variant A vs Variant B against all research questions

## Programmatic Verification

All verification is structural checks on ANALYSIS.md — this is a research and analysis task with no source code changes.

- **What:** "Variant Analysis" section heading exists in ANALYSIS.md
  **How:** `grep -c "Variant Analysis" .pio/goals/capability-class-architecture/ANALYSIS.md`
  **Expected result:** Output is ≥ 1

- **What:** All 6 research questions are addressed (pattern capture, boilerplate reduction, testing impact, type safety, lifecycle hooks, non-session capabilities)
  **How:** For each keyword below, verify presence: `Pattern capture`, `Boilerplate`, `Testing`, `Type safety`, `Lifecycle`, `Non-session` (case-insensitive search in ANALYSIS.md)
  **Expected result:** Each keyword has ≥ 1 occurrence

- **What:** Variant A is explicitly discussed with a class sketch
  **How:** `grep -c "Variant A" .pio/goals/capability-class-architecture/ANALYSIS.md` and verify presence of a TypeScript class declaration (e.g., `class SessionCapability`) in the file
  **Expected result:** "Variant A" mentioned ≥ 3 times; at least one `class` or `interface` keyword appears

- **What:** Variant B is explicitly discussed with a class sketch
  **How:** `grep -c "Variant B" .pio/goals/capability-class-architecture/ANALYSIS.md` and verify presence of TypeScript class inheritance (e.g., `extends`) in the file
  **Expected result:** "Variant B" mentioned ≥ 3 times; at least one `extends` keyword appears

- **What:** Current pattern is referenced as a comparison baseline in each question
  **How:** Verify the word "current" or "existing" appears in proximity to each research question subsection (visual inspection of section structure)
  **Expected result:** All 6 subsections reference the current pattern, not just the two variants

- **What:** Boilerplate comparison references concrete numbers from Step 1
  **How:** `grep -E "[0-9]+ lines|[0-9]+%" .pio/goals/capability-class-architecture/ANALYSIS.md` — verify numeric references exist in the Variant Analysis section (not just Current Patterns)
  **Expected result:** At least 3 numeric references in the Variant Analysis section

- **What:** Both variants address non-session capabilities (init, delete-goal, etc.)
  **How:** `grep -E "init|delete.goal|list.goals|parent|next-task" .pio/goals/capability-class-architecture/ANALYSIS.md` — verify at least one non-session capability is named in the Variant Analysis context
  **Expected result:** ≥ 2 non-session capability names referenced

## Manual Verification

- **What:** TypeScript sketches are plausible — use real type names from `src/types.ts`, not invented names
  **How:** Cross-reference any types in the sketches (e.g., `StaticCapabilityConfig`, `ExtensionAPI`, `CapabilityConfig`) against `src/types.ts` and `src/capabilities/session-capability.ts`

- **What:** Each research question subsection provides a genuine comparison — not just descriptions of each variant, but an explicit assessment of which is better for that dimension
  **How:** Read through all 6 subsections; each should contain language indicating a judgment (e.g., "Variant A wins here because...", "no meaningful difference", "current pattern remains superior")

- **What:** Boilerplate numbers cited are consistent with Step 1 data or corrected per the review findings
  **How:** Cross-check any line counts or percentages against the individual capability line counts in the ANALYSIS.md inventory table (which were confirmed accurate by `wc -l`)

## Test Order

Run programmatic verification checks first. If any fail, revise ANALYSIS.md before proceeding to manual verification. Manual verification confirms quality — programmatic checks confirm structure.
