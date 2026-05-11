# Plan: Fix Skill Loading

Inject skill-loading instructions into pio sub-sessions via `session-capability.ts`, reinforcing the pio skill as essential and instructing agents to scan and load all matching skills before proceeding.

## Prerequisites

None.

## Steps

### Step 1: Create skill-loading instruction file

**Description:** Create a new markdown file containing the skill-loading instructions that will be injected into every pio sub-session. This file serves two purposes:

1. **Mandatory pio skill loading** — Instructs agents to immediately read `src/skills/pio/SKILL.md` so they understand pio conventions (workflow lifecycle, commands, file protections, exit-gate validation, queue mechanics). This is the essential reinforcement the system prompt alone doesn't provide.
2. **General skill scanning** — Instructs agents to scan `<available_skills>` for other matching skills (ask-user for ambiguous decisions, source-research for code investigation, pi-intercom for multi-session coordination) and load relevant SKILL.md files with `read` before proceeding with implementation.

The instruction must be concise and authoritative — treated as a required step, not optional guidance. It should reference the pio skill by its known location within the extension so agents can find it without searching.

**Acceptance criteria:**
- [ ] File `src/prompts/_skill-loading.md` exists
- [ ] File contains an explicit instruction to read/load the pio SKILL.md (`src/skills/pio/SKILL.md`)
- [ ] File contains instructions to scan `<available_skills>` and load matching SKILL.md files
- [ ] The ask-user skill is mentioned as relevant for ambiguous decisions
- [ ] The source-research skill is mentioned as relevant for code investigation
- [ ] The pi-intercom skill is mentioned as relevant for multi-session coordination

**Files affected:**
- `src/prompts/_skill-loading.md` — new file: skill-loading instructions injected into all pio sub-sessions

### Step 2: Inject skill-loading instructions in session-capability.ts

**Description:** Modify `before_agent_start` in `session-capability.ts` to load the new `_skill-loading.md` and inject it between PROJECT.md and the capability-specific prompt. This follows the existing pattern used for PROJECT.md:

1. Read the file from disk at module level, caching it per runtime instance (matching how `projectContext` is cached)
2. Insert the skill-loading instructions in the prompts array between PROJECT.md content and the capability prompt
3. The final injection order becomes: PROJECT.md → skill-loading instructions → capability prompt

The instruction text should be included with a clear section header so agents recognize it as a distinct set of rules. If the file doesn't exist (e.g., future refactoring moves it), log a warning but don't fail — gracefully skip the injection, matching the existing pattern for missing prompt files.

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] `_skill-loading.md` is loaded at module level and cached (same pattern as `projectContext`)
- [ ] Skill-loading instructions are injected between PROJECT.md and the capability prompt in the `before_agent_start` handler
- [ ] Missing `_skill-loading.md` logs a warning and skips injection gracefully (no crash)
- [ ] The existing injection order is preserved: PROJECT.md → skill-loading → capability prompt

**Files affected:**
- `src/capabilities/session-capability.ts` — add module-level cache for skill-loading content, read file in `resources_discover`, inject between project context and capability prompt in `before_agent_start`

## Notes

- The instruction path to the pio SKILL.md (`src/skills/pio/SKILL.md`) is relative to the extension source root. Since this lives in `src/prompts/_skill-loading.md` (loaded by the extension), agents reading it from a pio sub-session should be able to resolve the path. If the agent's cwd differs from the extension root, the instruction should clarify how to find the file (e.g., "use the path given in the `<available_skills>` block for the `pio` skill").
- Consider referencing the pio skill by name rather than hardcoding its path — the `<available_skills>` block already lists it with a location. This avoids path breakage if the skill moves.
- No prompt files (`create-goal.md`, `execute-task.md`, etc.) are modified. All existing skill references in prompts remain unchanged and will now be reinforced by the injected instructions.
