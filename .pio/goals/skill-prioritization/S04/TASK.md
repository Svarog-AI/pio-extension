# Task: Wire capability-specific skill configs

Add the `skills` field to each of the 9 capability modules' `CAPABILITY_CONFIG`, populating mandatory and recommended skill lists per the mapping in GOAL.md.

## Context

Steps 1–3 established the type definitions (`CapabilitySkills`), config resolution passthrough, and the injection engine (`buildSkillLoadingSection()`). Step 4 connects real capabilities to this system by declaring which skills each capability needs. Without this step, every session still falls back to the two global mandatory skills (`pio`, `ask-user`) — but no capability-specific skills are injected.

## What to Build

Add a `skills` property to each of the 9 capability module exports (`CAPABILITY_CONFIG: StaticCapabilityConfig`). Each property follows the `CapabilitySkills` shape:

```typescript
skills: {
  mandatory: ["skill-a", "skill-b"],        // optional — omit if none beyond global defaults
  recommended: [{ name: "skill-c", condition: "when X" }]  // optional — omit if none
}
```

### Skill mapping (in addition to global `pio` + `ask-user`)

| Capability File | Mandatory Skills | Recommended Skills |
|---|---|---|
| `create-goal.ts` | `["pio-planning", "grill-me", "pio-git"]` | `[{ name: "source-research", condition: "when researching existing solutions or libraries" }]` |
| `create-plan.ts` | `["pio-planning", "grill-me"]` | `[{ name: "source-research", condition: "when researching existing solutions or libraries" }]` |
| `evolve-plan.ts` | `["pio-planning", "grill-me"]` | (omit — none) |
| `execute-task.ts` | `["test-driven-development", "pio-git"]` | (omit — none) |
| `review-task.ts` | `["test-driven-development"]` | (omit — none) |
| `execute-plan.ts` | `["test-driven-development", "pio-git"]` | (omit — none) |
| `revise-plan.ts` | `["pio-planning", "grill-me"]` | `[{ name: "source-research", condition: "when researching existing solutions or libraries" }]` |
| `project-context.ts` | `["pio-project-knowledge"]` | `[{ name: "source-research", condition: "when researching project dependencies or external tools" }]` |
| `finalize-goal.ts` | `["pio-project-knowledge", "pio-git"]` | (omit — none) |

### Code Components

For each capability file, add the `skills` field as a property on the `CAPABILITY_CONFIG` object. Placement: after `prompt` and before `validation` (or at the top of config properties for consistency). When no recommended skills exist, omit the `recommended` key entirely — only include it when there are actual entries.

Example (create-plan.ts):
```typescript
export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "create-plan.md",
  skills: {
    mandatory: ["pio-planning", "grill-me"],
    recommended: [
      { name: "source-research", condition: "when researching existing solutions or libraries" }
    ]
  },
  validation: { files: ["PLAN.md"] },
  // ... rest unchanged
};
```

### Approach and Decisions

- **Placement in config object:** Insert `skills` after `prompt` for consistency across all 9 files. This keeps the new field visible near the top of each config block.
- **Only include `recommended` when non-empty:** When a capability has zero recommended skills, the `skills` field contains only `mandatory`. This avoids shipping empty arrays that add no value.
- **`source-research` condition text:** Use consistent phrasing across all three capabilities that recommend it (create-goal, create-plan, revise-plan): `"when researching existing solutions or libraries"`. For project-context, use a slightly different condition since its context differs: `"when researching project dependencies or external tools"`.
- **No changes to behavior or logic:** This step is purely declarative — adding static data to config objects. No runtime behavior changes.

## Skills

No additional skills recommended beyond the mandatory pio skill.

## Dependencies

- **Step 1 (types):** `CapabilitySkills` interface and `skills` field on `StaticCapabilityConfig` must exist in `src/types.ts`.
- **Step 2 (config resolution):** `resolveCapabilityConfig()` must propagate `skills` from static config to runtime config — otherwise the wiring has no effect.

## Files Affected

- `src/capabilities/create-goal.ts` — add `skills` field with mandatory: [`pio-planning`, `grill-me`, `pio-git`] and recommended: [`source-research`]
- `src/capabilities/create-plan.ts` — add `skills` field with mandatory: [`pio-planning`, `grill-me`] and recommended: [`source-research`]
- `src/capabilities/evolve-plan.ts` — add `skills` field with mandatory: [`pio-planning`, `grill-me`] (no recommended)
- `src/capabilities/execute-task.ts` — add `skills` field with mandatory: [`test-driven-development`, `pio-git`] (no recommended)
- `src/capabilities/review-task.ts` — add `skills` field with mandatory: [`test-driven-development`] (no recommended)
- `src/capabilities/execute-plan.ts` — add `skills` field with mandatory: [`test-driven-development`, `pio-git`] (no recommended)
- `src/capabilities/revise-plan.ts` — add `skills` field with mandatory: [`pio-planning`, `grill-me`] and recommended: [`source-research`]
- `src/capabilities/project-context.ts` — add `skills` field with mandatory: [`pio-project-knowledge`] and recommended: [`source-research`]
- `src/capabilities/finalize-goal.ts` — add `skills` field with mandatory: [`pio-project-knowledge`, `pio-git`] (no recommended)

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] All 9 capability modules have the `skills` field added to their `CAPABILITY_CONFIG`
- [ ] Skill mapping matches the table above exactly (mandatory + recommended per capability)
- [ ] Capabilities with no recommended skills omit the `recommended` key entirely (not an empty array)
- [ ] `source-research` condition text is consistent across create-goal, create-plan, and revise-plan: `"when researching existing solutions or libraries"`
- [ ] Existing test suite passes (`npm test`) with no regressions

## Risks and Edge Cases

- **Order sensitivity:** Ensure `skills` is placed correctly inside the object literal — TypeScript will catch missing commas but verify manually.
- **Capability file variations:** Some configs are minimal (execute-plan has only `prompt` + `defaultInitialMessage`) while others have many fields (review-task has `prepareSession`, `postValidate`, etc.). The insertion point should be consistent: after `prompt` in all cases.
- **Skill name spelling:** Double-check skill names match exactly what pi's registry exposes (e.g., `test-driven-development` with hyphens, not underscores).
