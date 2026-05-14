# Summary: Update configuration and verify full test suite

## Status
COMPLETED

## Files Modified
- `vitest.config.ts` — removed `__tests__/` patterns from `include`, now only `"src/**/*.test.ts"`
- `tsconfig.json` — removed `"__tests__/**/*.ts"` from `include`, now only `"src/**/*.ts"`

## Files Deleted
- `__tests__/capability-config.test.ts`
- `__tests__/evolve-plan.test.ts`
- `__tests__/execute-task-initial-message.test.ts`
- `__tests__/fs-utils.test.ts`
- `__tests__/review-code-config.test.ts`
- `__tests__/session-capability.test.ts`
- `__tests__/smoke.test.ts`
- `__tests__/step-discovery.test.ts`
- `__tests__/types.test.ts`

## Decisions Made
- Followed TEST.md's recommended order: delete files first (prevents double-discovery), then update config, then verify.
- Left `__tests__/` directory itself intact (empty) — removal is Step 4's responsibility.

## Test Coverage
- `npm run check` — TypeScript type check passes with zero errors
- All 10 collocated test files pass individually (34 + 34 + 63 + 87 = 218 tests total)
- `npm run test` — full suite: 10 files, 218 tests, all passing
- No "test already exists" warnings (no duplicate discovery)
- No `__tests__/` references remain in source code or configuration
