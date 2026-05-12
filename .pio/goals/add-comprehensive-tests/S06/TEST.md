# Tests: Test workflow transitions (`transition.test.ts`)

## Unit Tests

**File:** `__tests__/transition.test.ts`
**Test runner:** Vitest (native ESM, Node.js environment)

### describe("CAPABILITY_TRANSITIONS structure")

Verify the static shape of the transitions map before testing behavior.

- **Test:** "maps create-goal to create-plan" — assert `CAPABILITY_TRANSITIONS["create-goal"]` is `"create-plan"`
- **Test:** "maps create-plan to evolve-plan" — assert `CAPABILITY_TRANSITIONS["create-plan"]` is `"evolve-plan"`
- **Test:** "maps evolve-plan to a resolver function" — assert typeof is `"function"`
- **Test:** "maps execute-task to a resolver function" — assert typeof is `"function"`
- **Test:** "maps review-code to a resolver function" — assert typeof is `"function"`

### describe("resolveNextCapability — create-goal → create-plan")

Deterministic string transition. Params are preserved as-is.

- **Test:** "returns create-plan with params preserved" — given `capability: "create-goal"`, `ctx.params: { goalName: "my-feature" }`, result should be `{ capability: "create-plan", params: { goalName: "my-feature" } }`
- **Test:** "returns create-plan when params is undefined" — given no `ctx.params`, result should be `{ capability: "create-plan", params: undefined }`

### describe("resolveNextCapability — create-plan → evolve-plan")

Deterministic string transition.

- **Test:** "returns evolve-plan with params preserved" — given `capability: "create-plan"`, `ctx.params: { goalName: "my-feature" }`, result should be `{ capability: "evolve-plan", params: { goalName: "my-feature" } }`

### describe("resolveNextCapability — evolve-plan → execute-task")

Callback transition. Behavior depends on whether stepNumber is present.

- **Test:** "returns execute-task with goalName and stepNumber when stepNumber is present" — given `ctx.params: { goalName: "feat", stepNumber: 3 }`, result should be `{ capability: "execute-task", params: { goalName: "feat", stepNumber: 3 } }`
- **Test:** "returns execute-task with original params when stepNumber is missing" — given `ctx.params: { goalName: "feat" }`, result should be `{ capability: "execute-task", params: { goalName: "feat" } }`
- **Test:** "returns execute-task with undefined params when ctx has no params" — given `ctx.params: undefined`, result should have `capability: "execute-task"`

### describe("resolveNextCapability — execute-task → review-code")

Callback transition. Same pattern as evolve-plan.

- **Test:** "returns review-code with goalName and stepNumber when stepNumber is present" — given `ctx.params: { goalName: "feat", stepNumber: 5 }`, result should be `{ capability: "review-code", params: { goalName: "feat", stepNumber: 5 } }`
- **Test:** "returns review-code with original params when stepNumber is missing" — given `ctx.params: { goalName: "feat" }`, result should be `{ capability: "review-code", params: { goalName: "feat" } }`

### describe("resolveNextCapability — review-code (approval path)")

Conditional callback transition. Requires APPROVED file on disk at `{workingDir}/{stepFolder}/APPROVED`. Uses real temp directories to simulate filesystem state.

- **Test:** "returns evolve-plan with incremented stepNumber when APPROVED exists" — create temp dir tree with `S03/APPROVED`, given `ctx: { workingDir: <temp>, params: { goalName: "feat", stepNumber: 3 } }`, result should be `{ capability: "evolve-plan", params: { goalName: "feat", stepNumber: 4 } }`
- **Test:** "preserves goalName while incrementing stepNumber" — same setup as above, verify `params.goalName` is `"feat"` and `params.stepNumber` is `4`

### describe("resolveNextCapability — review-code (rejection path)")

Conditional callback transition. APPROVED file does NOT exist on disk.

- **Test:** "returns execute-task with same stepNumber when APPROVED missing" — create temp dir tree without APPROVED, given `ctx: { workingDir: <temp>, params: { goalName: "feat", stepNumber: 3 } }`, result should be `{ capability: "execute-task", params: { goalName: "feat", stepNumber: 3 } }`
- **Test:** "returns execute-task string when no stepNumber present" — given `ctx: { workingDir: <temp>, params: { goalName: "feat" } }`, result should be `{ capability: "execute-task", params: { goalName: "feat" } }`

### describe("resolveNextCapability — unknown capabilities")

Edge case: capability not defined in CAPABILITY_TRANSITIONS.

- **Test:** "returns undefined for unknown capability name" — given `capability: "nonexistent"`, result should be `undefined`
- **Test:** "returns undefined for empty string capability" — given `capability: ""`, result should be `undefined`

### describe("TransitionResult shape consistency")

Verify that all code paths return a consistent `TransitionResult` shape.

- **Test:** "string transitions wrap in TransitionResult with params" — create-goal transition should return `{ capability, params }` object
- **Test:** "callback transitions returning TransitionResult pass through unchanged" — evolve-plan with stepNumber returns the exact TransitionResult from the callback (capability + params)
- **Test:** "increment does not mutate original ctx.params" — verify `ctx.params.stepNumber` is unchanged after review-code approval call (immutability check)

## Programmatic Verification

- **What:** All tests pass with Vitest
  - **How:** `npm test __tests__/transition.test.ts`
  - **Expected result:** Exit code 0, all tests green, no failures
- **What:** Full test suite passes (no regressions)
  - **How:** `npm test`
  - **Expected result:** All existing tests + new transition tests pass
- **What:** TypeScript type checking reports no errors
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no type errors

## Test Order

1. CAPABILITY_TRANSITIONS structure (5 tests) — pure assertions, no setup needed
2. create-goal → create-plan (2 tests) — deterministic, no filesystem
3. create-plan → evolve-plan (1 test) — deterministic
4. evolve-plan → execute-task (3 tests) — callback, no filesystem
5. execute-task → review-code (2 tests) — callback, no filesystem
6. review-code approval path (2 tests) — requires temp directories with APPROVED file
7. review-code rejection path (2 tests) — requires temp directories without APPROVED
8. unknown capabilities (2 tests) — pure assertions
9. TransitionResult shape consistency (3 tests) — mixed, verifies return shapes
