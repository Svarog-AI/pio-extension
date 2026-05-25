# Decisions (carried forward from Steps 1–7)

## Type Definitions

- **`CapabilitySkills` interface:** `mandatory?: string[]` and `recommended?: { name: string; condition: string }[]`. Placed in `src/types.ts`. Downstream impact: any schema or config mirroring this shape must use identical sub-field names.
- **Both fields on `CapabilitySkills` are optional:** A capability can declare only mandatory, only recommended, or neither. Runtime code must handle `undefined` for both gracefully.

## Schema Design

- **`TASK_FRONTMATTER_SCHEMA` (Step 6):** Defined in `src/frontmatter-schemas.ts` as a leaf module importing only from `typebox`. Mirrors `CapabilitySkills` structurally but independently. Types derived via `Static<>`. Downstream impact: all TASK.md frontmatter consumers must use this schema and the `TaskSkills` type.
- **Leaf module constraint:** `frontmatter-schemas.ts` never imports from the rest of the codebase.

## Skill Injection Architecture

- **`buildSkillLoadingSection()` is a pure function:** Accepts `(config, skillRegistry)`, returns markdown or `undefined`. Global defaults (`pio`, `ask-user`) always prepended. Deduplication via `Set`. Downstream impact: `prepareSession` hooks must mutate `config.skills` before this runs.
- **`mergeCapabilitySkills()` in `fs-utils.ts`:** Pure utility that merges base + task skills (Set-based dedup for mandatory, Map-based first-seen-wins for recommended). Returns a new object — never mutates inputs. Used by `prepareSession` hooks.

## Frontmatter Parsing Pattern (Plan Deviation)

- **Per-step data lives on `StepStatus`:** `hasTask()`, `status()`, `getMetadata()` already demonstrate the pattern — each step object owns its own lazy-evaluated data. TASK.md skills reading MUST follow this same pattern — a new `taskSkills()` method on `StepStatus`. The existing `readTaskFrontmatterSkills()` in `fs-utils.ts` was an incorrect placement; Step 8 moves it into `StepStatus` as the single source of truth for per-step state access.

## Capability Skill Configs

- **Global mandatory skills:** `pio` and `ask-user` are always injected by `buildSkillLoadingSection()`, regardless of capability config.
- **`recommended` key omitted entirely** when no recommended skills exist (not an empty array).

## Bundled Resources

- Only SKILL.md itself is force-injected. Bundled references (e.g., `REFERENCE.md`) remain as links for the LLM to follow via `read`.
