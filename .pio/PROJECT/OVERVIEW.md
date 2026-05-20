# Project Overview

**pio-extension** is an extension for the [pi](https://github.com/earendil-works/pi-coding-agent) coding agent framework that provides a goal-driven project management workflow. It enables developers and AI agents to break complex work into structured sub-sessions with validation gates, prompt templates, and explicit output requirements. Each workflow step (goal definition → planning → specification → implementation → review → finalization) runs in its own isolated sub-session, ensuring focused execution and verifiable outputs.

Developed by Svarog AI. Licensed under MIT. Repository: `github.com:Svarog-AI/pio-extension`.

## Tech Stack

- **Language:** TypeScript 5.8+ (ES2022 target, ESNext modules)
- **Module system:** ESM (`"type": "module"`, `import.meta.url` for `__dirname`)
- **Framework:** `@earendil-works/pi-coding-agent` ^0.74.0 — extension API for tool/command registration and sub-session management
- **Validation schemas:** `typebox` ^1.1.24 — JSON Schema types for tool parameter definitions
- **YAML parsing:** `js-yaml` ^4.1.1 — parses REVIEW.md frontmatter and `~/.pi/pio-config.yaml`
- **Test runner:** Vitest 4.x — unit tests with global `describe/it/expect`, Node.js environment
- **TypeScript config:** Strict mode, `noEmit`, bundler module resolution (`tsconfig.json`)
- **Package manager:** npm (see `package-lock.json`)

## Repository Structure

```
pio-extension/
├── src/
│   ├── capabilities/        # Tool + command implementations per workflow capability
│   │   ├── init.ts              — pio_init: bootstraps .pio/ directory
│   │   ├── create-goal.ts       — pio_create_goal: creates goal workspace, queues definition session
│   │   ├── create-plan.ts       — pio_create_plan: generates PLAN.md from GOAL.md
│   │   ├── evolve-plan.ts       — pio_evolve_plan: generates TASK.md + TEST.md per step
│   │   ├── execute-task.ts      — pio_execute_task: implements a single plan step (TDD)
│   │   ├── review-code.ts       — pio_review_code: reviews implementation, approve/reject
│   │   ├── execute-plan.ts      — /pio-execute-plan command: all steps in one session
│   │   ├── delete-goal.ts       — pio_delete_goal: removes a goal workspace
│   │   ├── next-task.ts         — /pio-next-task: dequeues and launches pending tasks
│   │   ├── parent.ts            — /pio-parent: switches back to parent session
│   │   ├── project-context.ts   — pio_create_project_context: generates .pio/PROJECT/ files
│   │   ├── create-issue.ts      — pio_create_issue: creates .pio/issues/<slug>.md
│   │   ├── goal-from-issue.ts   — pio_goal_from_issue: converts issue → goal workspace
│   │   ├── list-goals.ts        — /pio-list-goals: lists goals with phase and last task
│   │   ├── finalize-goal.ts     — pio_finalize_goal: reads accumulated decisions, updates .pio/PROJECT/
│   │   ├── session-capability.ts — shared launcher + prompt injection + model switching
│   │   └── *.test.ts            — colocated tests for each capability module
│   ├── guards/                # Event-handling guards (file protection, dead-turn detection)
│   │   ├── validation.ts        — pio_mark_complete tool + file protection (readOnly/writeAllowlist)
│   │   └── turn-guard.ts        — detects thinking-only turns, sends recovery prompts
│   ├── prompts/               # System prompt templates (markdown, injected per session type)
│   │   ├── create-goal.md         — Goal Definition Assistant
│   │   ├── create-plan.md         — Planning Agent
│   │   ├── evolve-plan.md         — Specification Writer
│   │   ├── execute-task.md        — Execute Task Agent (TDD)
│   │   ├── review-code.md         — Code Review Agent
│   │   ├── execute-plan.md        — Implementation Agent (all steps)
│   │   ├── project-context.md     — Project Context Analyzer
│   │   ├── finalize-goal.md       — Finalize Goal Agent (updates PROJECT docs from accumulated decisions)
│   │   └── _skill-loading.md      — Shared skill-loading instructions
│   ├── skills/                # Discoverable skills for pi's <available_skills>
│   │   ├── pio/SKILL.md           — pio workflow reference
│   │   ├── test-driven-development/SKILL.md — TDD methodology guide
│   │   └── pio-project-knowledge/SKILL.md  — Canonical knowledge source for .pio/PROJECT/ files
│   ├── index.ts               # Extension entry point — wires all capabilities into pi API
│   ├── types.ts               # Shared type definitions (ValidationRule, CapabilityConfig, etc.)
│   ├── fs-utils.ts            # Filesystem helpers (resolveGoalDir, stepFolderName, discoverNextStep)
│   ├── capability-config.ts   # Resolve capability name → full CapabilityConfig (dynamic imports)
│   ├── goal-state.ts          # GoalState — lazy-evaluated filesystem view over goal workspace
│   ├── state-machine.ts       # Pure transition resolver (create-goal→create-plan→evolve→execute→review)
│   ├── queues.ts              # Session task queue (enqueueTask, readPendingTask, per-goal slots)
│   └── model-config.ts        # Per-capability model config from ~/.pi/pio-config.yaml
├── .pio/                      # Runtime workspace (goals, issues, session queue)
│   ├── goals/<name>/          # Per-goal workspaces: GOAL.md, PLAN.md, S01/, transitions.json
│   ├── issues/                # Issue backlog as markdown files
│   ├── PROJECT/               # 7-file project context (loaded by sub-sessions)
│   └── session-queue/         # Per-goal task slots (task-{goalName}.json)
├── .github/workflows/ci.yml   # CI: type check + Vitest tests on push/PR to main
├── docs/                      # Empty — no documentation files yet
├── package.json               # Dependency manifest + pi extension config (pi.extensions[0])
├── tsconfig.json              # TypeScript compiler options (strict, noEmit)
├── vitest.config.ts           # Vitest config: Node.js env, globals, src/**/*.test.ts
├── LICENSE                    # MIT (c) 2026 Svarog AI
└── README.md                  # Project documentation with command reference
```
