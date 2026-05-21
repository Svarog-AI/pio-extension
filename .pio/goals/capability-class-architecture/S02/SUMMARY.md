# Summary: Evaluate Variant A vs Variant B against all research questions

## Status
COMPLETED

## Files Created
- (none — this was a research and analysis task)

## Files Modified
- `.pio/goals/capability-class-architecture/ANALYSIS.md` — appended "Variant Analysis" section containing:
  - TypeScript interface/class sketches for both Variant A (configurable instances) and Variant B (inheritance subclasses)
  - Analysis of all 8 research questions (including ad hoc Q7: Extensibility, Q8: Readability) with explicit comparison of current pattern, Variant A, and Variant B
  - Comparative judgment for each question
  - Summary table consolidating all findings

## Decisions Made
- **Corrected total line count:** Used 2,185 lines (verified sum of individual `wc -l` counts) instead of the incorrect 2,330 stated in Step 1
- **Boilerplate percentage:** Recalculated as ~37% (~817/2,185 lines) based on individual module estimates
- **Variant A sketch:** Designed as a `SessionCapability` class accepting `SessionCapabilityDefinition` config, with a separate `ToolCapability` abstract base for non-session capabilities
- **Variant B sketch:** Designed as an abstract `SessionCapability` base with `CreateGoalCapability` and `ReviewTaskCapability` example subclasses, demonstrating the `.bind(this)` problem for config callbacks
- **7 of 8 questions conclude current pattern is superior:** Pattern capture (Q1), testing impact (Q3), type safety (Q4), lifecycle hooks (Q5), non-session capabilities (Q6), and extensibility (Q7) all favor the current pattern. Only boilerplate reduction (Q2) gives Variant A a modest edge (~12–18% of boilerplate), which is insufficient to justify the refactor
- **Q7 (Extensibility) key finding:** Adding a new capability is a 4-step explicit process (create module, wire in `index.ts`, add prompt, wire transitions). The transition system (`resolveTransition()` switch in `state-machine.ts`) is the main extensibility bottleneck — but this is orthogonal to the class-vs-config debate. A declarative transition registry would fix it without restructuring capabilities
- **Q8 (Readability) key finding:** Trade-off between declarative summary (`CAPABILITY_CONFIG` as "table of contents" in current pattern) and procedural clarity (lifecycle methods in execution order in Variant B). Variant B wins for lifecycle hook discoverability — named method overrides (`prepareSession`, `postValidate`) are more immediately understandable than tracing callback names through a config object. Current pattern wins for quick scanning — `CAPABILITY_CONFIG` summarizes the full session shape in one block

## Test Coverage
- All 7 programmatic verification checks from TEST.md pass:
  - "Variant Analysis" heading present
  - All 6 research question keywords present (Pattern capture, Boilerplate, Testing, Type safety, Lifecycle, Non-session)
  - Variant A mentioned ≥ 3 times (30) with class/interface keywords (63)
  - Variant B mentioned ≥ 3 times (24) with `extends` keyword (4)
  - Current pattern referenced throughout (19 occurrences)
  - Numeric references in Variant Analysis section (20+ references)
  - Non-session capability names referenced (init, delete-goal, list-goals, next-task, parent)
- Manual verification: all TypeScript types cross-referenced against `src/types.ts`, all function names verified against source files, all 6 subsections contain explicit comparative judgments
