# Task: Add `skills` field to types

Introduce the `CapabilitySkills` interface and wire it into both `StaticCapabilityConfig` and `CapabilityConfig` in `src/types.ts`.

## Context

Currently there is no code-level mechanism to declare which skills apply to each capability. Skill loading is entirely prompt-driven via `_skill-loading.md` and scattered `## Skill References` sections in individual prompt files. This step lays the type foundation for a centralized config-driven approach: every capability will declare its mandatory and recommended skills in code, and `session-capability.ts` (Step 3) will read this config at runtime to inject skill content into prompts.

## What to Build

Add one new interface (`CapabilitySkills`) and an optional `skills` field to the two existing config interfaces (`StaticCapabilityConfig`, `CapabilityConfig`). No runtime logic, no imports — pure type declarations.

### Code Components

#### `CapabilitySkills` interface (new)

```typescript
interface CapabilitySkills {
  /** Skills forcefully injected into the prompt — full SKILL.md content is read at startup */
  mandatory?: string[];
  /** Skills listed as instructions for the LLM to load when conditions apply */
  recommended?: { name: string; condition: string }[];
}
```

- `mandatory` is an optional array of skill names (strings). These are skills whose full SKILL.md content will be force-injected into the prompt at session startup.
- `recommended` is an optional array of objects with `name` (skill name) and `condition` (a description of when to load this skill).

#### Add `skills?: CapabilitySkills` to `StaticCapabilityConfig`

Optional field — existing capability modules without skills config remain valid. Place the field after the lifecycle hooks (`prepareSession`, `postValidate`, `postExecute`) to keep related fields grouped.

#### Add `skills?: CapabilitySkills` to `CapabilityConfig`

Optional field on the runtime config shape. The runtime mirrors the static shape for skills — no callback resolution needed since skill lists are static per capability (Step 2 handles propagation through `resolveCapabilityConfig`).

### Approach and Decisions

- Place `CapabilitySkills` in the "Capability config types" section of `src/types.ts`, before the first interface that uses it.
- Both fields on `CapabilitySkills` are optional — a capability can declare only mandatory skills, only recommended skills, or neither.
- The `skills` field is optional on both config interfaces to maintain backward compatibility: existing capabilities without the field compile unchanged.
- No runtime logic in this step. Steps 2–3 handle propagation and injection respectively.

## Skills

No additional skills recommended beyond the mandatory pio skill.

## Dependencies

None. This is Step 1 — foundational type changes with no prerequisites.

## Files Affected

- `src/types.ts` — created: `CapabilitySkills` interface; modified: added `skills?: CapabilitySkills` to both `StaticCapabilityConfig` and `CapabilityConfig`

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] `CapabilitySkills` interface is exported from `src/types.ts`
- [ ] Both `StaticCapabilityConfig` and `CapabilityConfig` include the optional `skills` field of type `CapabilitySkills`
- [ ] `CapabilitySkills.mandatory` is an optional `string[]`
- [ ] `CapabilitySkills.recommended` is an optional array of `{ name: string; condition: string }`
- [ ] Existing code compiles without changes — the new field is optional and backward-compatible
- [ ] All existing tests pass (`npm test`) with no regressions

## Risks and Edge Cases

- **Circular imports:** `src/types.ts` is designed to be importable from all modules without creating cycles. Adding a pure interface here should not introduce any. Verify with `npx tsc --noEmit`.
- **Existing capability modules:** None of the 9 capability modules reference a `skills` field yet. Adding it as optional ensures zero breakage.
- **Re-export surface:** `CapabilitySkills` should be exported from `src/types.ts` so that downstream steps (Steps 2–4) can import it via `import type { CapabilitySkills } from "./types"`.
