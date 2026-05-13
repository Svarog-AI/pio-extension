# Add write-tests capability between evolve-plan and execute-task

## Problem

Currently, `evolve-plan` is responsible for generating both `TASK.md` (the implementation specification) and `TEST.md` (the test plan). This dual responsibility means test specification gets secondary attention — the session focuses primarily on the task spec, and TEST.md is produced as an afterthought. Tests tend to be thin, lack depth, and often don't adequately cover edge cases or error conditions.

Additionally, `review-code` does not systematically evaluate whether tests actually verify the intended behavior. The review prompt mentions "Test Coverage vs Requirements" but has no explicit instruction to flag misaligned or insufficient tests as high-level issues.

## Proposed changes

### 1. New `write-tests` capability

Introduce a dedicated session between `evolve-plan` and `execute-task`:

- **Input:** Reads `TASK.md` from the same step folder (produced by `evolve-plan`)
- **Output:** Produces `TEST.md` in the same `S{NN}/` folder
- **Focus:** Creating thorough test coverage — unit tests, integration tests, edge cases, error paths, boundary conditions
- The session should encourage deep thought about what can go wrong, not just happy-path verification

This frees `evolve-plan` to focus entirely on the task specification (`TASK.md`) and gives test design the dedicated attention it deserves.

### 2. Updated workflow cycle

Current: `evolve-plan` → `execute-task` → `review-code`
New: `evolve-plan` → `write-tests` → `execute-task` → `review-code`

The transition system (auto-enqueue logic) needs to reflect this: after `evolve-plan` completes, the next task should be `write-tests`, not `execute-task`.

### 3. Enhanced review-code test evaluation

Update `src/prompts/review-code.md` so the review agent always raises a **HIGH** issue when tests fail to verify what they claim to verify. Specific additions:

- Compare each test case in TEST.md against the actual test code produced by `execute-task` — do they match?
- Flag as HIGH if tests are present but don't exercise the acceptance criteria (e.g., tests pass trivially, mock everything, or assert nothing meaningful)
- Flag as HIGH if critical error paths, edge cases listed in TEST.md have no corresponding test

## Files to create/modify

**New files:**
- `src/capabilities/write-tests.ts` — capability implementation (tool + command, follows existing pattern)
- `src/prompts/write-tests.md` — system prompt for the Test Writer agent

**Modified files:**
- `src/prompts/evolve-plan.md` — remove TEST.md generation instructions, focus solely on TASK.md
- `src/capabilities/evolve-plan.ts` — remove TEST.md from expected outputs, update validation
- `src/prompts/review-code.md` — strengthen test quality evaluation (see above)
- `src/index.ts` — register the new capability
- `src/utils.ts` — likely needs the new capability config entry

## Category

improvement

## Context

evolve-plan.ts generates TASK.md + TEST.md. evolve-plan.md describes TEST.md generation in detail. review-code.md has "Test Coverage vs Requirements" but no explicit HIGH-issue requirement for misaligned tests. review-code.ts is a fully-working capability following the standard pattern (session-capability, validation, etc.).
