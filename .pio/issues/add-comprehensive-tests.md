# Add a comprehensive test suite to pio-extension

# Add a comprehensive test suite to pio-extension

The project currently has **zero tests**. Verification relies entirely on `npm run check` (TypeScript type checking) and manual code review. This makes refactoring risky, especially as the codebase grows with new capabilities and features.

## Current state

- **No test runner** — `package.json` scripts for `test`, `jest`, `vitest`, etc. do not exist
- **No test files** — no `__tests__/`, `*.test.ts`, or similar anywhere in the repo
- **No CI pipeline** — no GitHub Actions, GitLab CI, or other automation
- **Only verification:** `npm run check` (`tsc --noEmit`)

## What to test

### Tier 1: Pure utilities (easiest, highest ROI)

Functions in `src/utils.ts` that operate on strings/paths without framework dependencies:

| Function | Test cases |
|---|---|
| `resolveGoalDir(cwd, name)` | Normal names, special chars, nested-looking names, empty input |
| `goalExists(goalDir)` | Existing dir, missing dir, file (not dir) |
| `queueDir(cwd)` | Creates directory if missing, returns correct path |
| `findIssuePath(cwd, identifier)` | Slug, filename with .md, absolute path, nonexistent, relative path |
| `readIssue(cwd, identifier)` | Existing issue, missing issue, empty file |
| `enqueueTask(cwd, task)` | Writes valid JSON, creates directory, overwrites existing |

### Tier 2: Validation logic (high value)

Functions in `src/capabilities/validation.ts` that can be tested in isolation:

| Function | Test cases |
|---|---|
| `validateOutputs(rules, baseDir)` | All present, all missing, partial missing, empty rules |
| `extractGoalName(workingDir)` | Standard path, deeply nested, no `/goals/` segment, root-level |

### Tier 3: Step discovery (critical paths)

Logic scattered across capabilities that determines "what step comes next":

| Location | Functionality | Test cases |
|---|---|---|
| `evolve-plan.ts` | `isStepSpecComplete`, `validateAndFindNextStep` | Empty goal, all complete, gaps in middle, missing PLAN.md |
| `execute-task.ts` | `isStepReady`, `validateExplicitStep`, `validateAndFindNextStep` | COMPLETED/BLOCKED markers present, mixed states, no ready steps |
| Both | `stepFolderName(stepNumber)` | S01-S09 padding, two-digit numbers, edge cases |

### Tier 4: Capability config resolution

| Function | Test cases |
|---|---|
| `resolveCapabilityConfig` in `utils.ts` | Valid capability name, nonexistent module, missing CAPABILITY_CONFIG |
| Each `CAPABILITY_CONFIG.defaultInitialMessage` | Returns non-empty string, includes workingDir/path info |

### Tier 5: Integration tests (harder)

These test the pi framework integration and are more fragile but catch real bugs:

| Area | What to verify |
|---|---|
| Tool registration | All tools register correctly via `setup*` functions |
| Command registration | All commands register with correct names and handlers |
| Session capability | `launchCapability` creates new session with correct config in custom entry |
| Event handlers | `resources_discover` loads prompt, `before_agent_start` injects instructions |
| File protection | `tool_call` handler blocks unauthorized writes to `.pio/` |

## Recommended tech choices

**Test runner:** **Vitest** — native ESM support (critical for `"type": "module"`), no transpilation needed (`"noEmit": true` stays), fast, works with TypeScript directly. Matches the project's ESM-only constraint perfectly.

Alternatives:
- Jest would require `--experimental-vm-modules` or ts-jest config — adds complexity
- Tap, Ava — less ecosystem for TS extensions

**Assertions:** Vitest built-in (chai-style) — no extra dependency needed.

**Mocking:** Vitest's `vi.mock()` / `vi.fn()` — native ESM mocking via module registration hooks.

## Suggested directory structure

```
src/
├── ...existing files...
__tests__/
├── utils.test.ts              # Tier 1: pure utilities
├── validation.test.ts         # Tier 2: validation logic + step helpers
├── step-discovery.test.ts     # Tier 3: evolve-plan and execute-task step finding
├── capability-config.test.ts  # Tier 4: config resolution
└── fixtures/                  # Test data (fake GOAL.md, PLAN.md, file trees)
    ├── goals/
    │   └── test-goal/
    │       ├── GOAL.md
    │       └── PLAN.md
    └── issues/
        └── sample-issue.md
```

## Setup tasks

1. `npm install --save-dev vitest` and configure in `package.json` (or `vitest.config.ts`)
2. Add `"test": "vitest run"` script to `package.json`
3. Ensure `tsconfig.json` works with Vitest's TS resolution (may need a separate `tsconfig.test.json` if conflicts arise)
4. Create first test file (`__tests__/utils.test.ts`) as a smoke test
5. Add a minimal GitHub Actions workflow for type-check + test on push/PR

## Phased approach

1. **Phase 1 (foundational):** Set up Vitest, add tests for `utils.ts` and validation helpers — pure functions with no framework deps
2. **Phase 2 (business logic):** Test step discovery, config resolution, file operations  
3. **Phase 3 (integration):** Mock pi framework API, test capability registration and event handlers
4. **Phase 4 (CI):** GitHub Actions workflow for automated testing

## Open questions

- Should integration tests mock the full pi `ExtensionAPI`, or use a lightweight fake? (Probably start with fakes — full mocking is complex)
- Do we need snapshot tests for PLAN.md/GOAL.md structure validation, or are unit tests sufficient?
- What coverage threshold makes sense? (Aim for 80%+ on business logic, not necessarily on prompt injection boilerplate)

## Category

infrastructure

## Context

Relevant files:
- `src/utils.ts` — pure functions, prime test targets
- `src/capabilities/validation.ts` — `validateOutputs`, `extractGoalName`, step helpers
- `src/capabilities/evolve-plan.ts` — `isStepSpecComplete`, `validateAndFindNextStep`, `stepFolderName`
- `src/capabilities/execute-task.ts` — `isStepReady`, `validateExplicitStep`, `stepFolderName`
- `package.json` — currently no test runner or scripts
- `tsconfig.json` — ESM, no emit, strict — Vitest should work natively


## Category

infrastructure
