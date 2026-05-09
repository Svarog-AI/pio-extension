# Simplify capability handler patterns — reduce command/tool duplication

Evaluate whether the `handle*` functions and tool handlers across all capabilities follow a common pattern that can be reduced to a shared implementation.

## Current state

Each capability file (`create-goal.ts`, `create-plan.ts`, `evolve-plan.ts`, `execute-plan.ts`, `project-context.ts`) has its own command handler (`handleXxx`) and most have tool handlers too. These follow a roughly similar shape but with differences:

### Pattern comparison

| Capability | Command handler flow | Has tool? | Unique logic |
|---|---|---|---|
| `create-goal` | parse args → `prepareGoal()` (mkdir + exists check) → `resolveCapabilityConfig` → `launchCapability` | Yes — calls `enqueueTask` | mkdir before launch |
| `create-plan` | parse args → `validateGoal()` (goal exists, GOAL.md exists, PLAN.md absent) → `resolveCapabilityConfig` → `launchCapability` | Yes — calls `enqueueTask` | pre-conditions on files |
| `evolve-plan` | parse args → `validateAndFindNextStep()` → mkdir step dir → `resolveCapabilityConfig` → override `config.validation` → `launchCapability` | Yes — calls `enqueueTask` | dynamic validation per-step, step number computation |
| `execute-plan` | parse args → `validateGoal()` (goal exists, both GOAL.md + PLAN.md exist) → `resolveCapabilityConfig` → `launchCapability` | No | command-only |
| `project-context` | no parsing → direct `resolveCapabilityConfig` → `launchCapability` | Yes — calls `enqueueTask` with zero params | no validation at all |

### Common boilerplate across all handlers:

1. **Arg parsing + usage check** — nearly identical (`!args || !args.trim()`, split, trim)
2. **Error notification pattern** — `ctx.ui.notify("...", "error")` + early return
3. **Config resolution** — `await resolveCapabilityConfig(cwd, { capability: "X", ... })` → error check
4. **Launch sequence** — `await launchCapability(ctx, config)` after all prep is done (ctx staleness constraint)

### Tool handler boilerplate:

1. `defineTool({ name, label, description, parameters: Type.Object(...) })`
2. Validation/prep call → error return with content array
3. `enqueueTask(cwd, { capability, params })` — just queues, no launch
4. Return success message in `{ content: [{ type: "text", text: "..." }] }` shape

## Questions to answer

1. **What is the minimal shared pattern?** Can command handlers be reduced to: parse args → validate → resolveCapabilityConfig → launchCapability, where validation is declared in `CAPABILITY_CONFIG` or a separate hook?
2. **Can tool handlers be generated from the same config?** Currently tools duplicate capability logic (validation, enqueue params). Could a single registration produce both tool and command from `CAPABILITY_CONFIG` + parameter schema?
3. **Should validate/prep be declarative?** e.g., `CAPABILITY_CONFIG.preconditions: [{ file: "GOAL.md", mustExist: true }, { file: "PLAN.md", mustExist: false }]` instead of custom functions.
4. **What's genuinely unique per capability?** evolve-plan is the outlier (dynamic validation, step scanning). project-context has no params or validation. Are these exceptions worth handling declaratively, or should they stay custom?

## Goal

Reduce boilerplate across capabilities while preserving the ctx-staleness constraint and allowing per-capability customization where needed.


## Category

improvement

## Context

Relevant files: src/capabilities/create-goal.ts, create-plan.ts, evolve-plan.ts, execute-plan.ts, project-context.ts — each has handleXxx and (usually) a tool handler with similar structure. Also src/utils.ts resolveCapabilityConfig, CAPABILITY_CONFIG convention.
