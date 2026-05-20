# Accumulated Decisions (Steps 1–5)

## Plan Deviation: No `lastStepDecisions()` in GoalState

**Decision:** The `lastStepDecisions()` method was never added to `GoalState`. Future capabilities needing DECISIONS.md content should scan step folders directly or pass the goal workspace path to agents for self-discovery.

**Reasoning:** Zero consumers within finalize-goal — the agent handles file discovery itself. Adding a typed API with no callers is over-abstraction.

**Downstream impact:** Any future capability that needs accumulated decisions must either: (a) read step folders directly using `fs-utils.ts` helpers, or (b) pass the goal workspace path in params and let the session agent discover files itself.

## Capability Params: `goalDir` vs `goalName` Distinction

**Decision:** When a capability's `workingDir` should be `cwd` (not a goal directory), pass `goalDir` in params — never `goalName`. The `resolveCapabilityConfig()` function sets `workingDir` to the goal dir when it sees `goalName` in params.

**Reasoning:** Finalize-goal needs `workingDir = cwd` so that `.pio/PROJECT/*.md` resolves relative to the repo root, not a goal workspace. Passing `goalName` would incorrectly redirect workingDir.

**Downstream impact:** Any future project-scoped capability (writing to `.pio/PROJECT/` or other repo-root paths) must follow this pattern: pass `goalDir` instead of `goalName` in enqueue params to preserve correct workingDir resolution.

## writeAllowlist for Project-Scoped Capabilities

**Decision:** Capabilities that write to `.pio/PROJECT/*.md` use `cwd` as `workingDir`, not a goal directory. The writeAllowlist lists relative paths (e.g., `.pio/PROJECT/OVERVIEW.md`) that resolve from cwd.

**Reasoning:** PROJECT files live at repo root, not inside goal workspaces. The file protection guard resolves allowlist paths relative to workingDir.

**Downstream impact:** Future capabilities writing to PROJECT files must follow the project-context.ts and finalize-goal.ts pattern: `workingDir = cwd`, writeAllowlist with `.pio/PROJECT/*.md` paths.

## pio-project-knowledge Skill Structure

**Decision:** The `src/skills/pio-project-knowledge/SKILL.md` organizes update rules as per-file tables mapping decision categories → target PROJECT file + section + action. This is the canonical knowledge source for all 7 PROJECT files.

**Downstream impact:** Future agents that create or update PROJECT files should load this skill rather than encoding file structure inline. Reduces duplication and keeps knowledge centralized.
