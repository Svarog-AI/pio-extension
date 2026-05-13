# Code Review: Wire turn-guard into the extension entry point (Step 2)

## Decision
APPROVED

## Summary
Minimal wiring change — two lines added to `src/index.ts` (one import, one function call). The implementation follows existing patterns exactly, TypeScript compilation is clean, and no circular dependencies are introduced. All acceptance criteria are met.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- (none)

## Test Coverage Analysis
No new unit tests required — this is a structural wiring change. All behavioral logic lives in `turn-guard.ts`, covered by Step 1's test suite (`__tests__/turn-guard.test.ts` with 13 tests). Programmatic verification confirms:
- `npm run check` (tsc --noEmit): exit code 0, zero type errors
- `grep -n 'setupTurnGuard' src/index.ts`: exactly 2 matches (import line 26, call line 48)
- No circular imports: `turn-guard.ts` imports only from `@earendil-works/pi-coding-agent`

## Gaps Identified
No gaps. GOAL ↔ PLAN ↔ TASK ↔ Implementation are fully aligned. The wiring correctly registers the turn-guard handlers so all Pio sub-sessions benefit from dead-turn detection automatically, as specified in GOAL.md's "To-Be State."

## Recommendations
N/A
