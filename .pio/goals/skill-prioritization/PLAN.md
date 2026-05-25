---
totalSteps: 8
steps:
  - name: add-skills-field-to-types
    complexity: task
  - name: propagate-skills-through-config-resolution
    complexity: task
  - name: implement-skill-injection
    complexity: task
  - name: wire-capability-skill-configs
    complexity: task
  - name: remove-prompt-skill-references
    complexity: task
  - name: task-frontmatter-skills-schema
    complexity: task
  - name: evolve-plan-writes-task-skills
    complexity: task
  - name: consume-task-skills-in-prepare-session
    complexity: task
---

# Plan: Centralized capability-to-skill mapping

Consolidate skill loading into a single source of truth in `CapabilityConfig.skills`, replacing scattered `## Skill References` sections across prompt files with dynamic injection via `session-capability.ts`. Steps 1–5 complete the core infrastructure. Steps 6–8 wire per-step skills through TASK.md frontmatter: evolve-plan writes them, execute-task and review-task read them at session startup — no param passing between capabilities.

## Prerequisites

None.

## Steps

### Step 1: Add `skills` field to types [COMPLETED]

**Description:** Added `CapabilitySkills` interface and optional `skills` field to both `StaticCapabilityConfig` and `CapabilityConfig` in `src/types.ts`.

**Status:** COMPLETED — implementation approved, do not modify.

### Step 2: Propagate skills through config resolution [COMPLETED]

**Description:** Updated `resolveCapabilityConfig()` in `src/capability-config.ts` to copy the `skills` field from static config into the runtime `CapabilityConfig`.

**Status:** COMPLETED — implementation approved, do not modify.

### Step 3: Implement skill injection logic in session-capability.ts [COMPLETED]

**Description:** Replaced static `_skill-loading.md` injection with dynamic skill loading via `buildSkillLoadingSection()`. Mandatory skills are read from the skill registry (`BeforeAgentStartEvent.systemPromptOptions.skills`), frontmatter-stripped, and wrapped in `<skill>` XML tags. Recommended skills listed as instructions. Global mandatory skills (`pio`, `ask-user`) always injected.

**Status:** COMPLETED — implementation approved, do not modify.

### Step 4: Wire capability-specific skill configs [COMPLETED]

**Description:** Added the `skills` field to all 9 capability `CAPABILITY_CONFIG` objects with mandatory and recommended skill lists per GOAL.md mapping table.

**Status:** COMPLETED — implementation approved, do not modify.

### Step 5: Remove skill references from prompt files [COMPLETED]

**Description:** Removed `## Skill References` and `## Skill Loading Instructions` sections from all 9 capability prompt files. Retained workflow step mentions of skills (legitimate procedural instructions). `_skill-loading.md` retained on disk as documentation.

**Status:** COMPLETED — implementation approved, do not modify.

### Step 6: Add TASK.md frontmatter schema with skills

Define a `TASK_FRONTMATTER_SCHEMA` in `frontmatter-schemas.ts` following the existing pattern (`PLAN_FRONTMATTER_SCHEMA`, `REVIEW_OUTPUT_SCHEMA`). The schema includes an optional `skills` field matching the `CapabilitySkills` shape — allowing evolve-plan to declare per-step mandatory and recommended skills.

**Schema:**
```yaml
skills?:
  mandatory?: string[]        # skill names force-injected into consuming sessions
  recommended?: [{name, condition}]  # skill name + load condition
```

The schema is purely declarative — leaf module importing only typebox, like existing frontmatter schemas. No runtime logic in this step.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] All existing tests pass (`npm test`) with no regressions
- [ ] `TASK_FRONTMATTER_SCHEMA` is exported from `frontmatter-schemas.ts`
- [ ] `TaskFrontmatter` type is derived from the schema via `Static<>`
- [ ] Schema includes optional `skills` field with `mandatory?: string[]` and `recommended?: { name: string; condition: string }[]` sub-fields

**Files affected:**
- `src/frontmatter-schemas.ts` — add `TASK_FRONTMATTER_SCHEMA` and `TaskFrontmatter` type

### Step 7: Update evolve-plan to write skills in TASK.md frontmatter

Update the evolve-plan prompt so the spec writer includes per-step skill recommendations in TASK.md frontmatter alongside the existing body `## Skills` section. This gives execute-task a machine-readable signal it can consume at runtime, while preserving human-readable reasoning in the body.

**evolve-plan.md changes:**
- Add instructions near the TASK.md template: include `skills.mandatory` (skill names guaranteed to be loaded) and `skills.recommended` (name + condition pairs for on-demand loading) in the YAML frontmatter
- The existing body `## Skills` section remains — it provides reasoning and context; the frontmatter array is the machine-readable signal
- Clarify: mandatory skills are those critical for step completion (e.g., `pio-git` for a migration step); recommended skills are situational references

**No code changes.** This step updates only the prompt template.

**Acceptance criteria:**
- [ ] `evolve-plan.md` instructs the spec writer to include skills in TASK.md YAML frontmatter
- [ ] Instructions distinguish between `skills.mandatory` (force-injected) and `skills.recommended` (instruction-based)
- [ ] The existing body `## Skills` section is preserved — both sections coexist
- [ ] A short example of the frontmatter format is included in the instructions

**Files affected:**
- `src/prompts/evolve-plan.md` — add frontmatter skills instructions to TASK.md template

### Step 8: Consume TASK.md skills in prepareSession (execute-task, review-task)

Add a `prepareSession` hook to execute-task and review-task that reads TASK.md frontmatter, extracts per-step skills, and merges them into the capability config before skill injection runs.

**Mechanism:**
- Both capabilities already have access to `workingDir` and `stepNumber` (enriched session params) at `prepareSession` time
- Read `S{NN}/TASK.md`, parse YAML frontmatter using `js-yaml`, extract `skills` field
- Merge with base config skills: concatenate mandatory (deduplicated via `Set`), concatenate recommended (first-seen wins)
- Mutate `config.skills` directly — since `currentConfig` is a module-level reference to the same object, `buildSkillLoadingSection()` in `before_agent_start` will see the merged result

**Shared helper:** Extract a reusable utility function that reads TASK.md skills and merges them into a `CapabilitySkills` object. Placed in a shared module (e.g., `src/fs-utils.ts` or inline in each capability's config). Handles missing/malformed frontmatter gracefully — falls back to base skills only.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no errors
- [ ] All existing tests pass (`npm test`) with no regressions
- [ ] execute-task `prepareSession` reads TASK.md frontmatter and merges per-step skills into config
- [ ] review-task `prepareSession` reads TASK.md frontmatter and merges per-step skills into config
- [ ] When TASK.md has no `skills` in frontmatter, behavior is identical to pre-change (base skills only)
- [ ] When TASK.md has both mandatory and recommended skills, they are merged with base capability skills
- [ ] Missing or malformed TASK.md frontmatter is handled gracefully — logged warning, no crash, falls back to base skills
- [ ] Deduplication works: if a per-step skill name duplicates a base skill, it appears only once in the final config

**Files affected:**
- `src/capabilities/execute-task.ts` — add `prepareSession` hook that reads TASK.md skills
- `src/capabilities/review-task.ts` — add `prepareSession` hook that reads TASK.md skills
- `src/fs-utils.ts` — optional: shared helper for reading TASK.md frontmatter skills (or inline in each capability if simpler)

## Notes

- **Why prepareSession instead of param passing:** Passing skills through queue params would couple capabilities to downstream skill requirements. Each capability now manages its own skill loading at startup, reading from the goal state (TASK.md). This preserves encapsulation — evolve-plan declares what a step needs; consumers independently read it.
- **buildSkillLoadingSection timing:** `prepareSession` runs during `resources_discover`, which fires before `before_agent_start`. Mutating `config.skills` in `prepareSession` is reflected in `currentConfig` when `buildSkillLoadingSection()` runs, since both reference the same object. No additional plumbing needed.
- **Body `## Skills` vs frontmatter `skills`:** The body section provides human-readable reasoning for the executor. The frontmatter array provides machine-readable data consumed at runtime. Both serve different purposes and coexist.
- **No dynamic param merge step:** Step 6 of the original plan (dynamic skill merging in capability-config.ts) is not needed — skills flow through TASK.md filesystem artifacts, not session params. The existing `skills: config.skills` passthrough from Step 2 handles static capability skills; per-step skills are merged directly into config by prepareSession hooks.
- **review-task also consumes skills:** Review sessions need context about what skills were used during implementation to make informed decisions. Reading the same TASK.md ensures consistency across the execute → review cycle.
- **Bundled resource references within SKILL.md:** Inject only SKILL.md itself. Bundled resources (e.g., `REFERENCE.md`) remain as links the LLM follows via `read` — preserves progressive disclosure.
- **`_skill-loading.md` retention:** Retained on disk as documentation of old format. No step removes it.
