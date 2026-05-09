# Add autocomplete support for pio commands in the terminal

When the user types `/pio-` in the pi chat, there should be tab-completion / autocomplete suggestions for available commands. Currently commands are registered programmatically via `pi.registerCommand()` but nothing surfaces them to the user until they know the exact name.

## Current state

11 commands are registered across capabilities:

| Command | What it does |
|---|---|
| `/pio-init` | Initialize `.pio/` directory |
| `/pio-create-goal <name>` | Create goal workspace |
| `/pio-delete-goal <name>` | Delete a goal workspace |
| `/pio-create-plan <name>` | Generate PLAN.md for a goal |
| `/pio-evolve-plan <name>` | Spec next plan step |
| `/pio-execute-plan <name>` | Implement all plan steps |
| `/pio-project-context` | Generate .pio/PROJECT.md |
| `/pio-next-task` | Launch next queued task |
| `/pio-parent` | Switch to parent session |
| `/pio-create-issue <slug> ...` | Create an issue |
| `/pio-goal-from-issue <issue> <name>` | Convert issue to goal |

There is no autocomplete, listing, or help mechanism for these commands. Users discover them by reading the README or asking the agent.

## To-be state

- Typing `/pio-` in pi chat triggers inline suggestions of available commands
- Commands that take arguments show usage hints (e.g., `<name>`)
- Optional: `/pio-help` lists all registered commands with descriptions

## Questions

- Does the `pi-coding-agent` ExtensionAPI provide an autocomplete registration API? Or do we need to generate a completion file (`.pio/completions.json`) that a terminal plugin can consume?
- Should this live in the pi core framework or as part of this extension?
- For goal-scoped commands (`create-plan`, `evolve-plan`, etc.), should it autocomplete existing goal names from `.pio/goals/`?

## Category

improvement

## Context

Commands are registered via `pi.registerCommand(name, { description, handler })` across 10 capability files. The `ExtensionAPI` interface may already support completion suggestions — needs investigation.

## Category

improvement

## Context

Relevant: src/capabilities/*.ts (all registerCommand calls), @earendil-works/pi-coding-agent ExtensionAPI type definitions for any autocomplete/completion APIs.
