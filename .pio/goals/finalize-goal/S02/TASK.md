# Task: Register pio-project-knowledge skill and update project-context prompt

Register the new `pio-project-knowledge` skill so it appears in `<available_skills>` for all sub-sessions, and update the `project-context.md` prompt to load this skill for PROJECT file structure details instead of encoding them inline.

## Context

Step 1 created `src/skills/pio-project-knowledge/SKILL.md` — a shared knowledge source documenting all 7 `.pio/PROJECT/*.md` files with canonical paths, section structure, and update rules. This skill is meant to serve both the `project-context` capability (for initial creation) and the future `finalize-goal` capability (for updates). However, the skill is not yet registered — it won't appear in `<available_skills>` for sub-sessions. Additionally, `src/prompts/project-context.md` still encodes PROJECT file structure inline rather than delegating to the skill.

This step wires up the registration and reduces prompt bloat by deferring details to the skill.

## What to Build

### 1. Register the skill in `src/index.ts`

Add `path.join(SKILLS_DIR, "pio-project-knowledge")` to the `skillPaths` array in the `resources_discover` handler. This is alongside the existing entries for `"pio"` and `"test-driven-development"`. After this change, all sub-sessions will see the `pio-project-knowledge` skill in their `<available_skills>` block.

### 2. Update `src/prompts/project-context.md` to load the skill

Add a "Skill Loading Instructions" section at the top of the prompt (or integrate with existing instructions) that instructs the Project Context Analyzer to load the `pio-project-knowledge` skill before proceeding. The instruction should reference the skill by name (`pio-project-knowledge`) and indicate it contains PROJECT file structure and update rules knowledge.

After loading the skill, the prompt should defer to the skill for PROJECT file structure details rather than repeating them inline. This means:
- Keep Phase 1 (Analysis) instructions as-is — those are about _how_ to research
- In Phase 2 (Summarization), replace or supplement the inline section templates with a reference to the pio-project-knowledge skill. The agent should consult the loaded skill for canonical paths, section structure, and expected content of each PROJECT file.
- Phase 4 output templates can be retained as formatting guidance but with cross-references to the skill for structural details.

The key reduction is: instead of listing all 7 files with detailed sections inline (as currently done), the prompt says "consult the pio-project-knowledge skill" and provides lighter scaffolding.

### Approach and Decisions

- **Follow existing skill registration pattern:** The `skillPaths` array uses `path.join(SKILLS_DIR, "<name>")`. Add `"pio-project-knowledge"` using the same convention. No imports needed — skills are discovered at runtime from `<available_skills>`.
- **Skill loading instruction placement:** Place the skill-loading instruction near the top of `project-context.md`, similar to how `_skill-loading.md` is injected. The instruction should be a mandatory "load this skill before proceeding" directive, matching the pattern: "Load the pio-project-knowledge skill for PROJECT file knowledge. Find it using the path in `<available_skills>` or at `src/skills/pio-project-knowledge/SKILL.md`."
- **Balance reduction with completeness:** Don't remove Phase 1 analysis instructions (those tell the agent _how to research_). Focus reduction on Phase 2 and Phase 4 where PROJECT file structure is currently encoded inline. The skill provides this; the prompt should reference it.
- **Reference prior decision from Step 1:** The SKILL.md update rules are organized as tables per PROJECT file, mapping decision categories to target sections. This structure is the canonical reference — the prompt should point agents there rather than duplicating.

## Dependencies

- Step 1 must be completed (pio-project-knowledge SKILL.md exists and is approved)

## Files Affected

- `src/index.ts` — modified: add `pio-project-knowledge` to `skillPaths` array in `resources_discover` handler
- `src/prompts/project-context.md` — modified: add skill-loading instruction, defer PROJECT file structure details to the pio-project-knowledge skill

## Acceptance Criteria

- [ ] `src/index.ts` includes the pio-project-knowledge skill path in `skillPaths` array (`src/skills/pio-project-knowledge`)
- [ ] `src/prompts/project-context.md` includes instructions to load the pio-project-knowledge skill before proceeding
- [ ] Project-context prompt still functions correctly — all 7 files are documented via the skill reference
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Prompt size reduction vs. completeness:** Over-reducing inline guidance might leave the project-context agent without enough direction. Retain analysis instructions (Phase 1) and output format templates (Phase 4) — only defer structural details to the skill.
- **Skill path resolution:** The skill loading instruction must reference a path that sub-sessions can resolve. Using the `<available_skills>` block is the standard approach; hardcoding paths should be avoided.
- **Backwards compatibility:** Existing `.pio/PROJECT/` files shouldn't be affected — this change only affects how future project-context sessions behave.
