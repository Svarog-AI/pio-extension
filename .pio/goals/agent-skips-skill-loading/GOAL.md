# Agent skips skill loading before executing tasks

The agent ignores the `<available_skills>` block in pi's default system prompt and proceeds directly to raw tools (bash, file reads) without loading relevant SKILL.md files. This goal adds explicit instructions to all pio capability prompts so agents always check available skills, load applicable SKILL.md files, and follow skill-defined protocols before proceeding with implementation.

## Current State

**How skills are surfaced today:** Pi's default system prompt includes an `<available_skills>` block listing all discoverable skills with names, descriptions, and file locations. Extensions register skills via the `resources_discover` event — pio registers its own skill at `src/skills/pio/` in [`src/index.ts`](src/index.ts).

**How pio injects prompts:** In [`src/capabilities/session-capability.ts`](src/capabilities/session-capability.ts), the `before_agent_start` handler returns a custom conversation message (`pio-capability-instructions`) containing `.pio/PROJECT.md` + the capability-specific prompt from `src/prompts/`. This preserves pi's default system prompt (which includes `<available_skills>`) but layers pio instructions on top as a separate message.

**What the prompts currently say about skills:**
- [`src/prompts/create-plan.md`](src/prompts/create-plan.md) — References "ask-user skill protocol" twice, instructing the agent to follow it for decisions.
- [`src/prompts/create-goal.md`](src/prompts/create-goal.md) — No mention of skills or `<available_skills>`.
- [`src/prompts/evolve-plan.md`](src/prompts/evolve-plan.md) — No mention of skills.
- [`src/prompts/execute-task.md`](src/prompts/execute-task.md) — No mention of skills (Step 3 says "use your tools" but doesn't mention scanning/loading skills).
- [`src/prompts/execute-plan.md`](src/prompts/execute-plan.md), [`src/prompts/project-context.md`](src/prompts/project-context.md), [`src/prompts/review-code.md`](src/prompts/review-code.md) — Need auditing for skill references.

**The gap:** Even though skills are listed in the system prompt, agents rarely scan `<available_skills>` at task start, load matching SKILL.md files with the `read` tool, and follow skill protocols. This happens because:
1. Most capability prompts don't explicitly instruct agents to check skills — only `create-plan.md` has references.
2. The `execute-task` prompt (used for actual implementation) tells agents to "use your tools" but never mentions the skills discovery step.
3. Agents prioritize direct action over consulting skill documentation unless explicitly told otherwise.

**Impact:** Missed opportunities for structured decision-making (ask-user skill), poor source research quality (source-research skill skipped), inconsistent behavior across sessions, and potential workflow violations that skills enforce.

## To-Be State

All pio capability prompts will include an explicit step or guideline instructing agents to scan `<available_skills>` at the start of their work and load relevant SKILL.md files before proceeding with implementation.

**Changes to prompt files in `src/prompts/`:**

1. **`src/prompts/create-goal.md`** — Add a skill-checking step during Step 2 (Light research). Instruct: scan `<available_skills>`, load the ask-user skill for interview decisions, load any other matching skills before proceeding.

2. **`src/prompts/evolve-plan.md`** — Add a skill-checking step before or during Step 3 (Research context). Instruct: check available skills, load relevant SKILL.md files when task context matches skill descriptions.

3. **`src/prompts/execute-task.md`** — Add a skill-checking step at Step 3 (Research supporting context), before writing tests. This is the most critical change — the execute-task prompt currently has no skill instructions at all. Instruct: scan `<available_skills>` early, load matching SKILL.md files with `read`, and follow skill protocols throughout implementation.

4. **`src/prompts/execute-plan.md`** — Audit for existing skill references; add skill-checking instructions if absent (similar placement as execute-task).

5. **`src/prompts/review-code.md`** — Audit for existing skill references; add if relevant.

6. **`src/prompts/project-context.md`** — Audit for existing skill references; add if relevant.

7. **`src/prompts/create-plan.md`** — Already references ask-user skill. Strengthen the instruction to be more explicit (should say "load the SKILL.md with `read` before following its protocol").

**The skill-checking instruction pattern** should be consistent across all prompts. It must appear early in each prompt's process steps so skill protocols are known before implementation begins. The pattern should instruct agents to:
- Scan `<available_skills>` at task start
- For each matching skill, use `read` to load its SKILL.md file
- Follow the loaded protocols throughout their work
- At minimum recognize: ask-user (ambiguous decisions), source-research (code investigation), pi-intercom (multi-session coordination)

This ensures the agent actively loads skill documentation instead of ignoring it. The instruction should be prominent enough that it's treated as a required first step, not an optional suggestion.
