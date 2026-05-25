# Decisions (carried forward from Steps 1–5)

## Type Definitions

- **`CapabilitySkills` interface:** `mandatory?: string[]` and `recommended?: { name: string; condition: string }[]`. Placed in `src/types.ts`. Downstream impact: any schema mirroring this shape (Steps 6–8) must use identical sub-field names.
- **Both fields on `CapabilitySkills` are optional:** A capability can declare only mandatory, only recommended, or neither. Downstream impact: runtime code must handle `undefined` for both sub-fields gracefully.

## Schema Design

- **Leaf module constraint:** `frontmatter-schemas.ts` imports only from `typebox` — never from the rest of the codebase to avoid circular dependencies. The `TASK_FRONTMATTER_SCHEMA` (Step 6) and `TaskFrontmatter` type must follow this same leaf-module pattern.
- **Type derivation via `Static<>`:** All frontmatter types are derived directly from their TypeBox schema using `Static<typeof SCHEMA>` — no manual interface definitions in this module.

## Skill Injection

- **`buildSkillLoadingSection()` is a pure function:** Accepts `(config, skillRegistry)` and returns markdown or `undefined`. Global defaults (`pio`, `ask-user`) always prepended. Deduplication via `Set`. Downstream impact: Step 8 (consume-task-skills) mutates `config.skills` before this runs — the merging must produce a valid `CapabilitySkills` shape.
- **Bundled resources not injected:** Only SKILL.md itself is injected. Bundled references remain as links for the LLM to follow via `read`.

## Capability Skill Configs

- **`recommended` key omitted entirely** when no recommended skills exist (not an empty array). Downstream impact: Step 7 (evolve-plan prompt) should instruct the spec writer to omit `skills.recommended` from frontmatter when there are none.
- **Consistent condition text for recommended skills:** When writing evolve-plan instructions, recommend consistent phrasing for conditions across steps.

## Plan Deviations

- **`capability-skills.test.ts` deleted per user feedback:** User identified snapshot tests of static config values as brittle. TypeScript validates structure. Downstream impact: Step 6 should not create snapshot-style tests for static schema data either — test schema validation behavior instead.
- **Inline skill mentions preserved in prompt files:** Per user request during Step 5, procedural skill references within workflow steps are legitimate instructions and were preserved. This distinction may affect how evolve-plan.md (Step 7) describes the `## Skills` body section vs. frontmatter.
