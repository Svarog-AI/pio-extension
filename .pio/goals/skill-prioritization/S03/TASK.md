# Task: Implement skill injection logic in session-capability.ts

Replace the static `_skill-loading.md` injection with dynamic skill injection driven by `CapabilityConfig.skills` during `before_agent_start`.

## Context

Currently, every session receives identical skill-loading instructions from the static file `_skill-loading.md` — a ~20-line prompt telling the LLM to manually read skill files. This provides no guarantee that skills are actually loaded. The GOAL.md defines a two-tier system: mandatory skills are force-injected (full content in the prompt) and recommended skills appear as instructions to load on demand. Steps 1 and 2 have already added the `CapabilitySkills` type and propagated it through config resolution. This step implements the actual injection logic in `session-capability.ts`.

## What to Build

### Modify `before_agent_start` handler in `session-capability.ts`

Replace the static `_skill-loading.md` loading/injection with dynamic generation:

1. **Skill registry caching:** During `resources_discover`, cache the skill registry from `BeforeAgentStartEvent.systemPromptOptions.skills` (type `import(".../pi-coding-agent").Skill[]` — each entry has `{ name, filePath, baseDir }`). Since `systemPromptOptions` is available only in `before_agent_start` (not `resources_discover`), read it during `before_agent_start` and cache module-level. This provides the skill name → `{ filePath, baseDir }` mapping for all registered skills (bundled + external).

2. **Mandatory skill injection:** For each mandatory skill name (from global defaults + capability config), resolve the filesystem path via the cached registry, read `SKILL.md` with `readFileSync`, strip frontmatter with `stripFrontmatter` from `@earendil-works/pi-coding-agent`, and wrap in pi's XML format:
   ```xml
   <skill name="test-driven-development" location="/absolute/path/to/skills/test-driven-development">
   References are relative to /base/dir.
   
   [SKILL.md body without frontmatter]
   </skill>
   ```

3. **Recommended skills listing:** Generate an instruction block listing each recommended skill with its condition:
   ```markdown
   --- RECOMMENDED SKILLS ---
   
   Load these skills when the listed condition matches your current task:
   
   - `pio-git` — commit changes (load during completion/Step 9)
   ```

4. **Assemble the skill-loading section:** Combine mandatory skill content blocks + recommended skill instructions into a single `--- SKILL LOADING INSTRUCTIONS ---` section. This replaces reading `_skill-loading.md` from disk.

5. **Global mandatory skills:** Always inject `pio` and `ask-user` on top of any capability-specific skills from `CapabilityConfig.skills.mandatory`. These are the baseline — every session receives them regardless of config.

6. **Graceful error handling:** If a mandatory skill's SKILL.md file is missing or unreadable, log a warning (`console.warn`) and skip that skill — do not crash the session. Missing skills in the registry (name not found) should also be logged and skipped.

### Delivery order

The custom conversation message must preserve this order:
1. `--- PROJECT OVERVIEW ---` (project context, unchanged)
2. `--- SKILL LOADING INSTRUCTIONS ---` (dynamically generated — mandatory skill blocks + recommended instructions)
3. `--- YOUR INSTRUCTIONS ---` (capability-specific prompt, unchanged)

### Module-level state changes

- **New module-level cache:** `let availableSkills: Skill[] | undefined;` — populated from `systemPromptOptions.skills` during `before_agent_start`.
- **Remove or repurpose:** The existing `skillLoadingInstructions` module-level variable (currently holds the static `_skill-loading.md` content) should be removed or replaced with dynamically generated content. The `resources_discover` handler no longer reads `_skill-loading.md`.

### Code Components

#### `buildSkillLoadingSection(config, availableSkills): string | undefined`

Extract this logic into a standalone function (either module-private or exported for testing). Accepts:
- Capability config (to read `config.skills`)
- Cached skill registry (`Skill[]`)

Returns:
- A markdown string containing the `--- SKILL LOADING INSTRUCTIONS ---` section with mandatory skill content blocks + recommended skill instructions
- `undefined` if no skills are configured and no global defaults apply (edge case — should not happen in practice since `pio` is always mandatory)

Behavior:
- Always includes global mandatory skills (`pio`, `ask-user`) regardless of config
- Merges with capability-specific `config.skills?.mandatory` (deduplicated by name, base wins)
- Generates recommended skill instructions from `config.skills?.recommended`
- Handles missing files gracefully (warn + skip)

#### Modified `before_agent_start` handler

- Read skills from `_event.systemPromptOptions.skills`, cache module-level
- Call `buildSkillLoadingSection()` with config + cached skills
- Inject the generated section into the prompts array between project context and capability prompt
- No longer reads `_skill-loading.md` from disk in `resources_discover`

#### Modified `resources_discover` handler

- Remove the block that reads `_skill-loading.md` from disk
- Everything else remains unchanged

### Approach and Decisions

- **Follow pi's `_expandSkillCommand` pattern exactly:** The GOAL.md specifies matching pi's own skill expansion format. Use `<skill name="..." location="...">\nReferences are relative to <baseDir>.\n\n<body>\n</skill>` — this is the exact XML format pi uses for `/skill:name` commands.
- **Import `stripFrontmatter` from `@earendil-works/pi-coding-agent`:** This is the same function pi uses internally. It strips YAML frontmatter (`--- ... ---`) from markdown content.
- **Skill registry source:** Use `BeforeAgentStartEvent.systemPromptOptions.skills` (type `Skill[]`). This provides all registered skills with filesystem paths — no need to parse `<available_skills>` or access pi internals.
- **Cache at `before_agent_start`, not `resources_discover`:** The skill registry is available via the event parameter in `before_agent_start`. Cache it module-level so `buildSkillLoadingSection` can access it without re-reading.
- **`_skill-loading.md` retention per GOAL.md:** The file stays on disk but is no longer loaded by code. No deletion step — that's out of scope.
- **Reference prior decisions (from DECISIONS.md):** Both `mandatory` and `recommended` sub-fields are optional — handle `undefined` gracefully. The `skills` field itself is optional on the config — check presence before accessing.

## Skills

No additional skills recommended beyond the mandatory pio skill.

## Dependencies

- **Step 1 (COMPLETED):** `CapabilitySkills` interface exists in `src/types.ts`. This step imports and uses it.
- **Step 2 (COMPLETED):** `resolveCapabilityConfig()` propagates `skills: config.skills` into the runtime `CapabilityConfig`. This step reads from `config.skills` during injection.

## Files Affected

- `src/capabilities/session-capability.ts` — major changes: replace `_skill-loading.md` loading with dynamic skill injection; import `stripFrontmatter`; add skill registry caching; add `buildSkillLoadingSection()` helper function
- No new files created (Step 3 is focused on the injection logic only)

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] Existing test suite passes with no regressions (`npm test`)
- [ ] `before_agent_start` generates the skill-loading section from capability config instead of reading `_skill-loading.md` from disk
- [ ] Mandatory skills are read, frontmatter stripped, and wrapped in `<skill>` XML tags following pi's expansion format: `<skill name="..." location="...">\nReferences are relative to <baseDir>.\n\n<body>\n</skill>`
- [ ] Recommended skills appear as instruction-based listings under `--- RECOMMENDED SKILLS ---` with condition descriptions
- [ ] Global mandatory skills (`pio`, `ask-user`) are always injected regardless of per-capability config
- [ ] Missing SKILL.md files are handled gracefully (logged warning, no crash) — session continues with remaining skills
- [ ] The `_skill-loading.md` file is no longer read by `resources_discover` (code path removed)
- [ ] Delivery order preserved: PROJECT OVERVIEW → SKILL LOADING INSTRUCTIONS → YOUR INSTRUCTIONS

## Risks and Edge Cases

- **`systemPromptOptions.skills` might be undefined:** If pi doesn't populate this field in some scenarios, the skill registry would be empty. Guard with `?.skills || []` and log a warning if no skills are available for mandatory injection.
- **External skill paths may not exist on disk:** External skills from other extensions might have paths that don't resolve. The graceful error handling (warn + skip) covers this — the session continues without that specific skill.
- **Token budget concerns:** Injecting full SKILL.md content increases prompt size significantly. The `test-driven-development` skill is substantial (~400 lines). This is an accepted trade-off per GOAL.md — mandatory skills are injected by design. Recommended skills remain instruction-based.
- **Module cache in tests:** Existing tests mock `setupCapability()` by importing the module after `vi.resetModules()`. The new module-level `availableSkills` cache needs to be reset between test scenarios. Ensure test cleanup handles this (or use the existing pattern of re-importing after `resetModules`).
- **`stripFrontmatter` import path:** Verify the exact export path — it's exported from `@earendil-works/pi-coding-agent` (confirmed in `dist/index.d.ts`). Use named import: `import { stripFrontmatter } from "@earendil-works/pi-coding-agent"`.
