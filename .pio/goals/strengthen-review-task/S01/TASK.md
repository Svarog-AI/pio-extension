# Task: Rename `review-code` → `review-task` everywhere

Perform a consistent rename across the entire codebase — file renames, capability name strings, tool/command names, function names, and all references in source files, test files, and documentation. No behavior changes; purely mechanical identifier updates.

## Context

The review capability is currently named `review-code` for historical reasons, but this is inconsistent with the naming pattern of other capabilities (`execute-task`, not `execute-code`). Step 1 renames everything to `review-task` so that Step 2 (strengthening the prompt) can focus on content changes without also tracking identifier updates. This rename must be complete and consistent — no remaining references to `review-code` should exist in `src/`.

## What to Build

A full find-and-replace of `review-code` → `review-task` across all identifiers, file names, strings, and references. The rename is exhaustive and mechanical:

### File Renames (3 files)

1. **`src/capabilities/review-code.ts`** → **`src/capabilities/review-task.ts`** — rename on disk, update all internal identifiers
2. **`src/prompts/review-code.md`** → **`src/prompts/review-task.md`** — rename file only; do not modify prompt content (content changes in Step 2)
3. **`src/capabilities/review-code.test.ts`** → **`src/capabilities/review-task.test.ts`** — rename on disk, update imports

### Identifier Updates Within Each File

#### `src/capabilities/review-task.ts` (was review-code.ts)
- Exported function: `setupReviewCode` → `setupReviewTask`
- Command handler: `handleReviewCode` → `handleReviewTask`
- Tool definition name: `"pio_review_code"` → `"pio_review_task"`
- CAPABILITY_CONFIG.prompt: `"review-code.md"` → `"review-task.md"`
- Capability name string in `enqueueTask`: `"review-code"` → `"review-task"`
- Capability name string in `resolveCapabilityConfig` call: `"review-code"` → `"review-task"`
- Error messages referencing `review-code` (e.g., "stepNumber is required for review-code")
- Command registration: `"pio-review-code"` → `"pio-review-task"`
- Default initial message referencing `review-code`

#### `src/state-machine.ts`
- Function name: `transitionReviewCode` → `transitionReviewTask`
- `resolveTransition` switch: case `"review-code"` → `"review-task"`, call `transitionReviewTask` instead of `transitionReviewCode`
- `transitionExecuteTask`: returns `{ capability: "review-code", ... }` → `{ capability: "review-task", ... }`
- JSDoc comments referencing `review-code` in TransitionContext and elsewhere

#### `src/guards/validation.ts`
- Capability check string: `capabilityForAutomation === "review-code"` → `"review-task"`

#### `src/index.ts`
- Import: `import { setupReviewCode } from "./capabilities/review-code"` → `import { setupReviewTask } from "./capabilities/review-task"`
- Call site: `setupReviewCode(pi)` → `setupReviewTask(pi)`

#### `src/skills/pio/SKILL.md`
- Workflow lifecycle: `review-code` → `review-task` (line 18 and surrounding)
- Cycle description: `review-code` → `review-task` (line 20)
- Command table: `/pio-review-code` → `/pio-review-task`, `pio_review_code` → `pio_review_task` (line 34)

### Test File Updates (6 files)

#### `src/capabilities/review-task.test.ts` (renamed from review-code.test.ts)
- Import path: `from "./review-code"` → `from "./review-task"` (two import lines)

#### `src/state-machine.test.ts`
- All `"review-code"` capability strings in test params and assertions → `"review-task"`
- Describe block labels referencing `review-code` → `review-task`

#### `src/guards/validation.test.ts`
- Describe block label: `describe("review-code markComplete automation", ...)` → `describe("review-task markComplete automation", ...)`

#### `src/capability-config.test.ts`
- Capability string `"review-code"` in test params → `"review-task"` (all occurrences)
- `prepareSession` test section: references to `review-code` capability name

#### `src/model-config.test.ts`
- `resolveModelForCapability("review-code")` → `resolveModelForCapability("review-task")`
- Describe block label referencing `review-code`

#### `src/goal-state.test.ts`
- Test fixture data: `{ capability: "review-code", ... }` → `{ capability: "review-task", ... }` (line 599)

## Code Components

This task has no new code components. It is a rename-only operation affecting existing identifiers across ~12 files (3 renames + 9 modifications).

## Approach and Decisions

1. **File renames first:** Rename the three files on disk before updating imports. Use actual filesystem rename operations, not delete+create.
2. **Update imports in dependent files next:** `src/index.ts` must import from the new path. Test files that import from `./review-code` must update to `./review-task`.
3. **String replacements within each file:** After renames and import updates, do find-and-replace for remaining string literals (`"review-code"` → `"review-task"`, function names, tool names, command names).
4. **Be careful with substring matches:** The string `"review-code"` should not be confused with `"code-review"` or similar patterns. We're changing `review-code` only.
5. **Verify with grep:** After all changes, `grep -r "review-code" src/` should return zero results.
6. **Verify type checking:** `npx tsc --noEmit` must pass — this confirms all imports resolve correctly after renames.
7. **Verify tests pass:** `npx vitest run` must pass with no regressions.

## Dependencies

None. This is Step 1 with no prerequisites.

## Files Affected

- `src/capabilities/review-code.ts` → `src/capabilities/review-task.ts` — rename file, update all capability name strings, tool/command names, function names
- `src/prompts/review-code.md` → `src/prompts/review-task.md` — rename file only (content unchanged)
- `src/capabilities/review-code.test.ts` → `src/capabilities/review-task.test.ts` — rename file, update import paths
- `src/state-machine.ts` — renamed transition function, updated switch case, updated transition targets, updated doc comments
- `src/guards/validation.ts` — changed capability name string in automation check
- `src/index.ts` — updated import path and function call
- `src/skills/pio/SKILL.md` — updated workflow lifecycle, command table, cycle description
- `src/state-machine.test.ts` — updated capability strings, describe blocks, assertions
- `src/guards/validation.test.ts` — updated describe block label
- `src/capability-config.test.ts` — updated capability name strings in test params and assertions
- `src/model-config.test.ts` — updated capability name string in test assertion
- `src/goal-state.test.ts` — updated capability name string in test fixture data

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no type errors (all imports resolve correctly after file renames)
- [ ] All existing tests pass with no regressions: `npx vitest run` exits successfully
- [ ] No remaining references to `review-code` in `src/` (verifiable via `grep -r "review-code" src/`)

## Risks and Edge Cases

- **Import path mismatches:** After file rename, all import statements must be updated. TypeScript will catch these at compile time (`npx tsc --noEmit`).
- **Dynamic imports:** `capability-config.ts` resolves capabilities via dynamic import of `./capabilities/<name>`. After rename, the old `review-code` module won't exist — ensure the capability name string is `"review-task"` everywhere so the dynamic import resolves to the new file.
- **Test file imports:** The review test file imports from `./review-code` (two lines). Both must be updated to `./review-task`.
- **Substring precision:** When doing find-and-replace, ensure `"review-code"` is matched exactly — not `"code-review"` or similar patterns that might appear in other contexts.
- **Prompt file content:** Only rename the prompt file (`src/prompts/review-code.md` → `src/prompts/review-task.md`). Do NOT modify its content; content changes belong to Step 2.
