# Finalize Goal

Add a **finalize-goal** capability that runs after a goal is fully completed (when `<goalDir>/COMPLETED` exists). It reads the final `DECISIONS.md` from the highest-numbered step folder, evaluates each decision against update rules for each of the 7 `.pio/PROJECT/*.md` files, and writes documentation updates where applicable.

## Current State

**No finalize-goal capability exists.** When a goal completes, accumulated decisions in `DECISIONS.md` (written by evolve-plan across steps) remain isolated to the goal workspace. Project-level documentation under `.pio/PROJECT/` is not automatically updated with new knowledge from completed goals.

### DECISIONS.md files accumulate per-step during execution

Each step folder (`S01/`, `S02/`, etc.) contains a `DECISIONS.md` written by the evolve-plan agent (prompt Step 2) and accumulated across steps. An example from `.pio/goals/multi-file-project-context/S05/DECISIONS.md` shows categories like:
- **Architecture Decisions** — path resolution patterns, caching behavior
- **File Placement** — canonical paths established during implementation
- **Prompt Reference Mapping** — which agents reference which files
- **Test Infrastructure** — test conventions and patterns

The highest-numbered step folder contains the most complete (cumulative) version.

### PROJECT files exist with defined scopes (7 files in `.pio/PROJECT/`)

All 7 files currently exist under `.pio/PROJECT/`:
- **OVERVIEW.md** — Project description, tech stack, repository structure (`src/` tree with file descriptions)
- **ARCHITECTURE.md** — Patterns and design decisions, capability pattern, sub-session lifecycle, state management, key design decisions, service integrations, data flow diagrams
- **CONVENTIONS.md** — Coding style (tsconfig settings), linting/formatting, AI agent instructions, conventions encoded in prompts
- **DEPENDENCIES.md** — External APIs, third-party libraries table, internal module graph, data flow between services
- **DEVELOPMENT.md** — Build/test commands, test directory convention, CI/CD, local environment setup
- **GIT.md** — Commit message format, observed types, scope usage, branch naming, tagging practices
- **GLOSSARY.md** — Terms and definitions, acronyms, business concepts

### Capability pattern is well-established

Every capability follows a consistent 4-part module structure (`src/capabilities/<name>.ts`):
1. **`CAPABILITY_CONFIG: StaticCapabilityConfig`** — single source of truth (prompt, validation, file protections, initial message)
2. **Tool (`defineTool`)** — agent-callable with TypeBox parameters, enqueues task or launches session
3. **Command handler** — user-callable via `/pio-*` in the TUI, calls `launchCapability()`
4. **`setup*()` function** — registers tool and command with the pi API

Session-based capabilities like `create-goal`, `create-plan`, `project-context` all launch sub-sessions via `launchCapability()`. The `project-context` capability is the closest analog — it writes to `.pio/PROJECT/*.md` files using a `writeAllowlist`. It has no tool (command-only), but finalize-goal should have both since it may be invoked programmatically after goal completion.

### Goal completion signal

A goal is complete when `<goalDir>/COMPLETED` exists — written by the evolve-plan agent when all plan steps are specified and no next step can be found. `GoalState.goalCompleted()` checks for this file. The state machine's `transitionEvolvePlan` returns `undefined` (no transition) when `state.goalCompleted()` is true, causing the session to terminate gracefully.

### State machine does not include finalize-goal

The state machine (`state-machine.ts`) handles transitions between: create-goal → create-plan → evolve-plan → execute-task → review-task. There is no transition targeting a finalize capability.

## To-Be State

### New capability module: `src/capabilities/finalize-goal.ts`

Follows the established capability pattern with all 4 parts:
1. **`CAPABILITY_CONFIG`** — prompt: `"finalize-goal.md"`, writeAllowlist for all 7 `.pio/PROJECT/*.md` files, no validation (output is a summary, not fixed files), `defaultInitialMessage` provides goal name and path to the final DECISIONS.md
2. **Tool (`pio_finalize_goal`)** — parameters: `name` (goal name). Validates that `<goalDir>/COMPLETED` exists and finds the highest-numbered step folder's `DECISIONS.md`. Launches a finalize-goal sub-session via `launchCapability()`. Returns error if goal is not complete or has no DECISIONS.md.
3. **Command handler (`/pio-finalize-goal <name>`)** — user-callable in the TUI. Same validation as tool, launches session directly.
4. **`setupFinalizeGoal(pi)`** — registers both tool and command with the pi API

### New prompt: `src/prompts/finalize-goal.md`

System prompt for the Finalize Goal Agent. Instructions cover:
1. Read the final DECISIONS.md (path provided in initial message)
2. For each decision, evaluate against specific update rules per PROJECT file:
   - **OVERVIEW.md:** Update "Repository Structure" when new files/directories introduced; update "Tech Stack" if new dependency categories added
   - **ARCHITECTURE.md:** Update "Key Design Decisions" for system-wide patterns; update "Capability Pattern" if capability contract changes; update data flow sections for new flows
   - **CONVENTIONS.md:** Update coding style for new TypeScript config/naming conventions; update AI agent instructions for new prompt conventions
   - **DEPENDENCIES.md:** Update third-party libraries table for new libraries; update internal module graph for new modules
   - **DEVELOPMENT.md:** Update build/test section for new scripts/patterns; update test directory convention if rules change
   - **GIT.md:** Update commit conventions, branch naming, tagging practices if changed
   - **GLOSSARY.md:** Add new terms, acronyms, or business concepts introduced by decisions
3. Read each PROJECT file before modifying — preserve existing content, insert updates at appropriate sections
4. If a decision doesn't map to any PROJECT update rule, skip it (no forced updates)
5. Write a summary output: list of files updated with descriptions of what changed and which decisions triggered each change. If no updates needed, explicitly state that decisions were reviewed and no PROJECT updates warranted

### Registration in `src/index.ts`

Import `setupFinalizeGoal` from the new capability module and call it during extension setup alongside all other capabilities.

### Read-only constraints (enforced via file protections)

The finalize-goal session is read-only by default except for `.pio/PROJECT/*.md` files. The `writeAllowlist` in `CAPABILITY_CONFIG` restricts writes to exactly those 7 files. Source code (`src/`) must not be modified — this is a documentation-only capability. The `tool_call` event handler (guard) enforces this automatically via the existing file protection mechanism.

### Summary output

The finalize-goal session produces output describing what was updated. This can be communicated back to the user as the agent's final message (no dedicated output file needed — unlike other capabilities that produce structured artifacts). The agent should list:
- Which PROJECT files were modified
- What changes were made to each file
- Which DECISIONS.md entries triggered each change
- Explicit statement if no updates were warranted

### State machine transitions

Two transition changes in `state-machine.ts`:
1. **`evolve-plan → finalize-goal`** when the goal is complete: Instead of returning `undefined`, `transitionEvolvePlan` should return `{ capability: "finalize-goal", params: { goalName } }`. This auto-enqueues a finalize-goal sub-session immediately after the last step is specified and COMPLETED is written.
2. **`finalize-goal → undefined`**: The finalize-goal capability has no outgoing transition. It produces documentation updates and terminates. Add a `case "finalize-goal"` to `resolveTransition()` that returns `undefined`.

The tool (`pio_finalize_goal`) and command (`/pio-finalize-goal`) remain available for manual on-demand invocation when the user wants to finalize a goal without going through the automatic evolve-plan path.
