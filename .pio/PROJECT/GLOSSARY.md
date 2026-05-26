# Glossary

## Terms

- **Capability** — A self-contained workflow unit (e.g., `create-goal`, `execute-task`) that exposes both a tool (agent-callable) and optionally a command (user-callable via `/pio-*`). Each has a `CAPABILITY_CONFIG` defining its session shape.
- **Goal workspace** — A directory under `.pio/goals/<name>/` containing all artifacts for a single feature/fix: `GOAL.md`, `PLAN.md`, step folders (`S01/`, `S02/`), and state markers.
- **Step folder** — A zero-padded directory inside a goal workspace (`S01/`, `S02/`) containing the specification (`TASK.md`), implementation artifacts (`TEST.md`, `SUMMARY.md`), review output (`REVIEW.md`), and optionally a `subgoals/` subdirectory for nested subgoal workspaces.
- **prepareSession hook** — A `PrepareSessionCallback` defined on `CAPABILITY_CONFIG.prepareSession` that runs during the `resources_discover` phase, before `before_agent_start`. Used by capabilities to enrich runtime config at startup — e.g., `execute-task` and `review-task` read per-step skills from TASK.md frontmatter and merge them into config via `setMergedSkills()`.
- **Sub-session** — An isolated pi agent session spawned by `launchCapability()`. Contains a custom `pio-config` entry with prompt, working directory, validation rules, and file protections. Runs one capability per session.
- **Transition** — The resolution of "what runs next" after a capability completes. Pure function in `state-machine.ts` that maps `(capability, GoalState, params) → next capability + adjusted params`.
- **GoalState** — A lazy-evaluated filesystem view over a goal workspace (`goal-state.ts`). All methods read fresh from disk — no caching. Provides `hasGoal()`, `steps()`, `currentStepNumber()`, etc.
- **Validation gate** — The `pio_mark_complete` tool that verifies expected output files exist before allowing session completion. For `review-code`, it also parses YAML frontmatter and creates APPROVED/REJECTED markers automatically.
- **File protection** — Two mechanisms enforced via the `tool_call` event handler:
  - *Read-only files:* Certain files (e.g., TASK.md, TEST.md during execution) cannot be modified
  - *Write allowlist:* Only explicitly allowed paths may be written to; blocks all writes to `.pio/` outside the session's goal workspace
- **Session queue** — Per-goal task slots at `.pio/session-queue/task-{goalName}.json`. One pending task per goal. Files are consumed (deleted) when launched by `/pio-next-task`.
- **Agent refinement loop detection** — A session-guard feature that tracks turn count during pio sessions. When `turnCount` reaches the configured `turnThreshold` (default: 15), it sends a one-time nudge via `pi.sendUserMessage({ deliverAs: "steer" })` encouraging self-diagnosis. The counter resets after each nudge, enabling periodic reminders. Configurable via `guards.turnThreshold` in `~/.pi/pio-config.yaml`. Uses `"steer"` so the nudge interrupts the agent after the current turn's tool calls (mid-run) rather than waiting for the full run to complete.
- **Model config** — Optional `~/.pi/pio-config.yaml` that overrides which LLM model a capability uses. Resolution: per-capability → default → inherit parent.

- **Finalize Goal Agent** — The agent that runs after a goal is fully completed. Reads accumulated decisions from DECISIONS.md, per-step SUMMARY.md files, and PLAN.md, then evaluates each finding against update rules to determine which `.pio/PROJECT/*.md` files need updates.
- **CapabilitySkills** — The config shape for declaring skills per-capability: `{ mandatory?: string[], recommended?: { name: string; condition: string }[] }`. Both fields optional. Defined in `src/types.ts`. Mirrored structurally by `TASK_FRONTMATTER_SCHEMA` in `src/frontmatter-schemas.ts`.
- **Per-Step Skills (TASK.md Frontmatter)** — Skills declared in TASK.md YAML frontmatter, read by `StepStatus.taskSkills()` during `prepareSession`. Merged with base capability skills via `mergeCapabilitySkills()` (Set-based dedup for mandatory, Map-based first-seen-wins for recommended). Provides runtime skill resolution beyond static capability configs.
- **Skill Injection** — Dynamic skill loading at session startup via `buildSkillLoadingSection()` in `session-capability.ts`. Replaces the old static `_skill-loading.md` approach. Resolution order: per-step skills (TASK.md frontmatter) → base capability skills (CAPABILITY_CONFIG.skills) → global mandatory skills (`pio`, `ask-user`). Mandatory skills are force-injected (content wrapped in `<skill>` XML tags); recommended skills listed as loading instructions.
- **DECISIONS.md** — Accumulated across steps starting at Step 2, documents architectural decisions, plan deviations, and file placement choices made during specification and implementation. Read by the Finalize Goal Agent to update project documentation.
- **Plan Frontmatter** — The YAML frontmatter block in PLAN.md containing `totalSteps` and a `steps` array of `{ name, complexity? }` entries. `complexity` is optional, defaulting to `"task"`. Subgoal steps are declared here with `complexity: "subgoal"`. This frontmatter is the single source of truth for step definitions — `GoalState.steps()` derives from it rather than scanning folders.
- **Queue Key** — The key used to address a goal's task slot in `.pio/session-queue/`. Flat goals use the goal name basename. Nested subgoals produce hierarchical keys (e.g., `parent__S03__nested`) via `deriveQueueKey()`, using `__` as delimiter.
- **Subgoal** — A child goal workspace spawned by a plan step with `complexity: "subgoal"`. Lives under `S{NN}/subgoals/<name>/` inside the parent step folder. Runs through the full pio lifecycle recursively (create-goal → create-plan → evolve-plan → execute-task → review-code → finalize-goal). On completion, propagates back to the parent's evolve-plan.
- **acli (Atlassian CLI)** — Command-line tool for interacting with Jira. Used by agents via `bash` tool calls as described in the `pio-jira` skill. Provides issue pull/push, JQL search, and auth management without TypeScript capability code.
- **Jira Integration** — A skill-only integration: all Jira operations (auth check, pull tickets to local issues, push local issues to Jira, JQL search) are guided by `src/skills/pio-jira/SKILL.md` rather than TypeScript capabilities. Agents invoke `acli` via bash.
- **Jira config file** — Optional `.pio/jira-config.yaml` storing `projectKey` and `defaultType` for issue push operations. Created by agents following the pio-jira skill push protocol.
- **Plan Revision** — A workflow capability (`revise-plan`) triggered when evolve-plan's specification writer detects significant divergence from the plan. Archives current PLAN.md to `PLAN_ARCHIVE/`, deletes incomplete step folders, and rewrites a fresh plan with completed steps as anchors.
- **REVISE_PLAN_NEEDED** — A marker file written by the specification writer (evolve-plan agent) inside a step folder (`S{NN}/REVISE_PLAN_NEEDED`) to signal that the plan must be revised. The transition resolver detects this via `StepStatus.revisionNeeded()` and routes to `revise-plan` instead of continuing normally.
- **PLAN_ARCHIVE** — Directory inside a goal workspace (`<goalDir>/PLAN_ARCHIVE/`) storing timestamped copies of PLAN.md before each revision. Enables the revise-plan agent to reference previous plan attempts.

## Acronyms

| Acronym | Expansion |
|---------|-----------|
| acli | Atlassian CLI — command-line tool for Jira operations |
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

- **Goal-driven workflow** — The core concept: complex work is structured as goals, each decomposed into a plan of ordered steps. Each step is specified (TASK.md with acceptance criteria), implemented test-first (executor derives tests from TASK.md using TDD), and reviewed (approve/reject) in isolated sub-sessions. Complex steps can be further decomposed via nested subgoals.
- **Specification-driven implementation** — `evolve-plan` produces TASK.md (what to build, with acceptance criteria) before any code is written. The executor (`execute-task`) derives test cases from the acceptance criteria using TDD methodology, then writes tests first and implements. This separates planning from execution and enables focused sub-sessions.
- **Subgoal lifecycle** — Complex steps marked `complexity: "subgoal"` in plan frontmatter spawn a child goal under `S{NN}/subgoals/<name>/`. The child runs the full pio lifecycle independently. On completion, `finalize-goal` propagates back to the parent's `evolve-plan`, which resumes the parent workflow via the session queue.
- **Review gate** — After implementation, `review-code` evaluates quality, test coverage, and alignment with requirements. Approval advances the workflow; rejection sends the step back for re-execution with feedback from REVIEW.md.
- **DECISIONS.md carryover** — Starting at Step 2, `evolve-plan` writes DECISIONS.md to document architectural decisions made during specification. Subsequent steps read this to maintain consistency across the implementation.
- **Transition audit trail** — Each capability completion records a transition entry in `<goalDir>/transitions.json`: an append-only JSON array tracking from→to transitions with timestamps and params. Provides observability into the workflow's progress.
- **Finalization gate** — After a goal completes, the finalize-goal capability reads accumulated decisions and updates `.pio/PROJECT/*.md` documentation. The pio-project-knowledge skill provides canonical update rules that map decision categories to target files. This ensures future goals benefit from accumulated knowledge.

