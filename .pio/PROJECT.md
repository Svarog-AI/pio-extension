# Project Overview

**pio-extension** is an extension for the [pi](https://github.com/earendil-works/pi-coding-agent) coding agent framework that provides a goal-driven project management workflow. It enables developers and AI agents to break complex work into structured sub-sessions with validation gates, prompt templates, and explicit output requirements. Each workflow step (goal definition → planning → specification → implementation) runs in its own isolated sub-session, ensuring focused execution and verifiable outputs.

Developed by Svarog AI. Licensed under MIT. Repository: `github.com:Svarog-AI/pio-extension.git`.

## Tech Stack

- **Language:** TypeScript 5.8+ (ES2022 target, ESNext modules)
- **Module system:** ESM (`"type": "module"`, `import.meta.url` for `__dirname`)
- **Framework:** `@earendil-works/pi-coding-agent` ^0.74.0 — extension API for tool/command registration and sub-session management
- **Validation:** `typebox` ^1.1.24 — JSON Schema types for tool parameter definitions
- **TypeScript config:** Strict mode, no emit, bundler module resolution (`tsconfig.json`)
- **Package manager:** npm (see `package-lock.json`)

## Repository Structure

```
pio-extension/
├── src/
│   ├── capabilities/        # Tool + command implementations
│   │   ├── init.ts              — pio_init tool: bootstraps .pio/ directory
│   │   ├── create-goal.ts       — pio_create_goal tool/command: creates goal workspace
│   │   ├── create-plan.ts       — pio_create_plan tool/command: generates PLAN.md
│   │   ├── evolve-plan.ts       — pio_evolve_plan tool/command: generates TASK.md + TEST.md per step
│   │   ├── execute-plan.ts      — /pio-execute-plan command: implements all plan steps in one session
│   │   ├── delete-goal.ts       — pio_delete_goal tool/command: removes a goal workspace
│   │   ├── next-task.ts         — /pio-next-task command: processes queued tasks from session-queue/
│   │   ├── parent.ts            — /pio-parent command: switches back to parent session
│   │   ├── project-context.ts   — pio_create_project_context tool/command: generates .pio/PROJECT.md
│   │   ├── session-capability.ts — shared launcher + system prompt injection (before_agent_start)
│   │   └── validation.ts        — pio_mark_complete tool + exit-gate + file protection (readOnly/writeOnly)
│   ├── prompts/             # System prompt templates (markdown, injected per session type)
│   │   ├── create-goal.md         — Goal Definition Assistant prompt
│   │   ├── create-plan.md         — Planning Agent prompt
│   │   ├── evolve-plan.md         — Specification Writer prompt
│   │   ├── execute-plan.md        — Implementation Agent prompt
│   │   └── project-context.md     — Project Context Analyzer prompt
│   ├── index.ts             # Extension entry point — wires all capabilities into pi API
│   └── utils.ts             # Shared utilities (resolveGoalDir, goalExists, enqueueTask, queueDir)
├── .pio/                    # Runtime workspace (gitignored except on active use)
│   ├── goals/<name>/        # Per-goal workspaces: GOAL.md, PLAN.md, S01/TASK.md, etc.
│   └── session-queue/       # JSON task files queued for sub-session processing
├── package.json             # Dependency manifest + pi extension config (pi.extensions[0])
├── tsconfig.json            # TypeScript compiler options (strict, noEmit)
├── LICENSE                  # MIT (c) 2026 Svarog AI
└── README.md                # Project documentation with command reference
```

## Build, Test, and Deploy

- **Install:** `npm install` — installs devDependencies (`@earendil-works/pi-coding-agent`, `typebox`, `typescript`)
- **Type check:** `npm run check` — runs `tsc --noEmit`
- **No build step:** The extension is consumed as raw TypeScript ESM modules by the pi framework. There is no transpilation or bundling (`package.json` scripts for `build` and `clean` are stubs that echo "nothing to build/clean").
- **No test suite:** No test runner, test files, or CI pipeline exist in the repository. Verification relies on type checking (`npm run check`) and manual code review.
- **Installation as extension:** Add the extension directory path to `.pi/config.yaml` under `extensions:`. The pi framework reads `package.json`'s `pi.extensions` array to locate `./src/index.ts`. You can run `pi install .` to do this automatically locally.

## Development Workflow

- **Branching:** Single `main` branch on GitHub (`github.com:Svarog-AI/pio-extension`). No branching conventions documented.
- **No CI/CD:** No `.github/workflows/`, `.gitlab-ci.yml`, or similar pipeline configurations exist.
- **Local development requires no services:** No database, message broker, or external dependencies needed. Just `npm install` and `npm run check`.
- **Extension registration:** The entry point (`src/index.ts`) exports a default function `(pi: ExtensionAPI) => void` that registers tools, commands, and event handlers via the pi extension API.

### pio Workflow Commands (runtime, not dev)

| Command | Tool | What it does |
|---------|------|-------------|
| `/pio-init` | `pio_init` | Creates `.pio/` with `prompts/` and `work-memory/` subdirs |
| `/pio-create-goal <name>` | `pio_create_goal` | Creates `.pio/goals/<name>/`, launches Goal Definition Assistant sub-session |
| `/pio-delete-goal <name>` | `pio_delete_goal` | Removes a goal workspace directory |
| `/pio-create-plan <name>` | `pio_create_plan` | Launches Planning Agent to produce `PLAN.md` from `GOAL.md` |
| `/pio-evolve-plan <name>` | `pio_evolve_plan` | Finds next incomplete step, launches Specification Writer for `TASK.md` + `TEST.md` |
| `/pio-execute-plan <name>` | — (command only) | Launches Implementation Agent to execute all plan steps in one session |
| `/pio-next-task` | — (command only) | Dequeues the oldest JSON task from `.pio/session-queue/` and launches its sub-session |
| `/pio-project-context` | `pio_create_project_context` | Analyzes project files, produces `.pio/PROJECT.md` |
| `/pio-parent` | — (command only) | Switches back to the parent session (reads `parentSession` from session header) |

Shared tool: `pio_mark_complete` — validates that expected output files exist before allowing session exit.

### Sub-session lifecycle

1. A capability calls `launchCapability()` in `session-capability.ts`, which creates a new pi sub-session with a custom entry (`pio-config`) containing the system prompt name, working directory, validation rules, and file protections.
2. On `resources_discover`, the framework reads the config, loads the corresponding markdown prompt from `src/prompts/`.
3. On `before_agent_start`, it injects `.pio/PROJECT.md` (if present) followed by the capability-specific prompt as the session's system prompt.
4. The agent works within the session. File protections (`readOnlyFiles` / `writeOnlyFiles`) are enforced via the `tool_call` event handler.
5. On session exit, validation rules check that expected output files exist. Missing files trigger a warning and block the first switch attempt.

## AI Agent Instructions

**No dedicated agent instruction files exist** (no `AGENTS.md`, `CLAUDE.md`, `CURSOR.md`, `.wolf/`, or `.github/copilot-instructions.md`). The prompts in `src/prompts/` serve as the de facto agent guidance — each defines detailed rules for its respective workflow role.

### Conventions encoded in prompts:

- **No source code in planning docs:** GOAL.md, PLAN.md, TASK.md contain descriptions and interface signatures only — never full implementations.
- **Programmatic verification preferred:** Acceptance criteria should be verifiable via `npm run check`, file existence checks, or similar automated means.
- **Stay within scope:** Each capability prompt explicitly forbids out-of-scope changes (refactoring unrelated code, "while you're at it" improvements).
- **Reference real files:** Every file path in generated documents must correspond to a file the agent actually read.

Consider adding an `AGENTS.md` at the project root to codify general contribution conventions for human and AI contributors.

## Important Notes

- **ESM only:** The project uses `"type": "module"` in `package.json`. All imports are bare specifiers with `.ts` extensions omitted (resolved by pi's runtime). Use `fileURLToPath(import.meta.url)` instead of `__dirname` — see `session-capability.ts` for the pattern.
- **No transpilation:** Code runs as-is via pi's TypeScript execution. `tsconfig.json` has `"noEmit": true`. The `build` script is a no-op stub.
- **Context injection order:** In `session-capability.ts`, `.pio/PROJECT.md` is injected first, then the capability-specific prompt. Both are concatenated with `\n\n` separator. PROJECT.md content is cached module-level and read once per session lifetime.
- **Validation is one-shot:** The exit-gate in `validation.ts` blocks only the *first* attempted switch when validation fails (tracked by `warnedOnce`). A hard cap of 3 warnings per session prevents infinite blocking loops.
- **Tool vs. command:** Most capabilities expose both a tool (callable by agents) and a command (callable via `/` prefix). Some (`execute-plan`, `next-task`, `parent`) are command-only — no corresponding tool.
- **Queue files use timestamps:** Task filenames in `.pio/session-queue/` are `{timestamp}-{capability}.json`. Lexicographic sort = chronological order for FIFO processing.
- **`launchCapability` consumes context:** After calling `launchCapability()`, the command context is stale. All pre-launch work (validation, filesystem setup) must happen before the call — see every capability's command handler for this pattern.
- **Existing goal workspace:** `.pio/goals/recursive-project-context-discovery/` contains an in-progress GOAL.md and PLAN.md for adding "attention hints" to the project-context feature.
- **Gitignore:** Only `node_modules/` and `dist/` are ignored. The `.pio/` directory is tracked in git (though likely should be ignored in most repos).
