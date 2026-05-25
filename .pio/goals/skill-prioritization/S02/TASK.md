# Task: Propagate skills through config resolution

Ensure `resolveCapabilityConfig()` copies the `skills` field from each capability's static `CAPABILITY_CONFIG` into the returned runtime `CapabilityConfig`, so that skill declarations flow from capability modules into session-level config.

## Context

Step 1 added the `skills?: CapabilitySkills` field to both `StaticCapabilityConfig` and `CapabilityConfig` in `src/types.ts`. Currently, `resolveCapabilityConfig()` in `src/capability-config.ts` resolves callback-based fields like `validation`, `readOnlyFiles`, and `writeAllowlist`, but does not include `skills` in the returned object. This step closes the gap: when a capability's `CAPABILITY_CONFIG` declares `skills`, they must appear in the runtime config consumed by `session-capability.ts`.

## What to Build

A single-line change to `resolveCapabilityConfig()`: add `skills: config.skills` to the returned `CapabilityConfig` object. This is a direct passthrough — `skills` is static per capability (no callback resolution needed), so it copies as-is from the source config.

### Code Components

- **`resolveCapabilityConfig()` return statement** (`src/capability-config.ts`): Add `skills: config.skills` to the object literal returned near the end of the function. Placement should follow existing fields — after `postExecute` is appropriate (near the bottom of the return block).

### Approach and Decisions

- Follow the existing passthrough pattern already established for `prepareSession`, `postValidate`, and `postExecute` — these are optional callbacks that pass through directly without transformation. Skills follow the same pattern: read from static config, include in runtime config as-is.
- No deduplication or merging is needed at this stage — that belongs in Step 6 (dynamic skill passing). This step is a simple passthrough.
- Reference `DECISIONS.md`: both sub-fields of `CapabilitySkills` are optional, and the `skills` field itself is optional on `StaticCapabilityConfig`. The passthrough naturally handles `undefined` — when a static config has no `skills`, `config.skills` is `undefined`, and the runtime config will also have `skills: undefined`.

## Skills

No additional skills recommended beyond the mandatory pio skill.

## Dependencies

- **Step 1:** `CapabilitySkills` interface must exist in `src/types.ts` (completed, approved).
- Step 1's types are already imported in `capability-config.ts` (`import type { CapabilityConfig, StaticCapabilityConfig } from "./types"`). No import changes needed.

## Files Affected

- `src/capability-config.ts` — add `skills: config.skills` to the returned `CapabilityConfig` object in `resolveCapabilityConfig()`
- `src/capability-config.test.ts` — add tests verifying skills propagation (with and without skills field)

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] `resolveCapabilityConfig` includes `skills` in its returned `CapabilityConfig` object, propagated from `config.skills` (the static capability config)
- [ ] When a static config has no `skills` field, the runtime config's `skills` is `undefined`
- [ ] Existing test suite passes with no regressions (`npm test`)
- [ ] New tests verify: skills are copied when present, skills are undefined when absent

## Risks and Edge Cases

- **Existing capabilities don't have `skills` yet:** Step 4 adds skills to capability configs. Until then, all resolved configs will have `skills: undefined`. The passthrough must not crash or produce type errors when `config.skills` is `undefined`.
- **Module caching with Vitest:** Dynamic imports in `resolveCapabilityConfig()` load real capability modules (`./capabilities/create-goal`). Tests that add a `skills` field to a real capability module could affect other tests. If needed, create a mock capability module instead of modifying real ones for testing purposes.
