# Derive GoalState.steps() from plan frontmatter instead of filesystem scan

## Current behavior

`GoalState.steps()` scans the filesystem for `S{NN}` directories using a regex, then enriches each discovered step with metadata from PLAN.md frontmatter via `getMetadata()`.

## Problem

Two sources of truth for step numbers:
1. Filesystem scan (`/^S(\d+)$/` regex) discovers step numbers
2. Plan frontmatter `steps` array declares step numbers, names, and complexity

The filesystem scan is defensive (catches orphaned folders), but it creates unnecessary indirection. When frontmatter is valid, `steps()` could derive the step list directly from `planMetadata().steps`, with filesystem checks for status markers (`hasTask()`, `status()`) applied per-step.

## Proposed change

When `planMetadata()` returns valid data with a `steps` array:
- Derive step numbers from the `steps` array (index + 1)
- `getMetadata()` always returns data for valid steps (no null)
- Filesystem checks remain for status markers (COMPLETED, APPROVED, etc.)

When frontmatter is absent or invalid (old plans):
- Fall back to filesystem scan (current behavior)

## Benefits

- Single source of truth for step numbers
- `getMetadata()` never returns null for valid steps
- No regex scan needed for new plans
- Cleaner separation: frontmatter declares intent, filesystem reports actual state

## Category

improvement

## Context

Files: `src/goal-state.ts` (`steps()` method, `createStepStatus`, `readPlanFrontmatter` closure)
