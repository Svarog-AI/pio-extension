# pio — Pi Goal-Driven Workflow Extension

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that provides a goal-driven project management workflow using sub-sessions, validation gates, and prompt templates.

## Tools

| Tool | Description |
|------|-------------|
| `pio_init` | Initialize a new pio project (`.pio/`) |
| `pio_create_goal` | Create a goal workspace and queue a definition session |
| `pio_delete_goal` | Delete a goal workspace |
| `pio_create_plan` | Generate `PLAN.md` for an existing goal |
| `pio_evolve_plan` | Generate `TASK.md` for the next plan step |
| `pio_execute_task` | Execute a plan step with test-driven development |
| `pio_review_task` | Review a completed plan step |
| `pio_revise_plan` | Archive the current plan and queue a fresh planning session |
| `pio_quality_gate` | Run quality gate with E2E testing and code review checkpoints |
| `pio_finalize_goal` | Finalize a completed goal and update project documentation |
| `pio_create_project_context` | Analyze project files and generate `.pio/PROJECT/` context files |
| `pio_mark_complete` | Validate output files and signal session completion |

## Commands

| Command | Description |
|---------|-------------|
| `/pio-next-task` | Process the next queued task from `.pio/session-queue/` |
| `/pio-parent` | Switch back to the parent session |

## Workflow

1. **`pio-init`** — bootstrap the `.pio/` directory structure
2. **`pio-create-goal <name>`** — spawns a sub-session that interviews you and writes `GOAL.md` into `.pio/goals/<name>/`
3. **`pio-create-plan <name>`** — reads `GOAL.md`, researches the codebase, produces `PLAN.md`
4. **`pio-evolve-plan <name>`** — takes the next incomplete step from `PLAN.md`, produces `S{NN}/TASK.md` + `TEST.md`
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
