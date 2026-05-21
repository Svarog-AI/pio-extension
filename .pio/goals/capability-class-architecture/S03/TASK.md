# Task: Write recommendation and conclusion

Synthesize the analysis from Steps 1 and 2 into a clear, evidence-based recommendation in ANALYSIS.md.

## Context

The pio-extension capability system uses a config-object + callback pattern (`CAPABILITY_CONFIG: StaticCapabilityConfig` per module). This goal evaluates whether refactoring to a class-based design (Variant A: configurable instances, or Variant B: inheritance subclasses) would provide meaningful benefits. Steps 1 and 2 produced quantitative baseline data and analyzed both variants against 8 research questions. Step 3 finalizes the evaluation with an explicit recommendation.

## What to Build

Append a **"Decision"** section to `ANALYSIS.md` (the same file created in Step 1 and extended in Step 2). This section must synthesize all findings into one clear recommendation.

### The Decision Section Must Contain

1. **Explicit recommendation statement.** A single unambiguous sentence: "Recommend Variant A", "Recommend Variant B", or "Reject the refactor". Do not hedge — pick one direction.

2. **Summary of evidence.** For each of the 8 research questions, state which approach wins and why, citing specific findings from the Variant Analysis section. Reference concrete numbers:
   - Line counts from Step 1 (e.g., "2,185 total lines, ~37% boilerplate")
   - Boilerplate savings estimates (e.g., "~100–150 lines saved by Variant A, ~12–18% of boilerplate")
   - Testing impact findings (e.g., "current pure functions require zero mocking vs class instantiation overhead")

3. **What the current pattern gets right.** Acknowledge the strengths of the existing config-object + callback approach. Cite specific advantages identified in the analysis (e.g., natural handling of all three capability shapes, optional lifecycle hooks without empty overrides, `CAPABILITY_CONFIG` as a declarative summary).

4. **Identified risks of refactoring.** Enumerate concrete risks: construction-order problems (`this` binding), `.bind(this)` runtime errors, increased test setup complexity, meaningless inheritance for non-session capabilities, dynamic import compatibility with `resolveCapabilityConfig()`.

5. **If recommending a class-based variant:** Include a concrete TypeScript interface sketch showing the chosen direction's final form. Explain which current modules would map to it and how. This is unlikely given the analysis but must be addressed if the evidence supports it.

6. **If rejecting the refactor:** Provide clear justification referencing specific findings. Example phrasing: "Callbacks express variation points adequately — optional lifecycle hooks (`prepareSession`, `postValidate`) are used by only 3 of 10 capabilities, making method overrides counterproductive." Or: "No polymorphic behavior is needed — each capability's tool execute logic and validation are inherently unique, preventing meaningful factorization into a base class."

7. **Future work (optional but recommended).** If the analysis identified orthogonal improvements (e.g., declarative transition registry instead of the `resolveTransition()` switch in `state-machine.ts`), recommend these as separate future goals rather than bundling them with a class refactor. This is not part of the core deliverable but adds value if the evidence supports it.

### Code Components

There are no code components to implement. This step produces a single markdown section. However, the Decision section must demonstrate deep familiarity with the actual codebase:
- Reference real file names (`review-task.ts`, `session-capability.ts`, `capability-config.ts`)
- Reference real type names (`StaticCapabilityConfig`, `ConfigCallback<T>`, `PostValidateCallback`)
- Reference real function signatures (`launchCapability(ctx, config)`, `resolveCapabilityConfig(cwd, params)`)
- Cite the Summary Table from Step 2 accurately

### Approach and Decisions

- **Read DECISIONS.md** (`S03/DECISIONS.md`) for accumulated decisions from Steps 1–2. Key context: corrected line count (2,185), boilerplate percentage (~37%), `.bind(this)` problem for Variant B, three capability categories.
- **Base the recommendation on evidence, not preference.** The analysis data heavily favors one direction. Follow where the numbers lead — do not force a class-based recommendation if the evidence says "reject".
- **Be specific, not generic.** Avoid phrases like "classes add indirection" without citing which indirection (e.g., "the `.bind(this)` requirement for config callbacks in Variant B adds ~30 extra lines to `ReviewTaskCapability` alone").
- **Keep the Decision section self-contained.** A reader should understand the recommendation by reading only the Decision section, without needing to re-read the full Variant Analysis. Summarize key findings inline rather than just pointing back.
- **Write directly to ANALYSIS.md.** Do not create a separate file. The Decision is the final section of the existing analysis document.

## Dependencies

- **Step 1 (Catalog current capability patterns):** Provides line counts, boilerplate breakdown, and capability categorization. Required for quantitative references.
- **Step 2 (Evaluate Variant A vs Variant B):** Provides comparative analysis of all 8 research questions, TypeScript sketches, and the Summary Table. Required for evidence-based recommendations.

## Files Affected

- `.pio/goals/capability-class-architecture/ANALYSIS.md` — modified: append "Decision" section at the end (after the Summary Table)

## Acceptance Criteria

- [ ] ANALYSIS.md contains a "Decision" section with explicit recommendation (Variant A, Variant B, or Reject)
- [ ] Recommendation references specific findings from earlier sections (cites line counts, testing analysis, etc.)
- [ ] If recommending a class-based approach: includes concrete interface sketch of chosen direction
- [ ] If rejecting: provides clear justification (e.g., "callbacks express variation points adequately", "no polymorphic behavior needed")

## Risks and Edge Cases

- **Forcing a conclusion:** The executor might feel pressure to recommend a class-based approach because the goal is named "capability-class-architecture". Rejecting the refactor is explicitly stated as a valid outcome in GOAL.md. Follow the evidence.
- **Being too brief:** The Decision section must synthesize, not just summarize. It should explain *why* the recommendation follows from the analysis, not just restate which question favors which approach.
- **Missing future work:** The transition system (`resolveTransition()` switch) was identified as an orthogonal extensibility bottleneck in Q7. If rejecting the refactor, mention that a declarative transition registry is a better incremental improvement than a class hierarchy.
