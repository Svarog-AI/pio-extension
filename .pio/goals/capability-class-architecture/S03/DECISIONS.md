# Accumulated Decisions (through Step 2)

## Capability Categorization

- **Three categories established:** session-based (export `CAPABILITY_CONFIG`, use `launchCapability()`), non-session (tool/command only, no session launch), and hybrid (`goal-from-issue.ts` uses `launchCapability()` but references another capability's config). Downstream impact: any class hierarchy must account for all three shapes.
- **Correction from review:** `next-task.ts` calls `launchCapability()` via `launchAndCleanup()` despite being categorized as "non-session" in ANALYSIS.md. It resolves another capability's config at runtime rather than defining its own.

## Quantification Approach

- **Boilerplate quantified by structural sections** (imports, config block, tool def, command handler, setup function) rather than exact line matches, acknowledging natural variation between capabilities.
- **`session-capability.ts` excluded** from per-capability boilerplate counts — it is shared infrastructure, not a capability module. Any class-based design must decide whether equivalent logic lives in a base class or remains as shared utilities.

## Analysis Findings

- **Corrected total line count:** 2,185 lines (verified sum of individual `wc -l` counts) instead of the initial 2,330 stated in Step 1.
- **Boilerplate percentage:** ~37% (~817/2,185 lines) based on structural section estimates.
- **Current pattern wins on 7 of 8 research questions:** Pattern capture (Q1), testing impact (Q3), type safety (Q4), lifecycle hooks (Q5), non-session capabilities (Q6), extensibility (Q7), and overall readability (Q8 — tied). Only boilerplate reduction (Q2) favors Variant A modestly (~12–18% of boilerplate).
- **Variant B's `.bind(this)` problem:** Config callbacks as class methods require `.bind(this)` in the config literal to preserve `this` context. This adds overhead and introduces runtime error potential that TypeScript doesn't catch.
