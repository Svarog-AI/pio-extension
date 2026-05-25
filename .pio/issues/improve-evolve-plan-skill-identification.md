# Strengthen Step 4.5 "Identify relevant skills" in evolve-plan prompt to prevent skill misses

## Problem

Step 4.5 of `src/prompts/evolve-plan.md` instructs spec writers to "consider ALL available skills" but provides no concrete heuristics for mapping task characteristics (file types, kinds of changes) to specific skills. The result: agents default to "no additional skills recommended" and miss obvious matches — e.g., rewriting `src/skills/grill-me/SKILL.md` without loading `write-a-skill`.

## Root cause

The current Step 4.5 is too abstract — it says to evaluate whether skills "could help" but doesn't give file-to-skill matching cues, and doesn't require *loading* skill docs before judging relevance (just scanning `<available_skills>` descriptions). Agents eyeball a `.md` rewrite, mentally file it as "just docs," and move on.

## Proposed fix

Replace Step 4.5 with three concrete improvements:

1. **File-to-skill lookup table** mapping file patterns to likely relevant skills (e.g., `src/skills/*/SKILL.md` → `write-a-skill`, `*.test.ts` → `test-driven-development`, git ops → `pio-git`, prompt/plan work → `pio-planning`).

2. **Require loading skill docs with `read`** before excluding them — not just scanning descriptions shallowly.

3. **"Do not default to no additional skills"** anti-pattern callout forcing agents to justify exclusions when a file pattern matches or any description plausibly overlaps.

## Files affected

- `src/prompts/evolve-plan.md` — Step 4.5 section (identify relevant skills)

## Category

improvement

## Context

Observed during the grill-me-planning-prompts goal (Step 1). TASK.md for rewriting SKILL.md did not recommend write-a-skill until caught by user review. See conversation in `.pio/goals/grill-me-planning-prompts/S01/` for the drafted replacement text.
