# Move test files from `__tests__/` to collocated `*.test.ts` beside source

All 10 test files currently live in `__tests__/` at the project root. Moving them beside their corresponding source files improves discoverability, reduces stale tests, and makes it obvious when coverage is missing for a given module.

## Current state

```
__tests__/
├── capability-config.test.ts   → tests src/utils.ts (resolveCapabilityConfig)
├── evolve-plan.test.ts         → tests src/capabilities/evolve-plan.ts
├── next-task.test.ts           → tests src/capabilities/next-task.ts
├── smoke.test.ts               → project-level smoke test
├── step-discovery.test.ts      → tests src/utils.ts (step helpers)
├── transition.test.ts          → tests src/utils.ts (CAPABILITY_TRANSITIONS)
├── turn-guard.test.ts          → tests src/capabilities/validation.ts
├── types.test.ts               → tests src/types.ts
├── utils.test.ts               → tests src/utils.ts (general helpers)
└── validation.test.ts          → tests src/capabilities/validation.ts
```

## Target locations

| Current (`__tests__/`) | Collocated |
|---|---|
| `types.test.ts` | `src/types.test.ts` |
| `utils.test.ts`, `step-discovery.test.ts`, `transition.test.ts`, `capability-config.test.ts` | Merge into `src/utils.test.ts` (all test `src/utils.ts`) or keep separate beside `src/utils.ts` |
| `evolve-plan.test.ts` | `src/capabilities/evolve-plan.test.ts` |
| `next-task.test.ts` | `src/capabilities/next-task.test.ts` |
| `turn-guard.test.ts`, `validation.test.ts` | Merge into `src/capabilities/validation.test.ts` or keep separate |
| `smoke.test.ts` | Keep at root level (`test/smoke.test.ts` or similar) |

## Considerations

- Check if the test runner config (vitest, if present) supports collocated tests out of the box.
- Four tests currently target `src/utils.ts` — decide whether to merge them into a single `src/utils.test.ts` or keep separate files grouped by concern.
- Two tests target `src/capabilities/validation.ts` — same merge-or-separate question.
- Ensure imports are updated (`../src/...` → relative paths).

## Category

improvement

## Context

File references: __tests__/*.test.ts (10 files), src/utils.ts, src/types.ts, src/capabilities/validation.ts, src/capabilities/evolve-plan.ts, src/capabilities/next-task.ts
