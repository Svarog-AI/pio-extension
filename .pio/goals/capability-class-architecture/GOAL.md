# Capability Class Architecture

Explore and evaluate refactoring the capability system from the current module-per-capability pattern (config objects + setup functions) into a class-based architecture. Produce a clear recommendation: either commit to a class-based design with a concrete sketch, or reject the refactor with justification that the current pattern is sufficient.

## Current State

Each capability is a module in `src/capabilities/*.ts`. There are two categories:

**Session-based capabilities** (create-goal, create-plan, evolve-plan, execute-task, review-task, execute-plan, project-context, create-issue, goal-from-issue, finalize-goal) follow a consistent pattern:

- **`CAPABILITY_CONFIG: StaticCapabilityConfig`** — declarative config object exported from the module. Contains `prompt`, optional `validation`, `readOnlyFiles`, `writeAllowlist`, `defaultInitialMessage`, and three optional lifecycle hooks (`prepareSession`, `postValidate`, `postExecute`). Config fields like `validation` or `writeAllowlist` can be either static values or callbacks (`ConfigCallback<T>`) that receive `(workingDir, params)` to produce step-dependent values.
- **`setupXxx(pi: ExtensionAPI)`** — registers a tool (via `defineTool`) and a command (via `pi.registerCommand`). The command handler validates inputs inline, resolves config via `resolveCapabilityConfig()`, then calls `launchCapability(ctx, config)`. The tool typically enqueues a task (via `enqueueTask`) instead of launching a session directly.
- **Validation/helper functions** — module-level pure functions like `validateAndFindNextStep`, `isStepReady`, or `resolveExecuteValidation` that encapsulate capability-specific pre-launch logic.

Shared behavior lives in **`src/capabilities/session-capability.ts`**:
- `launchCapability(ctx, config)` — creates a sub-session with `pio-config` as a custom entry containing the full `CapabilityConfig`.
- `setupCapability(pi)` — registers the shared `pio_mark_complete` tool (which orchestrates file validation → postValidate hook → transition routing → task enqueuing → postExecute hook → cleanup) and two event handlers: `resources_discover` (loads prompt, runs prepareSession) and `before_agent_start` (injects project context + capability prompt as a custom conversation message, resolves model switching).
- Module-level state variables track systemPrompt, projectContext, capabilityName, and enrichedSessionParams across the session lifecycle.

Config resolution is handled by **`src/capability-config.ts`**:
- `resolveCapabilityConfig(cwd, params)` dynamically imports `./capabilities/{capability}` by name, reads `CAPABILITY_CONFIG`, resolves callbacks with `(workingDir, params)`, and produces a full `CapabilityConfig`.

**Non-session capabilities** (init, delete-goal, parent, next-task, list-goals) are simpler — they export only `setupXxx()` registering a tool and/or command. No `CAPABILITY_CONFIG`, no session launch, no lifecycle hooks. They handle all logic inline.

The full wiring happens in **`src/index.ts`**: all `setupXxx(pi)` functions are called once at extension startup, plus the shared `setupCapability(pi)`, `setupValidation(pi)`, and `setupTurnGuard(pi)`.

Types defining the shape of everything live in **`src/types.ts`**: `StaticCapabilityConfig` (what each module exports), `CapabilityConfig` (resolved runtime config), `ValidationRule`, and three lifecycle callback types (`PrepareSessionCallback`, `PostValidateCallback`, `PostExecuteCallback`). The lifecycle has four documented phases: PreValidate (inline per-capability), Prepare (prepareSession hook), PostValidate (postValidate hook, can fail to keep agent in session), and PostExecute (postExecute hook, errors are non-fatal).

**Concrete examples of current complexity:**
- `review-task.ts` is the most complex session capability: it has step-dependent config callbacks (`resolveReviewValidation`, `resolveReviewReadOnlyFiles`, `resolveReviewWriteAllowlist`), a `prepareSession` hook that deletes stale markers, and a `postValidate` hook that parses frontmatter from REVIEW.md and creates APPROVED/REJECTED marker files.
- `execute-task.ts` has similar step-dependent callbacks plus re-execution detection (checks for REJECTED marker to customize the initial message).
- `create-goal.ts` is the simplest: static config, no lifecycle hooks beyond validation.

## To-Be State

The outcome of this goal is a **decision document** (captured in GOAL.md or as a follow-up plan) that answers six research questions and recommends one of three directions:

**Research questions to answer:**

1. **Which variant better captures current patterns?** Variant A (SessionCapability as a configurable class instantiated per-capability) vs Variant B (SessionCapability as a base class with capability subclasses overriding methods). The analysis should examine how well each maps the current config-object + callback pattern, and whether either handles non-session capabilities gracefully.

2. **Does either variant actually reduce boilerplate?** Current session capabilities repeat: imports, CAPABILITY_CONFIG declaration, validation helpers, tool definition, command handler, setup function. A class-based approach would need to prove it eliminates a meaningful amount of this — not just moves it into a constructor or base-class method. Concrete line-count or structural comparison required.

3. **How does class-based design affect testing?** Current functions (`validateAndFindNextStep`, `isStepReviewable`, `applyReviewDecision`) are pure and trivially testable. Class instances may require mocking `ExtensionAPI` or managing constructor injection. Does the refactor make it easier to isolate unit tests, harder, or roughly neutral?

4. **Does it improve type safety?** TypeScript already enforces `StaticCapabilityConfig` shape and lifecycle callback signatures via structural typing. Would a class hierarchy add meaningful compile-time guarantees beyond what interfaces + callbacks already provide?

5. **Can lifecycle hooks be expressed more naturally?** The current pattern uses three optional callbacks in `StaticCapabilityConfig` (`prepareSession`, `postValidate`, `postExecute`). Would overriding methods on a base class or configuring hooks on an instance feel more idiomatic? Does either approach clarify the four-phase lifecycle (PreValidate → Prepare → PostValidate → PostExecute)?

6. **What about non-session capabilities?** `pio_init`, `/pio-list-goals`, `/pio-parent`, and `/pio-next-task` don't launch sessions — they're tool/command only. A class hierarchy would need to account for them: either as a separate base class, as special cases, or by accepting that the refactor doesn't apply universally.

**Possible outcomes:**

- **Recommend Variant A (configurable instances):** If analysis shows encapsulating the common lifecycle in a `SessionCapability` class reduces duplication and improves clarity. Include a rough interface sketch showing how current capabilities would map.

- **Recommend Variant B (inheritance-based subclasses):** If analysis shows OOP inheritance provides meaningful benefits for hook expression, polymorphism, or future extensibility. Include a rough class hierarchy sketch.

- **Reject the refactor:** If analysis proves that config objects + functions already solve the problem well enough, that classes add indirection without reducing boilerplate, or that the current pattern is simpler to test and understand. This is a valid outcome — document the justification clearly (e.g., "callbacks express variation points adequately", "module-per-capability keeps concerns isolated", "no polymorphic behavior actually needed").

**Deliverable:** An updated GOAL.md or a PLAN.md with the decision, supporting analysis for each of the six questions, and either a rejection justification or a concrete architectural sketch for the chosen direction. No implementation code — this is an architectural evaluation, not a coding task.
