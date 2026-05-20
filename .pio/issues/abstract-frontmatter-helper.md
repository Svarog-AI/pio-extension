# Evaluate abstracting getReviewOutputs/planMetadata into a shared frontmatter helper

## Problem

`getReviewOutputs()` and `planMetadata()` in `src/goal-state.ts` share an identical control-flow pattern:

1. Construct a file path
2. `extractFrontmatter(path)` → null check
3. `validateAndCoerce<T>(raw, SCHEMA)` → error check
4. Branch on `options?.errors`: return `{ error }`, `null` (with `console.warn`), `{ data }`, or typed data

The only differences are the file path, schema, and type parameter.

## Question

Is this duplication worth abstracting, or is the current explicit code clearer for just two callers?

## Considerations

- **For abstraction:** A generic helper `readFrontmatter<T>(path, schema, label, options)` in `src/frontmatter.ts` would eliminate ~30 lines of repeated branching logic per caller. Future frontmatter consumers (e.g., GOAL.md metadata) would benefit automatically.
- **Against abstraction:** Two callers is a low count. The inline code is self-documenting — a reader sees the full flow without jumping to a helper. The helper would add a layer of indirection for marginal gain.
- **`totalPlanSteps()` complication:** This method also duplicates the extract+validate logic but with a simplified return path (`number | undefined`). A helper would need to support both the full `{ errors }` contract and the simple "return value or fallback" contract.

## Files involved

- `src/goal-state.ts` — `getReviewOutputs()`, `planMetadata()`, `totalPlanSteps()`
- `src/frontmatter.ts` — potential home for a generic helper

## Category

idea

## Context

File: src/goal-state.ts, lines ~182-213 (planMetadata) and ~292-320 (getReviewOutputs). Both follow the extractFrontmatter → validateAndCoerce → errors-mode branching pattern.
