# Glossary

## Terms

- **Capability** — A self-contained workflow unit (e.g., `create-goal`, `execute-task`) that exposes both a tool (agent-callable) and optionally a command (user-callable via `/pio-*`). Each has a `CAPABILITY_CONFIG` defining its session shape.
- **Goal workspace** — A directory under `.pio/goals/<name>/` containing all artifacts for a single feature/fix: `GOAL.md`, `PLAN.md`, step folders (`S01/`, `S02/`), and state markers.
- **Step folder** — A zero-padded directory inside a goal workspace (`S01/`, `S02/`) containing the specification (`TASK.md`, `TEST.md`), implementation artifacts (`SUMMARY.md`), and review output (`REVIEW.md`).
- **Sub-session** — An isolated pi agent session spawned by `launchCapability()`. Contains a custom `pio-config` entry with prompt, working directory, validation rules, and file protections. Runs one capability per session.
- **Transition** — The resolution of "what runs next" after a capability completes. Pure function in `state-machine.ts` that maps `(capability, GoalState, params) → next capability + adjusted params`.
- **GoalState** — A lazy-evaluated filesystem view over a goal workspace (`goal-state.ts`). All methods read fresh from disk — no caching. Provides `hasGoal()`, `steps()`, `currentStepNumber()`, etc.
- **Validation gate** — The `pio_mark_complete` tool that verifies expected output files exist before allowing session completion. For `review-code`, it also parses YAML frontmatter and creates APPROVED/REJECTED markers automatically.
- **File protection** — Two mechanisms enforced via the `tool_call` event handler:
  - *Read-only files:* Certain files (e.g., TASK.md, TEST.md during execution) cannot be modified
  - *Write allowlist:* Only explicitly allowed paths may be written to; blocks all writes to `.pio/` outside the session's goal workspace
- **Session queue** — Per-goal task slots at `.pio/session-queue/task-{goalName}.json`. One pending task per goal. Files are consumed (deleted) when launched by `/pio-next-task`.
- **Model config** — Optional `~/.pi/pio-config.yaml` that overrides which LLM model a capability uses. Resolution: per-capability → default → inherit parent.

## Acronyms

| Acronym | Expansion |
|---------|-----------|
| pio | Pi Goal-Driven Workflow (the extension name; not an acronym itself, short for the project) |
| TDD | Test-Driven Development |
| LLM | Large Language Model |
| ADR | Architecture Decision Record (referenced in docs but none currently exist in the repo) |
| CI/CD | Continuous Integration / Continuous Deployment |
| PR | Pull Request |
| YAML | YAML Ain't Markup Language (used for REVIEW.md frontmatter and pio-config.yaml) |
| DCO | Developer Certificate of Origin (not used in this project) |
| GPG | GNU Privacy Guard (commit signing — not observed in this repo) |

## Business Concepts

- **Goal-driven workflow** — The core concept: complex work is structured as goals, each decomposed into a plan of ordered steps. Each step is specified (TASK.md + TEST.md), implemented (test-first), and reviewed (approve/reject) in isolated sub-sessions.
- **Specification-driven implementation** — `evolve-plan` produces TASK.md (what to build) and TEST.md (how to verify) before any code is written. This separates planning from execution and enables focused sub-sessions.
- **Review gate** — After implementation, `review-code` evaluates quality, test coverage, and alignment with requirements. Approval advances the workflow; rejection sends the step back for re-execution with feedback from REVIEW.md.
- **DECISIONS.md carryover** — Starting at Step 2, `evolve-plan` writes DECISIONS.md to document architectural decisions made during specification. Subsequent steps read this to maintain consistency across the implementation.
- **Transition audit trail** — Each capability completion records a transition entry in `<goalDir>/transitions.json`: an append-only JSON array tracking from→to transitions with timestamps and params. Provides observability into the workflow's progress.
