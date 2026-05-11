# Reduce verbosity in generated files — produce concise, essential-only output

## Problem

The prompt templates in `src/prompts/` tend to produce overly verbose output files. Generated documents contain unnecessary filler text, repetitive phrasing, and excessive elaboration that could be expressed more concisely.

## Scope

Apply this to all generated files **except** `PLAN.md`, which may retain more verbosity when needed for clarity:

- **GOAL.md** — Should capture the core objective, scope, and acceptance criteria without fluff.
- **TASK.md** — Each task should state what to do, why, and how to verify it. No preamble or summary paragraphs beyond what's needed.
- **TEST.md** — Test definitions should be direct and specific. One criterion per line/item where possible.
- **SUMMARY.md** (produced after `pio_execute_task`) — Should list what was done, files changed, and any issues encountered. Bullet points over prose.
- **REVIEW.md** (produced after `pio_review_code`) — Issues should be categorized and stated concisely. Approval/rejection decision with brief justification.
- **PROJECT.md** (produced by `pio_create_project_context`) — Should be a dense reference document, not a narrative. Use tables, lists, and structured sections.

## Action required

1. Audit all prompt templates in `src/prompts/` for language that encourages verbosity ("provide a detailed overview", "explain thoroughly", etc.).
2. Add explicit instructions to keep output concise: "Be terse. Omit filler. State only what is necessary." or similar phrasing tailored per file type.
3. Where appropriate, enforce structural constraints (e.g., "max 3 sections", "use bullet points, not paragraphs") to naturally limit verbosity.

## Files to examine

- `src/prompts/create-goal.md`
- `src/prompts/create-plan.md` (may relax conciseness here — plan benefits from context)
- `src/prompts/evolve-plan.md`
- `src/prompts/execute-plan.md`
- `src/prompts/project-context.md`


## Category

improvement

## Context

Generated files are produced by prompt templates injected as system prompts during sub-sessions. Each template in `src/prompts/` controls the output style and structure of its respective file type. The skill file at `src/skills/pio/SKILL.md` may also contain relevant instructions worth updating.
