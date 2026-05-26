# Force probing in create-plan prompt so agents grill the user without explicit request

## Problem

The planning agent skipped Step 3 entirely during `jira-integration` planning. It went straight from research to proposing steps instead of probing assumptions and validating feasibility. The user only got engagement after explicitly asking "anything you want to grill me about?"

## Root Causes

1. **Trigger condition is too permissive.** Prompt says "Be proactive about asking ... *when* research revealed ambiguity." That `when` clause makes probing conditional — the agent interpreted the goal as clear enough and skipped Step 3 entirely. Change it from a conditional recommendation to a mandatory gate:
   > **You must engage the user in Step 3 before designing steps.** Even when GOAL.md seems clear, probe feasibility and assumptions. You may keep it light (one summary + confirmation) if nothing genuinely needs resolving — but you cannot skip this step.

2. **No explicit checklist to work through.** The dimensions (feasibility, scope, constraints, downstream) were listed as considerations, not required questions. Add a short mandatory self-check before Step 4:
   > Before moving to Step 4, confirm you have addressed: external dependency feasibility, assumptions research couldn't verify, multiple valid approaches with trade-offs. If any item is unresolved, ask before proceeding.

3. **"Don't over-interview" guardrail is too strong.** The line "only ask when research genuinely revealed something unclear" signals that probing is the exception, not the default. Reframe it:
   > Keep Step 3 tight — one summary of findings and assumptions, followed by targeted questions only where gaps exist. Aim for 2-3 exchanges total. But always present findings and surface your assumptions first; don't silently decide they're fine.

4. **Missing explicit "surface untestable assumptions" instruction.** GOAL.md contained an "Open Assumptions" section (unknown `acli` JSON fields). The agent noted these in research but never surfaced them for confirmation. The prompt should require this:
   > If GOAL.md contains an "Open Assumptions" or similar section, present each one to the user and confirm your interpretation before committing to plan steps.

## Summary

The prompt describes probing beautifully but leaves whether to probe up to agent judgment. Make Step 3 a hard gate with a mandatory self-check, and lower the bar from "only ask when unclear" to "always surface assumptions, ask only where gaps remain."

## Category

improvement

## Context

Affected prompt: src/prompts/create-plan.md. Observed during planning session for goal `jira-integration` — agent skipped user engagement entirely until explicitly asked to grill.
