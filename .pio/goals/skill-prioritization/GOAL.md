# Centralized capability-to-skill mapping

Eliminate duplication between `## Skill References` sections scattered across prompt files and `_skill-loading.md`. Consolidate skill loading into a single source of truth: capability config in code that drives dynamic skill injection by `session-capability.ts`. Mandatory skills are read at startup and their full content is injected directly into the prompt — guaranteed present. Recommended skills are listed as instructions for the LLM to load on demand. Prompts contain zero skill references — everything is handled centrally.

## Current State

**Prompt injection architecture:** `src/capabilities/session-capability.ts` injects three layers via `before_agent_start`: (1) `--- PROJECT OVERVIEW ---` from `.pio/PROJECT/OVERVIEW.md`, (2) `_skill-loading.md` (shared instructions), (3) `--- YOUR INSTRUCTIONS ---` with the capability prompt. All delivered as a custom conversation message (`customType: "pio-capability-instructions"`).

**`_skill-loading.md`** (`src/prompts/_skill-loading.md`) is a static file (~20 lines) injected identically into every session. It has two sections: (1) mandatory pio skill loading, (2) heuristic `<available_skills>` scanning. No capability-specific intelligence — every session sees the same generic instructions.

**Skill references are scattered across prompt files with inconsistent formats:**

| Prompt | How skills surfaced | Skills listed |
|--------|-------------------|---------------|
| `create-goal.md` | `## Skill References` | pio-planning, grill-me |
| `create-plan.md` | `## Skill References` | pio-planning, grill-me |
| `revise-plan.md` | `## Skill References` | pio-planning, grill-me |
| `finalize-goal.md` | `## Skill Loading Instructions` (inline) | pio-project-knowledge |
| `project-context.md` | `## Skill Loading Instructions` (inline) | pio-project-knowledge |
| `execute-task.md` | Inline mentions only | test-driven-development (intro), pio-git (step 9) |
| `execute-plan.md` | Inline mention only | pio-git (step 6) |
| `review-task.md` | None | — |
| `evolve-plan.md` | None (but instructs spec writer to output skills for TASK.md) | — |

**Core problems:**
1. **Duplication:** Skill-to-capability mapping exists in multiple places — prompt text and `_skill-loading.md` both try to guide skill loading but with overlapping, non-coordinated instructions.
2. **Inconsistent format:** Three prompts use `## Skill References`, two use `## Skill Loading Instructions`, four have nothing or only inline mentions.
3. **Missing coverage:** `review-task.md`, `execute-plan.md`, and `evolve-plan.md` have no explicit skill guidance despite relying on specific skills (TDD, pio-git, pio-planning).
4. **No single source of truth:** Adding a new skill to a capability requires editing the right prompt file manually. No config or code-level mapping to reference or audit.
5. **"Mandatory" is not enforced:** Current prompts tell the LLM to "load" skills via `read` tool — but there's no guarantee it will actually do so before proceeding. The word "mandatory" in `_skill-loading.md` is just text; nothing prevents the LLM from skipping or delaying skill loading.

**How pi loads skills — `/skill:name` implementation reference:** This is our solution model. The full chain:

1. **Parsing** — `parseSkillBlock(text)` parses `/skill:name args`. Source: `/home/aleksj/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.d.ts:28-40`
2. **Expansion** — `_expandSkillCommand(text)`: extracts skill name → `resourceLoader.getSkills().skills.find()` → `readFileSync(skill.filePath)` → `stripFrontmatter(content)` → wraps in `<skill name="..." location="...">...</skill>`. Source: `/home/aleksj/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` (search `_expandSkillCommand`)
3. **Delivery** — queued as steer message via `_queueSteer`, delivered after current turn
4. **Discovery** — `resourceLoader.getSkills()`. Source: `/home/aleksj/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.d.ts`
5. **Skill interface** — `{ name, description, filePath, baseDir, sourceInfo }`. Source: `/home/aleksj/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/skills.d.ts`

Our mandatory skills follow this exact pattern but deliver at session startup (via `withSession` callback in `launchCapability`) instead of waiting for a user command.

**Important constraint — TASK.md `## Skills` section:** `execute-task.md` already supports per-step skill recommendations via TASK.md (written by evolve-plan). The spec writer has deeper context about each step's specific needs. Any solution must compose with this: capability-level skills are the baseline, TASK.md skills refine per step.

**Available skills:** pio (mandatory for all), pio-planning, pio-git, test-driven-development, pio-project-knowledge, write-a-skill, grill-me, plus external: ask-user, source-research, web-browser, pi-intercom.

## To-Be State

**Single source of truth: capability config.** `CapabilityConfig` gains a `skills` field that declares mandatory and recommended skills per capability. `session-capability.ts` reads this at session startup and handles skill loading:

```typescript
skills?: {
  /** Skills forcefully injected into the prompt — full SKILL.md content is read at startup */
  mandatory?: string[];
  /** Skills listed as instructions for the LLM to load when conditions apply */
  recommended?: { name: string; condition: string }[];
}
```

**Two-tier skill loading:**

1. **Mandatory skills (forceful delivery):** During capability session startup, `session-capability.ts` reads each mandatory SKILL.md file and delivers it as a steer message before the agent starts — following the exact same pattern as pi's `/skill:name` command (`_expandSkillCommand`). It strips frontmatter and wraps in XML: `<skill name="test-driven-development" location="/path/to/skills/...">\nReferences are relative to /base/dir.\n\n[SKILL.md body]\n</skill>`. The LLM sees this content as conversation history before processing the task — no `read` tool calls required.

2. **Recommended skills (instruction-based):** Listed in generated instructions telling the LLM to load them when specific conditions apply:
   ```markdown
   --- RECOMMENDED SKILLS ---
   
   Load these skills when the listed condition matches your current task:
   
   - `pio-git` — commit changes (load during completion/Step 9)
   - `ask-user` — clarify ambiguous requirements
   ```

**Delivery timing:** Mandatory skill steer messages are sent via the `withSession` callback in `launchCapability`, before `sendUserMessage` kicks off the agent. This follows pi's own steering pattern exactly.
1. `--- PROJECT OVERVIEW ---` (project context)
2. `--- SKILL LOADING INSTRUCTIONS ---` (generated from config: mandatory skill content blocks + recommended skill instructions)
3. `--- YOUR INSTRUCTIONS ---` (capability-specific prompt)

**Global mandatory skills (applied to every capability):** `pio` and `ask-user`. These are always delivered — the config doesn't need to repeat them per capability. The capability config adds capability-specific skills on top of these two.

**Capability-specific skill mapping** (in addition to the global `pio` + `ask-user`):

| Capability | Mandatory Skills | Recommended Skills |
|---|---|---|
| create-goal | pio-planning, grill-me, **pio-git** | source-research |
| create-plan | pio-planning, **grill-me** | source-research |
| evolve-plan | pio-planning, **grill-me** | (none) |
| execute-task | test-driven-development, **pio-git** | (none) |
| review-code | **test-driven-development** | (none) |
| execute-plan | same as execute-task: test-driven-development, pio-git | (none) |
| revise-plan | same as create-plan: pio-planning, grill-me | source-research |
| project-context | pio-project-knowledge | source-research |
| finalize-goal | pio-project-knowledge, pio-git | (none) |

**How it composes with TASK.md `## Skills`:** The mandatory skills from config are always injected. For execute-task sessions, TASK.md `## Skills` section provides per-step refinements — the existing intro paragraph in `execute-task.md` already handles this ("When `TASK.md` includes a `## Skills` section, treat it as a primary signal"). Priority: TASK.md skills > capability recommended skills > heuristic scanning. Mandatory skills from config are always present regardless of TASK.md content.

**Files to modify:**
- `src/types.ts` — add `CapabilityConfig.skills` field
- `src/capabilities/session-capability.ts` — during `resources_discover`, read mandatory SKILL.md files, generate skill-loading section with injected mandatory content + recommended instructions. Replace static `_skill-loading.md` injection with this dynamic section.
- Each capability config definition file (`create-goal.ts`, `create-plan.ts`, etc.) — add the `skills` field to their CapabilityConfig
- All 9 prompt files — remove existing `## Skill References` and `## Skill Loading Instructions` sections (now redundant, handled centrally)
- `src/prompts/_skill-loading.md` — retained only as a base template with the mandatory pio skill loading instruction + heuristic scanning fallback; capability-specific content is now generated from config

**Design decisions to resolve during planning:**
1. **Skill path resolution for external skills:** External skills (ask-user, source-research, etc.) live in other extensions and have paths in `<available_skills>`. How does the code resolve skill name → filesystem path? Options: parse pi's available skills registry at runtime, or hardcode known paths for bundled skills and skip external skill injection (only handle external skills as recommended/instruction-based).
2. **Token budget:** Injecting full SKILL.md content increases prompt size. Some skills are large (test-driven-development is substantial). Should there be a token limit or truncation strategy? Or is the current model context window sufficient?
3. **Bundled resource references within SKILL.md:** Skills like pio-git reference `[REFERENCE.md](REFERENCE.md)` for progressive disclosure. When injecting mandatory skill content, should we also inject referenced bundled resources, or just the SKILL.md itself and let the LLM follow links via `read`?

**Out of scope:** Recommended skills are never force-injected — they remain as instructions for LLM to load on demand. This preserves token budget and progressive disclosure for situational skills. Full prompt-text skill content injection is avoided only for recommended skills; mandatory skills are injected by design (that's the point of being "mandatory").
