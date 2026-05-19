# Task: Standardize all lifecycle hooks in types (`types.ts`)

Add `postValidate` and `postExecute` callback types to `StaticCapabilityConfig` and `CapabilityConfig`, documenting the full four-phase capability lifecycle.

## Context

The pio extension currently documents only two lifecycle hooks explicitly in types: validation (PreValidate, inline) and Prepare (`prepareSession`). The PostValidate and PostExecute phases exist conceptually in GOAL.md and will be wired in Steps 5–6, but are not yet reflected in the type system. This step adds the missing types so downstream steps have a type-safe contract to implement against.

## What to Build

Add two new callback types and add corresponding optional fields to both `StaticCapabilityConfig` and `CapabilityConfig` in `src/types.ts`. Add a block comment documenting all four lifecycle phases with trigger points.

### Code Components

#### 1. `PostValidateCallback` type

```typescript
/** Lifecycle hook that runs after file-existence validation passes but before transition routing. Can fail to keep the agent in the session to fix issues. */
type PostValidateCallback = (goalDir: string, params?: Record<string, unknown>) => { success: boolean; message?: string };
```

- Returns an object with `success: boolean` and optional `message?: string`.
- On `success: false`, the agent stays in session to fix issues. The `message` is returned as error feedback to the agent.
- On `success: true`, the flow continues to transition routing.
- Synchronous return (no Promise) — validation should be fast I/O or pure logic.

#### 2. `PostExecuteCallback` type

```typescript
/** Lifecycle hook that runs after transition routing + task enqueuing completes. Applies irreversible side effects or capability-specific cleanup. */
type PostExecuteCallback = (goalDir: string, params?: Record<string, unknown>) => void | Promise<void>;
```

- Runs once validation passes and transitions are resolved.
- May be async (supports `Promise<void>`) — may need to perform I/O like writing marker files, deleting stale artifacts.
- No return value — side effects only. Errors here do not affect transition outcomes.

#### 3. Add fields to `StaticCapabilityConfig`

Add optional fields following the existing `prepareSession` pattern:

```typescript
interface StaticCapabilityConfig {
  // ... existing fields ...
  postValidate?: PostValidateCallback;
  postExecute?: PostExecuteCallback;
}
```

#### 4. Add fields to `CapabilityConfig`

Add matching optional fields:

```typescript
interface CapabilityConfig {
  // ... existing fields ...
  postValidate?: PostValidateCallback;
  postExecute?: PostExecuteCallback;
}
```

#### 5. Lifecycle documentation block comment

Add a JSDoc block comment above the capability config types documenting all four phases in order:

1. **PreValidate** — inline validation at tool/command invocation, before queuing a session. No hook type (remains per-capability inline code).
2. **Prepare** (`prepareSession`) — runs on session startup during `resources_discover`. Hook type exists.
3. **PostValidate** — runs after file-existence validation passes but before transition routing. Can fail to keep agent in session. New hook type.
4. **PostExecute** — runs after transition routing + task enqueuing. Applies irreversible side effects. New hook type.

The comment should describe: what each phase does, when it's triggered, and whether it has a typed hook or remains inline.

### Approach and Decisions

- Follow the exact pattern established by `PrepareSessionCallback`: define the callback type, add optional field to both interfaces with JSDoc comments.
- Both `postValidate` and `postExecute` are optional — capabilities without these hooks simply omit them (same as `prepareSession`).
- Place lifecycle documentation comment above `CapabilityConfig` or `StaticCapabilityConfig` — whichever provides better top-level visibility. A single block comment covering both interfaces is preferred.
- **No behavioral changes.** This step adds only types and comments. Step 5 wires them through `capability-config.ts`; Step 6 wires them into `session-capability.ts`.

**Prior decisions relevant to this step** (from DECISIONS.md):
- The typebox deviation does not directly affect this step, but ensures that PostValidate implementations (Step 5) will use typebox schemas for validation — matching the return shape `{ success: boolean; message?: string }` from `PostValidateCallback`.

## Dependencies

- **Step 1** (shared frontmatter module): must be complete so Step 5's postValidate implementation can import from it. This step itself has no runtime dependency on Step 1's output — it only adds types.
- **Step 2** (review-task schema): reviewed for context but not a hard dependency.
- **Step 3** (GoalState.getReviewOutputs): reviewed for context but not a hard dependency.

## Files Affected

- `src/types.ts` — add `PostValidateCallback` and `PostExecuteCallback` types; add `postValidate` and `postExecute` to both `StaticCapabilityConfig` and `CapabilityConfig`; add lifecycle documentation block comment

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] Both `StaticCapabilityConfig` and `CapabilityConfig` include `postValidate` as an optional field of type `PostValidateCallback`
- [ ] Both `StaticCapabilityConfig` and `CapabilityConfig` include `postExecute` as an optional field of type `PostExecuteCallback`
- [ ] `PostValidateCallback` has signature: `(goalDir: string, params?: Record<string, unknown>) => { success: boolean; message?: string }`
- [ ] `PostExecuteCallback` has signature: `(goalDir: string, params?: Record<string, unknown>) => void | Promise<void>`
- [ ] Block comment documents all four lifecycle phases (PreValidate, Prepare, PostValidate, PostExecute) with trigger points
- [ ] Existing test suite passes with no regressions (`npx vitest run`)

## Risks and Edge Cases

- **Type name consistency:** Ensure the new types follow existing naming convention (`PrepareSessionCallback` → `PostValidateCallback`, `PostExecuteCallback`). Do not introduce inconsistent naming.
- **No breaking changes:** Adding optional fields to interfaces is backward-compatible. Existing capabilities without these hooks continue to work unchanged.
- **Export visibility:** The new callback types should be exported (like `PrepareSessionCallback`) so consumers like `capability-config.test.ts` can reference them directly for type verification tests.
