# Revise-plan should prioritize archived PLAN.md over GOAL.md for implementation details

## Problem

During `revise-plan`, the Plan Revision Agent was given conflicting signals about what source of truth to use. The prompt says "Read GOAL.md — this is your contract," but the actual revision context comes from decisions made during `evolve-plan` that refined implementation details in the original PLAN.md.

## What happened

On a revise-plan triggered from Step 1 of `execute-task-auto-commit`, the revision notes (from evolve-plan) identified one specific change needed: skill registration infrastructure in `src/index.ts`. The archived PLAN.md contained deliberate implementation decisions — notably short one-liner commit messages without "Step N" substrings, and treating `.pio/PROJECT/GIT.md` as read-only.

The revise-plan agent **ignored the archived plan's decisions** and instead re-read GOAL.md, which specified different implementation details (e.g., `pio: Step N — <step title>` format, modifying GIT.md). The resulting plan had 4 steps instead of 3, added a GIT.md modification step that wasn't in the original scope, and reverted commit message formatting decisions that were deliberately chosen during planning.

## Root cause

The revise-plan prompt doesn't clearly establish priority ordering between:
1. **GOAL.md** — high-level contract (what problem to solve)
2. **Archived PLAN.md** — implementation decisions already made by the planning agent (how to solve it)  
3. **Revision notes** — specific changes required from evolve-plan

The prompt says "Read GOAL.md — this is your contract" and instructs to read archived plans "for reference." This language implies GOAL.md takes priority, but during revision, the archived plan's implementation details are more authoritative than GOAL.md's high-level spec. GOAL.md describes *what* should be built; PLAN.md describes *how*. Revise-plan should preserve the *how* unless explicitly told to change it.

## Proposed fix

Update the revise-plan prompt (and/or pio-planning skill) to explicitly state:

> **During revision, the archived PLAN.md is the primary reference for implementation details.** GOAL.md provides scope and context but does not override specific decisions already encoded in PLAN.md. Preserve all implementation details from the archived plan unless the revision notes explicitly require a change. The only modifications should be:
> 1. Changes explicitly requested in the revision notes/decisions
> 2. New steps required to address gaps discovered during specification
> 3. Re-numbering to account for completed steps

This establishes a clear hierarchy: revision notes > archived PLAN.md > GOAL.md (for implementation details).


## Category

improvement

## Context

Prompt: src/prompts/revise-plan.md — Step 2 says "Read it for reference" (underemphasizes importance)
Goal: execute-task-auto-commit — revision triggered from Step 1 resulted in incorrect plan divergence. Archived plan: PLAN_ARCHIVE/PLAN-2026-05-24T073227900Z.md
