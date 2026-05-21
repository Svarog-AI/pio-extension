# Task: Evaluate Variant A vs Variant B against all research questions

Analyze both class-based variants (configurable instances and inheritance-based subclasses) against the six research questions from GOAL.md, producing rough TypeScript interface/class sketches to ground the comparison.

## Context

The capability system currently uses a module-per-capability pattern: each of 15 modules exports a `CAPABILITY_CONFIG: StaticCapabilityConfig` object and a `setupXxx(pi)` function. Step 1 cataloged all capabilities and quantified boilerplate (~42% across all modules, ranging from 20% in complex modules like `review-task.ts` to 74% in simple ones like `project-context.ts`). This step evaluates whether either of two class-based variants actually improves on the current pattern.

## What to Build

Append a "Variant Analysis" section to `ANALYSIS.md`. For each of the six research questions, compare all three approaches (current pattern, Variant A, Variant B) and include TypeScript interface/class sketches for both variants.

### Code Components

#### Variant Analysis Section Structure

For each of the 6 research questions, produce a subsection containing:
- **Current pattern assessment:** How does the existing config-object + callback approach handle this dimension?
- **Variant A (configurable instances) assessment:** How would a `SessionCapability` class instantiated with per-capability config handle this?
- **Variant B (inheritance subclasses) assessment:** How would subclassing a base `SessionCapability` class handle this?
- **Comparative judgment:** Which approach is superior for this dimension, or is there no meaningful difference?

#### TypeScript Interface/Class Sketches

Produce rough type stubs (no implementations) for both variants. These should be grounded in real code — use actual type names (`StaticCapabilityConfig`, `CapabilityConfig`, `ExtensionAPI`) and real function signatures from the codebase.

**Variant A sketch** should show:
- A `SessionCapability` class with a constructor accepting capability-specific config
- How current `CAPABILITY_CONFIG` fields map to instance properties or methods
- How lifecycle hooks (`prepareSession`, `postValidate`, `postExecute`) are expressed
- How non-session capabilities (init, delete-goal, etc.) fit — as a separate `ToolCapability` class? As special cases?

**Variant B sketch** should show:
- A base `SessionCapability` class with overridable methods for each lifecycle phase
- 1–2 example subclasses (e.g., `CreateGoalCapability`, `ReviewTaskCapability`) showing method overrides
- How non-session capabilities fit — as a `ToolCapability` base? As orphans outside the hierarchy?

### Approach and Decisions

- **Reference real types from `src/types.ts`:** Use actual type names (`StaticCapabilityConfig`, `CapabilityConfig`, `ConfigCallback<T>`, lifecycle callback types). Do not invent new module names.
- **Reference real function signatures:** When sketching variants, base method signatures on the actual functions you read (e.g., `launchCapability(ctx, config)`, `resolveCapabilityConfig(cwd, params)`).
- **Use Step 1 numbers for boilerplate comparison (Question 2):** Reference concrete line counts from ANALYSIS.md's "Current Patterns" section. But verify totals against individual values — the review noted arithmetic errors in the stated totals (2,330 vs actual 2,185). When citing totals, use the correct sum.
- **Address the `next-task.ts` nuance:** The review identified that `next-task.ts` calls `launchCapability()` despite being categorized as non-session. Factor this into Question 6 (non-session capabilities) — it doesn't define its own config but does need session-launch support.
- **Reference actual test patterns:** When evaluating testing impact (Question 3), reference real `.test.ts` files — how are pure functions like `prepareGoal`, `applyReviewDecision`, or `isStepReviewable` tested today? What would change if they became class methods requiring instance construction?

## Dependencies

- **Step 1 must be completed:** Requires ANALYSIS.md "Current Patterns" section with line counts, boilerplate breakdown, and capability categorization.

## Files Affected

- `.pio/goals/capability-class-architecture/ANALYSIS.md` — appended: "Variant Analysis" section with all 6 research questions + TypeScript sketches for both variants

## Acceptance Criteria

- [ ] ANALYSIS.md contains a "Variant Analysis" section addressing all 6 research questions
- [ ] Each question has explicit comparison of Variant A, Variant B, and current pattern
- [ ] Both variants include rough TypeScript interface/class sketches (type stubs only)
- [ ] Boilerplate comparison references concrete numbers from Step 1

## Risks and Edge Cases

- **Arithmetic errors in Step 1 data:** The review flagged that total line counts are incorrect (stated 2,330 vs actual 2,185). Verify any numbers before citing them in the variant analysis.
- **Hybrid capabilities complicate categorization:** `goal-from-issue.ts` uses `launchCapability()` without its own `CAPABILITY_CONFIG`. `next-task.ts` also calls `launchCapability()`. Both challenge a clean session-based vs non-session dichotomy.
- **Don't over-sketch:** The sketches should illustrate the architectural shape — not become pseudo-implementations. Keep type stubs to interfaces and class declarations with method signatures only.
