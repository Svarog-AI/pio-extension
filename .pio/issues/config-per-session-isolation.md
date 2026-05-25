# Ensure CapabilityConfig is a fresh object per session — no cross-session mutation persistence

## Problem

`prepareSession` hooks (execute-task, review-task) mutate the runtime config via `setMergedSkills()` to inject per-step skills. The current approach relies on implicit guarantees: sub-sessions run in separate processes, and module-level `currentConfig` is reassigned each session startup. However, this leaves mutation persistence as an accidental invariant — future changes (in-process session reuse, pi framework changes) could easily break isolation without anyone noticing.

## Key mutation points

1. **`setMergedSkills()`** in `src/capabilities/session-capability.ts:68-72` — assigns a new object to `currentConfig.skills`
2. **`mergeCapabilitySkills()`** reads from static `CAPABILITY_CONFIG.skills` (safe, never mutated) and returns a fresh merged object
3. **`resolveCapabilityConfig()`** in `src/capability-config.ts` — creates a new config object per call but passes `skills: config.skills` which is a reference to the static `CAPABILITY_CONFIG.skills`

## Desired guarantee

Each session receives its own independent `CapabilityConfig` object — mutations by `prepareSession`, `before_agent_start`, or any downstream hook cannot affect a subsequent session. This should be enforced structurally, not just by documentation conventions.

## Suggested refactor directions (pick one during planning)

1. **Deep-clone at resolution time:** `resolveCapabilityConfig()` returns a deep-cloned config. Any mutation is scoped to that clone. Simple but potentially overkill for non-mutated fields.
2. **Return-based prepareSession:** Change the `prepareSession` contract to return merged skills instead of mutating via `setMergedSkills()`. The resolved config is built from the return value — no module-level mutation at all.
3. **Structural clone + explicit merge at launch time:** Deep-clone only the mutable fields (`skills`) when building the final config passed to `launchCapability()`. Keep static config pristine.

## Files involved

- `src/capabilities/session-capability.ts` — `setMergedSkills()`, `currentConfig`, `buildSkillLoadingSection()`
- `src/capability-config.ts` — `resolveCapabilityConfig()`, skills passthrough
- `src/capabilities/execute-task.ts` — `prepareExecuteSession` calls `setMergedSkills()`
- `src/capabilities/review-task.ts` — `prepareReviewSession` calls `setMergedSkills()`
- `src/types.ts` — `CapabilityConfig` type definition (may need immutability annotations)


## Category

improvement

## Context

Related to the skill-prioritization goal (Steps 6-8). Discovered during evolve-plan Step 9 where Step 8 (`consume-task-skills-in-prepare-session`) uses `setMergedSkills()` to mutate module-level state. The plan notes say "Mutating config.skills in prepareSession is reflected in currentConfig when buildSkillLoadingSection() runs, since both reference the same object." This relies on shared mutability — desirable for intra-session coordination but potentially dangerous if sessions share module state.
