# Task: Wire revise-plan and register planning skill in index.ts

Import the `setupRevisePlan` function, call it in the extension factory, and register the `pio-planning` skill so it appears in `<available_skills>` for all sub-sessions.

## Context

The `revise-plan` capability is fully implemented in `src/capabilities/revise-plan.ts` (Step 3), with state machine transitions (Step 4), prompt (Step 5), and shared planning skill (Step 1). The final wiring step connects everything in `src/index.ts` — the extension entry point that registers all capabilities and skills with the pi framework. Without this, the tool (`pio_revise_plan`) and command (`/pio-revise-plan`) are never registered, and the planning skill is not discoverable by sub-sessions.

## What to Build

Two changes to `src/index.ts`:

1. **Import and call `setupRevisePlan()`** — Import the function from `./capabilities/revise-plan` and invoke it with the `pi` instance, following the existing pattern of all other capability setup calls.
2. **Register the planning skill** — Add `path.join(SKILLS_DIR, "pio-planning")` to the `skillPaths` array so pi's `resources_discover` event returns it alongside the three existing skills.

### Code Components

- **Import addition:** `import { setupRevisePlan } from "./capabilities/revise-plan";` placed alphabetically among existing capability imports (after `review-task`, before `execute-plan`).
- **Setup call:** `setupRevisePlan(pi);` placed alongside other `setup*` calls in the main function body. Placement should follow the existing convention — capabilities are called roughly in workflow order.
- **Skill path:** `path.join(SKILLS_DIR, "pio-planning")` added to `skillPaths`. Use `pio-planning` (not `planning`) per the plan deviation from Step 1.

### Approach and Decisions

- Follow existing import/call patterns exactly — no stylistic deviations from how other capabilities are wired.
- **Critical:** Use `pio-planning` as the skill directory name, matching the actual filesystem path (`src/skills/pio-planning/SKILL.md`). The original PLAN.md specified `planning`, but Step 1 created it as `pio-planning` to avoid naming conflicts. This deviation is documented in `S06/DECISIONS.md`.
- Import order: maintain alphabetical ordering among capability imports if the existing code follows this pattern (it does — `create-goal`, `create-issue`, `create-plan`, `delete-goal`, `evolve-plan`, etc.).
- Setup call order: place `setupRevisePlan(pi)` near `setupEvolvePlan(pi)` since revise-plan is conceptually related to evolve-plan in the workflow.

## Dependencies

- **Step 1:** Shared planning skill must exist at `src/skills/pio-planning/SKILL.md`
- **Step 3:** `src/capabilities/revise-plan.ts` must exist and export `setupRevisePlan`
- Steps 4–6: Not direct dependencies for this wiring, but represent the complete feature set that depends on being wired

## Files Affected

- `src/index.ts` — modified: add `setupRevisePlan` import + call, register `pio-planning` skill path

## Acceptance Criteria

- [ ] `setupRevisePlan` is imported from `./capabilities/revise-plan` and called in the main function
- [ ] Planning skill path is registered in `skillPaths` array
- [ ] Import matches module filename convention (`revise-plan`) so `resolveCapabilityConfig` can dynamically import it
- [ ] The skill path uses `pio-planning` (not `planning`) matching the actual directory name
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Skill name mismatch:** Using `planning` instead of `pio-planning` will cause the skill to fail discovery at runtime. Verify the actual directory name matches.
- **Dynamic import in `resolveCapabilityConfig`:** The capability config resolver uses the module filename to dynamically import (e.g., `import(`./capabilities/revise-plan`)`). Ensure the import path matches exactly.
- **Import ordering:** If imports are not alphabetically ordered, the executor should maintain consistency with existing patterns.
