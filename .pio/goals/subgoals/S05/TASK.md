# Task: Dimension 5 — File protection scope

Analyze `src/guards/validation.ts` and verify correctness of write restrictions for nested subgoal sessions, identifying any scoping gaps and read-access requirements.

## Context

GOAL.md defines nine dimensions for the subgoals feasibility study. Step 5 covers Dimension 5: **File protection scope**. The feasibility study is produced as `FEASIBILITY.md` in the goal workspace root, written incrementally across steps 1–9. Previous steps (Dimensions 1–4) have already appended their sections.

Prior decisions from Steps 1–4 (in `DECISIONS.md`) are relevant: subgoals nest at `S{NN}/subgoals/<name>/`, the state machine uses new transitions for spawning, and `create-plan` is the primary initiation point. These structural decisions determine what paths a subgoal session's `workingDir` will resolve to.

## What to Build

Produce the "Dimension 5: File protection scope" section of `FEASIBILITY.md`. This is a **research-and-documentation output only** — no code implementation.

The analysis must cover three major areas:

### Part A: Current write protection behavior for nested paths

1. **Analyze the default-deny check:** In `validation.ts`, the core permission check is `tp.startsWith(workingDir + path.sep) || tp === workingDir`. Prove (or disprove) that this correctly isolates a subgoal session to its own directory:
   - For `workingDir = /repo/.pio/goals/parent/S03/subgoals/nested/`, does this block writes to `/repo/.pio/goals/parent/S03/TASK.md`? (Should block — not inside workingDir)
   - Does this block writes to sibling subgoals like `/repo/.pio/goals/parent/S03/subgoals/other/`? (Should block — different prefix)
   - Does this allow writes within the subgoal's own directory? (Should allow)

2. **Identify the workingDir assignment gap:** The `workingDir` for a subgoal session is set via `resolveCapabilityConfig()` in `capability-config.ts`. Currently, derivation follows: `explicit params.workingDir > resolveGoalDir(cwd, goalName) > cwd fallback`. For a nested subgoal, `resolveGoalDir` produces flat paths — it cannot resolve to `S03/subgoals/nested/`. Document how `params.workingDir` must be explicitly passed for nested goals and what changes are needed in the spawning transition (from Dimension 3) to supply this value.

3. **Analyze the write-allowlist behavior for nested paths:** When `writeAllowlistPaths` is configured, writes are restricted to exact matches only. For a subgoal session writing FEASIBILITY.md or other files outside its own `workingDir`, the allowlist must include absolute paths to parent-level files. Document:
   - How `writeAllowlistPaths` are resolved (via `path.resolve(config.workingDir!, f)`) — relative to workingDir
   - Whether a subgoal session can write to a file in the *parent* goal workspace (e.g., parent's FEASIBILITY.md, parent step SUMMARY.md)
   - The gap: if a subgoal needs to write to files outside its own directory, current allowlist resolution cannot express parent-relative paths

### Part B: Read access requirements

4. **Document what files a subgoal session needs to READ from the parent:** A subgoal session needs context about the parent goal and step. Map out specific file reads:
   - Parent `GOAL.md` — for overall goal context
   - Parent `PLAN.md` — to understand where this subgoal fits in the larger plan
   - Parent step's `TASK.md` (if one was written before subgoal spawning) or the step description from PLAN.md — for specific scope/acceptance criteria
   - Sibling subgoal outputs (if coordination is needed between parallel decomposition paths)

5. **Assess whether read protection is a concern:** The validation engine (`tool_call` handler in `validation.ts`) protects *writes* only — it does not restrict reads. Read access to parent files should work naturally since:
   - Tool calls like `read`, `bash` are not intercepted by the write-protection handler
   - The LLM can request reads to any path
   - However, prompt injection (`session-capability.ts`) loads project context from `resolveProjectContextPath(process.cwd())` — for a subgoal, this resolves correctly because `process.cwd()` is the repo root

6. **Determine if parent context should be injected into subgoal prompts:** Evaluate two approaches:
   - **Approach A (prepareSession hook):** Read parent GOAL.md and relevant PLAN.md step content during `prepareSession` and inject as initial message context
   - **Approach B (no injection):** Rely on the LLM to read parent files on its own when needed — no scoping changes required

### Part C: Scoping recommendations

7. **Recommend explicit scoping changes** (if any) to `validation.ts`. Consider:
   - Should the default-deny check explicitly handle edge cases (e.g., path traversal via `../`)?
   - Should a new write-allowlist mode support "parent-relative" paths? Or is exact absolute-path matching sufficient?
   - Is the current design already correct for nested paths when `workingDir` is set properly?

8. **Categorize each change:** Mark as new fields, new logic, or breaking change.

### Code Components

No code components — this is a feasibility analysis document. However, the executor should research and reference:

- **`src/guards/validation.ts`:** Core file protection logic. Study `setupValidation`, the `tool_call` handler, the `workingDir` check (`tp.startsWith(workingDir + path.sep)`), write-allowlist resolution, and read-only blocklist.
- **`src/capability-config.ts`:** How `workingDir` is derived via `resolveCapabilityConfig()`. Understand that `params.workingDir` can be set explicitly — this is the mechanism for nested subgoals.
- **`src/capabilities/session-capability.ts`:** How config flows into sessions via `launchCapability()` and `newSm.appendCustomEntry("pio-config", config)`. The config (including workingDir, readOnlyFiles, writeAllowlist) survives into the sub-session as custom entry data.

### Approach and Decisions

- Follow the structure established in previous Dimensions 1–4: analysis → evaluation of options → clear recommendation → change categorization.
- Reference the nesting structure (`S{NN}/subgoals/<name>/`) from Dimension 1 — all path examples must use this convention.
- Reference the state machine spawning mechanism (new transition in `transitionEvolvePlan`) from Dimension 3 — this transition must pass explicit `workingDir` for nested subgoals.
- **Cross-reference with Dimensions 1 and 8:** Path resolution changes (`resolveGoalDir`, cwd derivation) directly impact how `workingDir` is computed. If Dimension 8 introduces a nested-aware resolver, the file protection scoping may require fewer explicit changes. Document this dependency.

## Dependencies

- Step 1 (Dimension 1 — Nesting structure): needed to understand the `S{NN}/subgoals/<name>/` path convention
- Step 3 (Dimension 3 — State machine extensions): needed to understand how subgoal spawning must pass `workingDir`
- `FEASIBILITY.md` must already exist with Dimensions 1–4 sections from previous steps

## Files Affected

- `.pio/goals/subgoals/FEASIBILITY.md` — append: Dimension 5 analysis section

## Acceptance Criteria

- `FEASIBILITY.md` contains a "Dimension 5: File protection scope" section.
- Section analyzes current validation behavior for nested paths (proves correctness or identifies gaps).
- Section documents the `workingDir` assignment gap — how nested subgoals cannot currently get correct `workingDir` via `resolveGoalDir`.
- Section analyzes write-allowlist behavior for parent-level file writes (documents the gap with relative path resolution).
- Section addresses read-access requirements (what parent files a subgoal needs to read, and whether current design already supports this).
- Section evaluates at least two approaches for injecting parent context into subgoal sessions.
- Section recommends any explicit scoping changes needed to `src/guards/validation.ts`.
- Each change is categorized as new fields, new logic, or breaking change.
- Cross-references to at least 2 other dimensions are present (especially Dimensions 1, 3, and 8).

## Risks and Edge Cases

- Path traversal via `../` in tool call inputs: `path.resolve()` normalizes these, but verify that the `startsWith(workingDir + path.sep)` check still works after normalization.
- If a subgoal's `workingDir` is not explicitly set (falls back to `resolveGoalDir`), it resolves to a flat path — writes would be allowed to the wrong directory. This is a critical failure mode if the spawning transition doesn't pass explicit params.
- The write-allowlist resolves paths relative to `workingDir`. If a subgoal needs to write to the parent's FEASIBILITY.md, the allowlist cannot express `../../FEASIBILITY.md` (it would resolve to an absolute path above workingDir, which may or may not work correctly).
- Read-only blocklist: if a parent-level file is marked read-only for the subgoal session, should it be? This depends on what files are listed in `readOnlyFiles`.
