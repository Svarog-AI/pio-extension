# Decisions (carried forward from Steps 1–2)

## Type Definitions

- **`CapabilitySkills` interface:** `mandatory?: string[]` and `recommended?: { name: string; condition: string }[]`. Placed in the "Capability config types" section of `src/types.ts`. Downstream impact: all steps referencing skill config must use this exact shape.
- **Both fields on `CapabilitySkills` are optional:** A capability can declare only mandatory, only recommended, or neither. Downstream impact: runtime code (Steps 3, 6) must handle `undefined` for both sub-fields gracefully.
- **`skills` field is optional on both config interfaces:** Full backward compatibility — capabilities without skills still resolve correctly. Steps 3–4 must check for presence before accessing sub-fields.

## Config Resolution

- **Skills passthrough is a direct copy (`skills: config.skills`):** No deduplication or merging at the `resolveCapabilityConfig()` level — that belongs in Step 6. The runtime `CapabilityConfig.skills` mirrors whatever the static config defines, including `undefined` when not set.
- **Test-only capability module:** `test-skills-cap.ts` was created for verifying skills passthrough without polluting real capability configs (Step 4 will add skills to real capabilities). Downstream tests may reference this pattern.
