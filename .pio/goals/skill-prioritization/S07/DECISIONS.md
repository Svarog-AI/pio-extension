# Decisions (carried forward from Steps 1–6)

## Type Definitions

- **`CapabilitySkills` interface:** `mandatory?: string[]` and `recommended?: { name: string; condition: string }[]`. Placed in `src/types.ts`. Downstream impact: any schema or config mirroring this shape must use identical sub-field names.
- **Both fields on `CapabilitySkills` are optional:** A capability can declare only mandatory, only recommended, or neither. Runtime code must handle `undefined` for both gracefully.

## Schema Design

- **`TASK_FRONTMATTER_SCHEMA` (Step 6):** Defined in `src/frontmatter-schemas.ts` as a leaf module importing only from `typebox`. Mirrors `CapabilitySkills` structurally but independently. Types derived via `Static<>`. Downstream impact: Step 7 prompt instructions and Step 8 consumer code must match this exact schema shape.
- **Leaf module constraint:** `frontmatter-schemas.ts` never imports from the rest of the codebase. All frontmatter types are self-contained TypeBox definitions.

## Skill Injection

- **`buildSkillLoadingSection()` is a pure function:** Accepts `(config, skillRegistry)`, returns markdown or `undefined`. Global defaults (`pio`, `ask-user`) always prepended. Deduplication via `Set`. Downstream impact: Step 8 mutates `config.skills` before this runs — merging must produce a valid `CapabilitySkills` shape.
- **Bundled resources not injected:** Only SKILL.md itself is force-injected. Bundled references (e.g., `REFERENCE.md`) remain as links for the LLM to follow via `read`.

## Capability Skill Configs

- **`recommended` key omitted entirely** when no recommended skills exist (not an empty array). Downstream impact: Step 7 prompt should instruct spec writers to omit `skills.recommended` from frontmatter when there are none.
- **Consistent condition text for recommended skills:** Encourage consistent phrasing for load conditions across steps.

## Plan Deviations

- **`capability-skills.test.ts` deleted per user feedback:** Snapshot tests of static config values were deemed brittle — TypeScript validates structure. Don't create snapshot-style tests for static data.
- **Inline skill mentions preserved in prompt files:** Procedural skill references within workflow steps are legitimate instructions and were preserved during Step 5. This distinction affects how evolve-plan.md describes the `## Skills` body section vs. frontmatter skills.
