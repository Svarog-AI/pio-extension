# Project Overview

**pio-extension** is an extension for the [pi](https://github.com/earendil-works/pi-coding-agent) coding agent framework that provides a goal-driven project management workflow. It enables developers and AI agents to break complex work into structured sub-sessions with validation gates, prompt templates, and explicit output requirements. Each workflow step (goal definition → planning → specification → implementation → review → quality gate → finalization) runs in its own isolated sub-session, ensuring focused execution and verifiable outputs.

Developed by Svarog AI. Licensed under MIT. Repository: `github.com:Svarog-AI/pio-extension.git`.

## Tech Stack

- **Language:** TypeScript 5.8+ (target ES2022, ESNext modules; resolved 5.9.3)
- **Module system:** ESM (`"type": "module"`, `import.meta.url` for `__dirname`)
- **Framework:** `@earendil-works/pi-coding-agent` ^0.74.0 — extension API for tool/command registration and sub-session management
- **Runtime:** Node.js 22 (CI) / local v24.x; not pinned via engines or `.nvmrc`
- **Package manager:** npm (lockfile v3)
- **Test runner:** Vitest 4.1.6 — unit tests with global `describe/it/expect`, Node.js environment
- **Validation schemas:** `typebox` ^1.1.24 — JSON Schema types for tool parameters and frontmatter validation
- **YAML parsing:** `js-yaml` ^4.1.1 — parses frontmatter and `~/.pi/pio-config.yaml`
- **Linter and formatter:** `@biomejs/biome` ^2.5.1 — linting, formatting, and import organization (recommended preset)
- **Git hooks:** `lefthook` ^2.1.9 — pre-commit hook runs Biome on staged `.ts`/`.json` files
- **TypeScript config:** Strict mode, `noEmit`, bundler module resolution (`tsconfig.json`)
- **Decision skill:** `pi-ask-user` ^0.10.0 — provides the `ask-user` skill for decision handshakes in pio sub-sessions
- **No database / external services:** filesystem-as-state-store under `.pio/`; no database, message broker, or external API dependencies

## Repository Structure

```
pio-extension/
├── src/                  # TypeScript source (extension entry + capabilities + skills)
│   ├── index.ts            — Extension entry point (registered in package.json "pi.extensions")
│   ├── capabilities/       — One directory per AI-driven capability (config.ts, workflow.ts,
│   │                        role.md, guidelines.md, optional schemas.ts / callbacks.ts)
│   ├── guards/             — Validation guards and marker engine (validation.ts, mark-complete.ts)
│   ├── runtime/            — Loop engine runtime (loop-engine, phase-manager, session-state,
│   │                        session-store, session-guard, state-persistence, exit-lifecycle)
│   ├── state-machines/     — Declarative state machine framework + pio workflow machine
│   ├── skills/             — Bundled agent skills (capability-design, pio-git, tdd)
│   └── skills.old/         — Archived/retired skills kept as reference
├── docs/                 # Design/spec documents and plans
├── .pio/                 # pio project state: goals/, issues/, session-queue/, PROJECT/
├── .github/              # CI workflows (GitHub Actions — ci.yml)
├── .vscode/              # Editor settings (empty)
├── package.json          # npm manifest, scripts, pi extension registration
├── package-lock.json     # Lockfile (npm, lockfileVersion 3)
├── tsconfig.json         # TypeScript config (strict, noEmit)
├── vitest.config.ts      # Vitest test runner config
├── biome.json            # Biome lint/format config
├── lefthook.yml          # Git hooks config
├── .gitignore
├── LICENSE               # MIT (c) 2026 Svarog AI
└── README.md             # Project overview & usage
```
