# Specification Writer enters rewrite loops — paraphrases TASK.md instead of applying targeted edits

## What happened

During plan-frontmatter Step 6, the Specification Writer entered a loop of rewriting TASK.md from scratch (~8 full `write` calls) in response to incremental feedback. Each rewrite paraphrased the same content with minor changes rather than applying targeted `edit` replacements.

## Pattern

1. Feedback arrives (e.g., "use `totalPlanSteps()` not `planMetadata()`")
2. Agent reads the file, then **rewrites the entire file** instead of editing the specific section
3. New rewrite includes expanded prose, rephrased sections, additional context — all unchanged from what was already correct
4. User asks "are you looping?" — agent acknowledges but produces another full rewrite
5. Cycle repeats until user intervenes

## Root cause

The evolve-plan prompt says "Write `TASK.md` into the `S{NN}/` folder" which encourages full writes. No guidance exists for handling incremental feedback. The agent defaults to `write` (overwrite) rather than `edit` (targeted replacement). Combined with a tendency to prose-stretch when rewriting, this produces endless cycles of near-identical files.

## Proposed fix (evolve-plan.md prompt updates)

1. **Prefer `edit` over `write`:** After the initial write, use `edit` for incremental changes. Match `oldText` to the specific region that needs updating.
2. **Check before rewriting:** Read existing TASK.md first. If it already addresses the feedback, stop — don't rewrite.
3. **Single-pass discipline:** Apply the requested change once. Don't "improve everything while you're at it."
4. **Stop condition:** After making changes, verify against acceptance criteria. If met, call `pio_mark_complete`. Don't keep refining on subsequent feedback unless a concrete issue is identified.

## Impact

Wastes tokens and time. Produces git noise (multiple full rewrites of the same file). Frustrates users who have to repeatedly interrupt the loop.

## Category

bug

## Context

Observed during plan-frontmatter Step 6. Affects the Specification Writer agent defined in `src/prompts/evolve-plan.md`. May also affect other markdown-producing agents (Planning Agent, Execute Task Agent).
