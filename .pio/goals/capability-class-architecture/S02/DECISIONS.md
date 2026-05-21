# Accumulated Decisions (through Step 1)

## Capability Categorization

- **Three categories established:** session-based (export `CAPABILITY_CONFIG`, use `launchCapability()`), non-session (tool/command only, no session launch), and hybrid (`goal-from-issue.ts` uses `launchCapability()` but references another capability's config). Downstream impact: any class hierarchy must account for all three shapes.
- **Correction from review:** `next-task.ts` calls `launchCapability()` via `launchAndCleanup()` despite being categorized as "non-session" in ANALYSIS.md. Steps 2–3 should treat it as having session-launch needs — it resolves another capability's config at runtime rather than defining its own.

## Quantification Approach

- **Boilerplate quantified by structural sections** (imports, config block, tool def, command handler, setup function) rather than exact line matches, acknowledging natural variation between capabilities.
- **`session-capability.ts` excluded** from per-capability boilerplate counts — it is shared infrastructure, not a capability module. Any class-based design will need to decide whether the equivalent logic lives in a base class or remains as shared utilities.
