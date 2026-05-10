# pio — Pi Goal-Driven Workflow Extension

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that provides a goal-driven project management workflow using sub-sessions, validation gates, and prompt templates.

## Capabilities

| Command | Tool | Description |
|---------|------|-------------|
| `/pio-init` | `pio_init` | Initialize a new pio project (`.pio/`) |
| `/pio-create-goal <name>` | `pio_create_goal` | Create a goal workspace and launch a definition session |
| `/pio-delete-goal <name>` | `pio_delete_goal` | Delete a goal workspace |
| `/pio-create-plan <name>` | `pio_create_plan` | Generate `PLAN.md` for an existing goal |
| `/pio-evolve-plan <name>` | `pio_evolve_plan` | Generate `TASK.md` + `TEST.md` for the next plan step |
| `/pio-execute-plan <name>` | — | Implement all steps from a plan in a single session |
| `/pio-next-task` | — | Process the next queued task from `.pio/session-queue/` |
| `/pio-project-context` | `pio_create_project_context` | Analyze project files and generate `.pio/PROJECT.md` |
| `/pio-parent` | — | Switch back to the parent session |

Shared tool: `pio_mark_complete` (validates output files on completion)

## Workflow

1. **`pio-init`** — bootstrap the `.pio/` directory structure
2. **`pio-create-goal <name>`** — spawns a sub-session that interviews you and writes `GOAL.md` into `.pio/goals/<name>/`
3. **`pio-create-plan <name>`** — reads `GOAL.md`, researches the codebase, produces `PLAN.md`
4. **`pio-evolve-plan <name>`** — takes the next incomplete step from `PLAN.md`, produces `S{NN}/TASK.md` + `TEST.md`
5. **`pio-execute-plan <name>`** — implements all steps from `PLAN.md` in one session

## Installation

Add this extension directory to your pi configuration:

```yaml
# .pi/config.yaml
extensions:
  - /path/to/pio-extension
```

Or use the tools directly within agent sessions.

## Project Structure

```
pio-extension/
├── src/
│   ├── capabilities/        # Tool + command implementations
│   │   ├── create-goal.ts
│   │   ├── create-plan.ts
│   │   ├── delete-goal.ts
│   │   ├── evolve-plan.ts
│   │   ├── execute-plan.ts
│   │   ├── init.ts
│   │   ├── next-task.ts
│   │   ├── parent.ts
│   │   ├── project-context.ts
│   │   ├── session-capability.ts
│   │   └── validation.ts
│   ├── prompts/             # System prompt templates (markdown)
│   │   ├── create-goal.md
│   │   ├── create-plan.md
│   │   ├── evolve-plan.md
│   │   ├── execute-plan.md
│   │   └── project-context.md
│   ├── index.ts             # Extension entry point
│   └── utils.ts             # Shared utilities
├── package.json
├── tsconfig.json
└── LICENSE
```

## Dependencies

- `pi-ask-user` — provides the `ask-user` skill, enabling decision handshakes before high-stakes changes in all pio sub-sessions.

## Development

```bash
npm install          # install dev dependencies
npm run check        # TypeScript type check
```

## License

MIT — see [LICENSE](./LICENSE)
