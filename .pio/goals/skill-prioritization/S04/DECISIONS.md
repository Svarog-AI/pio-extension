# Decisions (carried forward from Steps 1–3)

## Type Definitions

- **`CapabilitySkills` interface:** `mandatory?: string[]` and `recommended?: { name: string; condition: string }[]`. Placed in the "Capability config types" section of `src/types.ts`. Downstream impact: all steps referencing skill config must use this exact shape.
- **Both fields on `CapabilitySkills` are optional:** A capability can declare only mandatory, only recommended, or neither. Downstream impact: runtime code (Steps 3, 6) must handle `undefined` for both sub-fields gracefully.
- **`skills` field is optional on both config interfaces:** Full backward compatibility — capabilities without skills still resolve correctly.

## Config Resolution

- **Skills passthrough is a direct copy (`skills: config.skills`):** No deduplication or merging at the `resolveCapabilityConfig()` level — that belongs in Step 6. The runtime `CapabilityConfig.skills` mirrors whatever the static config defines, including `undefined` when not set.
- **Test-only capability module:** `test-skills-cap.ts` was created for verifying skills passthrough without polluting real capability configs.

## Skill Injection (Step 3)

- **`buildSkillLoadingSection()` is a pure function:** Accepts `(config, skillRegistry)` and returns markdown or `undefined`. No side effects. Global defaults (`pio`, `ask-user`) are always prepended to mandatory skills regardless of per-capability config.
- **Deduplication via `Set`:** Global mandatory skills are deduplicated against capability-specific mandatory skills using a `Set` to prevent double injection.
- **Bundled resources not injected:** Only SKILL.md itself is injected during mandatory skill loading. Bundled references (e.g., `REFERENCE.md`) remain as links the LLM follows via `read` tool — preserves progressive disclosure.
