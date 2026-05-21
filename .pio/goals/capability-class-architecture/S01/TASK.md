# Task: Catalog current capability patterns

Systematically catalog all capability modules under `src/capabilities/` to establish a quantitative baseline for the class-architecture evaluation in subsequent steps.

## Context

The GOAL.md asks whether refactoring from config-object + callback modules to a class-based architecture would provide measurable benefits. Step 1 establishes the evidence base: exactly what patterns exist today, how much boilerplate is repeated, and how each capability maps to shared infrastructure. Without this catalog, Steps 2–3 cannot make grounded comparisons between variants A/B and the current pattern.

## What to Build

Produce an `ANALYSIS.md` file in the goal workspace (`.pio/goals/capability-class-architecture/ANALYSIS.md`) with a **"Current Patterns"** section containing:

### 1. Capability inventory table

A table listing every capability module with:
- Module filename
- Category: session-based, non-session, or hybrid (uses `launchCapability` but without its own `CAPABILITY_CONFIG`)
- Line count (from `wc -l`)
- Has tool? (`defineTool`)
- Has command? (`pi.registerCommand`)
- Has `CAPABILITY_CONFIG`?
- Lifecycle hooks present: `prepareSession`, `postValidate`, `postExecute`
- Config callbacks present: `validation`, `readOnlyFiles`, `writeAllowlist` (static or callback)

### 2. Boilerplate breakdown

For each category of capability, identify the repeated structural sections and quantify them:

**Shared boilerplate across session-based capabilities:**
- Import block pattern (typical imports: `ExtensionAPI`, `ExtensionCommandContext`, `defineTool`, `Type`, `fs`, `path`, `launchCapability`, `resolveGoalDir`, `enqueueTask`, `resolveCapabilityConfig`, `StaticCapabilityConfig`)
- `CAPABILITY_CONFIG` declaration block structure
- Tool definition pattern (`defineTool({...})`)
- Command handler function pattern (arg parsing → validation → config resolution → `launchCapability`)
- `setupXxx()` registration function

**Non-session capability boilerplate:**
- Import block
- Core logic function
- Tool definition / command handler
- `setupXxx()` registration

Provide approximate line counts per boilerplate section based on representative examples (simplest: `create-goal.ts` at 116 lines, most complex: `review-task.ts` at 421 lines).

### 3. Unique logic inventory

For each capability, document the capability-specific logic that would NOT be shared in a class hierarchy:
- **Validation functions:** e.g., `validateAndFindNextStep` (evolve-plan), `validateGoal` (create-plan), `validateStepForReview` + `validateAndFindReviewStep` (review-task)
- **Lifecycle callbacks:** e.g., `prepareReviewSession`, `postValidateReview`, `postValidateCreatePlan`
- **Config callbacks:** e.g., `resolveEvolveValidation`, `resolveReviewReadOnlyFiles`
- **Pure utility functions:** e.g., `isStepReady`, `isStepReviewable`, `applyReviewDecision`, `findMostRecentCompletedStep`
- **Helper functions:** e.g., `prepareGoal`, `inferPhase`, `launchAndCleanup`

### 4. Shared infrastructure dependencies

Document how each capability depends on shared modules:
- `session-capability.ts` — `launchCapability()`, `setupCapability()`, module-level state (`systemPrompt`, `projectContext`, `capabilityName`, `enrichedSessionParams`)
- `capability-config.ts` — `resolveCapabilityConfig()` (dynamic import + callback resolution)
- `types.ts` — `StaticCapabilityConfig`, `CapabilityConfig`, `ValidationRule`, lifecycle callback types
- `fs-utils.ts` — `resolveGoalDir()`, `stepFolderName()`, `goalExists()`, `discoverNextStep()`
- `queues.ts` — `enqueueTask()`, `readPendingTask()`, `listPendingGoals()`, `writeLastTask()`
- `goal-state.ts` — `createGoalState()`, step status querying
- `guards/validation.ts` — `validateOutputs()` (used inside `pio_mark_complete`)

### 5. Boilerplate vs unique logic quantification

Provide a summary showing:
- Total lines across all capability source files (excluding `.test.ts`)
- Estimated boilerplate lines (repeated patterns)
- Estimated unique logic lines (capability-specific behavior)
- Percentage breakdown per capability and overall
- Clear distinction between session-based (10) and non-session (4+) capabilities

## Code Components

This task produces **no source code**. The output is a single analysis document (`ANALYSIS.md`). Reference real file paths, type names, and function signatures from the codebase — do not invent module names or interfaces that don't exist.

### Approach and Decisions

- Use `wc -l` to get authoritative line counts for each `.ts` file in `src/capabilities/` (excluding `.test.ts`)
- Read each capability file to identify boilerplate sections vs unique logic
- Categorize capabilities by actual code patterns — session-based capabilities export `CAPABILITY_CONFIG` and use `launchCapability()`. Non-session capabilities register tools/commands but don't launch sessions. Hybrid capabilities (like `goal-from-issue.ts`) use `launchCapability` but reference another capability's config instead of defining their own.
- When measuring boilerplate, count structural sections (imports, config block, tool def, command handler, setup function) rather than exact line matches — some variation is expected between capabilities
- Focus on patterns, not code review quality

## Dependencies

None. This is the first step in the plan.

## Files Affected

- `.pio/goals/capability-class-architecture/ANALYSIS.md` — created: "Current Patterns" section with capability inventory, boilerplate analysis, unique logic inventory, shared dependencies, and quantification

## Acceptance Criteria

- [ ] ANALYSIS.md exists in the goal workspace with a "Current Patterns" section
- [ ] Section covers all 14 capabilities: line counts, boilerplate breakdown, and shared dependencies
- [ ] Analysis clearly distinguishes session-based from non-session capabilities
- [ ] Boilerplate vs unique logic quantification is present (line counts or structural comparison)

## Risks and Edge Cases

- Some capabilities don't fit cleanly into session/non-session categories (e.g., `goal-from-issue` uses `launchCapability` but references `create-goal`'s config; `project-context` has no tool, only command). Document these as hybrids or special cases rather than forcing them into binary categories.
- Line counts alone can be misleading — a 47-line capability (`project-context.ts`) is structurally similar to a 116-line one (`create-goal.ts`) minus the validation function. Combine quantitative measures with qualitative structural analysis.
- `session-capability.ts` (388 lines) and `capability-config.ts` are shared infrastructure, not per-capability modules. They should be documented but not counted as part of the capability boilerplate quantification.
