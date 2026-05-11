# Detect and interrupt agent refinement loops (e.g., repeated writes to the same file)

## Problem

Agents can get stuck in refinement loops — repeatedly writing or editing the same file without making meaningful progress. For example, a planning session rewrote `PLAN.md` ~5 times with incremental prose improvements instead of calling `pio_mark_complete`. Each iteration felt "slightly better" but never crossed a threshold of "done."

This wastes time and prevents task completion. The agent has no mechanism to self-diagnose: "I've rewritten this file N times without progressing — I should ship it now."

## Proposed solution

Add loop detection that triggers when an agent performs the same action too many times in a row. Possible signals:

1. **Repeated writes to the same file:** If `write` is called on the same path ≥3 times within a single turn (or across consecutive turns), flag it and warn the agent.
2. **Missing completion call after repeated edits:** If the expected output file has been written N times but the completion tool (`pio_mark_complete`, etc.) hasn't been called, nudge the agent.
3. **Turn-level stagnation:** If a turn consists entirely of read→write cycles on the same small set of files with no progress markers (no new files created, no tools called), interrupt and suggest shipping.

## Implementation options

- **Prompt-based:** Add explicit guidance to capability prompts: "Write output once, verify structure has all required sections, call the completion tool. If revising after review, fix issues in one targeted edit — not a full rewrite."
- **Event-handler based:** Use the `tool_call` event (already used in `validation.ts`) to track repeated writes and inject a warning message when thresholds are exceeded.
- **Both:** Prompt guidance as first line of defense + event handler as safety net.

## Scope question

Is this a pi core feature or a pio extension concern? The loop pattern affects any long-running agent session, not just pio workspaces. However, pio already has the `tool_call` event handler and could prototype detection there before proposing upstream to pi.

## Category

improvement

## Context

Observed during evolve-plan planning session: agent rewrote PLAN.md 5+ times without calling pio_mark_complete. The file had all required sections after the first rewrite; subsequent passes only polished prose and formatting. No tool failure, no user ambiguity — pure over-optimization loop.
