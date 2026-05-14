# Collocate test files beside their source modules

Move all 14 test files from the centralized `__tests__/` directory to live beside the source modules they test. Merge tests that target the same module into single collocated `*.test.ts` files. Update vitest configuration and all import paths accordingly.

## Current State

All 14 test files live in a single `__tests__/` directory at the project root:

```
__tests__/
├── capability-config.test.ts          → tests src/capability-config.ts
├── evolve-plan.test.ts                → tests src/capabilities/evolve-plan.ts (also imports from guards/validation, capability-config)
├── execute-task-initial-message.test.ts → tests src/capabilities/execute-task.ts
├── fs-utils.test.ts                   → tests src/fs-utils.ts
├── next-task.test.ts                  → tests src/capabilities/session-capability.ts (getSessionGoalName)
├── queues.test.ts                     → tests src/queues.ts
├── review-code-config.test.ts         → tests src/capabilities/review-code.ts
├── session-capability.test.ts         → tests src/capability-config.ts (resolveCapabilityConfig)
├── smoke.test.ts                      → project-level smoke test (imports src/fs-utils.ts)
├── step-discovery.test.ts             → tests execute-task + review-code step helpers, plus fs-utils
├── transition.test.ts                 → tests src/transitions.ts (CAPABILITY_TRANSITIONS, resolveNextCapability)
├── turn-guard.test.ts                 → tests src/guards/turn-guard.ts
├── types.test.ts                      → tests src/types.ts + src/capability-config.ts (resolveCapabilityConfig)
└── validation.test.ts                 → tests src/guards/validation.ts
```

Vitest is configured in `vitest.config.ts` with `include: ["__tests__/**/*.test.ts", "__tests__/*.test.ts"]`, which discovers only the centralized directory.

All test files import source modules via relative paths from `__tests__/`, e.g., `import { ... } from "../src/capabilities/evolve-plan"`.

Source module layout:
- Root-level: `src/capability-config.ts`, `src/fs-utils.ts`, `src/index.ts`, `src/queues.ts`, `src/transitions.ts`, `src/types.ts`
- Capabilities: `src/capabilities/*.ts` (15 files)
- Guards: `src/guards/turn-guard.ts`, `src/guards/validation.ts`

Multiple test files target the same source module (e.g., `capability-config.test.ts`, `types.test.ts`, and `session-capability.test.ts` all test `src/capability-config.ts`). Some tests import from multiple modules, creating cross-cutting concerns (e.g., `step-discovery.test.ts` imports from `execute-task`, `review-code`, and `fs-utils`).

## To-Be State

Test files are collocated beside their primary source module. Tests targeting the same module are merged into a single `*.test.ts` file. The resulting layout:

| Collocated test file | Merged from (current `__tests__/` files) |
|---|---|
| `src/capability-config.test.ts` | `capability-config.test.ts`, `types.test.ts`, `session-capability.test.ts` |
| `src/fs-utils.test.ts` | `fs-utils.test.ts`, `smoke.test.ts` |
| `src/queues.test.ts` | `queues.test.ts` |
| `src/transitions.test.ts` | `transition.test.ts` |
| `src/capabilities/evolve-plan.test.ts` | `evolve-plan.test.ts` |
| `src/capabilities/execute-task.test.ts` | `execute-task-initial-message.test.ts`, `step-discovery.test.ts` (execute-task portions) |
| `src/capabilities/review-code.test.ts` | `review-code-config.test.ts`, `step-discovery.test.ts` (review-code portions) |
| `src/capabilities/session-capability.test.ts` | `next-task.test.ts` |
| `src/guards/validation.test.ts` | `validation.test.ts`, `turn-guard.test.ts` |

Key changes:

1. **Merge cross-cutting tests:** `step-discovery.test.ts` tests step helpers from both `execute-task` and `review-code`. Split its `describe` blocks and merge each group into the corresponding collocated test file.

2. **Update vitest config:** Change `include` from `["__tests__/**/*.test.ts", "__tests__/*.test.ts"]` to `["src/**/*.test.ts"]` so vitest discovers all collocated tests automatically.

3. **Update import paths:** All `import { ... } from "../src/..."` patterns become relative to the new location (e.g., `src/capabilities/evolve-plan.test.ts` imports `../transitions` instead of `../../src/transitions`).

4. **Remove `__tests__/`:** Delete the entire directory after all tests are relocated and verified passing.

5. **Verify:** After migration, `npm run test` passes with all 14 original test files consolidated into ~9 collocated files. `npm run check` passes with no type errors.
