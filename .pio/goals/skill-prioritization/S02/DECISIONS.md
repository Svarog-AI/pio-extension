# Decisions (carried forward from Step 1)

## Type Definitions

- **`CapabilitySkills` interface:** `mandatory?: string[]` and `recommended?: { name: string; condition: string }[]`. Placed in the "Capability config types" section of `src/types.ts`. Downstream impact: all steps that reference skill config must use this exact shape.
- **Both fields on `CapabilitySkills` are optional:** A capability can declare only mandatory, only recommended, or neither. Downstream impact: runtime code must handle `undefined` for both sub-fields gracefully (Steps 3, 6).
- **`skills` field is optional on both config interfaces:** Full backward compatibility — capabilities without skills still resolve correctly. Downstream impact: Steps 2–4 must not assume `config.skills` exists; always check for presence before accessing sub-fields.
