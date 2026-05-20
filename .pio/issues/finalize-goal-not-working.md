# fix: finalize-goal implementation doesn't work — missing goal name in initial message, PROJECT files not writable

The `finalize-goal` capability (from goal `finalize-goal`, S06) is implemented but doesn't work. Two critical issues prevent the agent from functioning correctly.

## Issue 1: Goal name not passed in the initial message

The `defaultInitialMessage` in `src/capabilities/finalize-goal.ts` constructs the message using only `workingDir` and `params.goalDir`:

```typescript
defaultInitialMessage: (workingDir, params) => {
  const goalDir = typeof params?.goalDir === "string" ? params.goalDir : "";
  return `Finalize the completed goal workspace at ${goalDir}. Read accumulated decisions (DECISIONS.md from the highest-numbered step folder), PLAN.md, and per-step SUMMARY.md files. Evaluate each decision against the update rules from the pio-project-knowledge skill. Update the 7 PROJECT files under ${workingDir}/.pio/PROJECT/ where warranted. Produce a summary of all changes made.`;
},
```

The goal **name** is never included in this message. The agent sees a raw path (e.g., `/home/user/project/.pio/goals/finalize-goal`) but not the human-readable goal name (`finalize-goal`). This matters because:

- The finalize-goal prompt instructs the agent to identify which goal it's working on
- Other capability messages include the goal name explicitly (e.g., `create-plan`, `evolve-plan`)
- Without the goal name, error messages and diagnostics are less actionable

**Fix:** Pass `goalName` in params or derive it from `goalDir`, and include it in `defaultInitialMessage`. The message should say something like: "Finalize the completed goal workspace **&quot;** — not just a raw path.

## Issue 2: `.pio/PROJECT/*.md` files are not writable (allowlist resolution broken)

The `CAPABILITY_CONFIG.writeAllowlist` lists relative paths:

```typescript
writeAllowlist: [
  ".pio/PROJECT/OVERVIEW.md",
  ".pio/PROJECT/DEVELOPMENT.md",
  // ... 5 more
],
```

These resolve relative to `workingDir`. But the state machine transition in `src/state-machine.ts` line 59 passes `goalName`, not `goalDir`:

```typescript
// state-machine.ts, line 58-59
if (state.goalCompleted()) {
  return { capability: "finalize-goal", params: { goalName } };
```

When `resolveCapabilityConfig()` sees `goalName` in params, it sets `workingDir = resolveGoalDir(cwd, goalName)` — pointing to the **goal workspace** (`.pio/goals/<name>/`). This means `.pio/PROJECT/OVERVIEW.md` resolves to `.pio/goals/<name>/.pio/PROJECT/OVERVIEW.md` — which doesn't exist.

The tool (`src/capabilities/finalize-goal.ts` line 96) was fixed to pass `goalDir` instead of `goalName` in enqueue params:

```typescript
enqueueTask(ctx.cwd, params.name, {
  capability: "finalize-goal",
  params: { goalDir: result.goalDir },
});
```

But the **state machine auto-transition** (line 59) still passes `goalName`. When evolve-plan detects goal completion and auto-enqueues finalize-goal, it goes through the broken path. The tool-manual invocation might work, but the automatic workflow transition is broken.

**Fix:** Change `src/state-machine.ts` line 59 from:
```typescript
return { capability: "finalize-goal", params: { goalName } };
```
to:
```typescript
return { capability: "finalize-goal", params: { goalName, goalDir: resolveGoalDir(cwd, goalName) } };
```

Or better yet — use `goalDir` exclusively (no `goalName`) to keep `workingDir = cwd`, following the pattern established in DECISIONS.md for project-scoped capabilities. The state machine may need access to `resolveGoalDir` or an alternative way to compute the goal directory.

## Files involved

- `src/capabilities/finalize-goal.ts` — tool, command, CAPABILITY_CONFIG
- `src/state-machine.ts` — line 59: `transitionEvolvePlan()` passing `goalName` instead of `goalDir`
- `src/capability-config.ts` — `resolveCapabilityConfig()` sets `workingDir` based on presence of `goalName` in params


## Category

bug

## Context

Related to goal `finalize-goal` S06. The DECISIONS.md documented the `goalDir` vs `goalName` pattern, but the state machine transition was not updated. Tests pass because the completion test checks for `{ capability: "finalize-goal" }` without verifying that the resulting session actually has correct workingDir/allowlist resolution.
