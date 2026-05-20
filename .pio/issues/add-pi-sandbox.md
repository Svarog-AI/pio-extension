# Integrate pi-sandbox into pio-extension installation with project-local configuration support

## Overview

Integrate [pi-sandbox](https://www.npmjs.com/package/pi-sandbox) into the pio workflow so that sandboxing is set up automatically when a project is initialized, and developers can manage per-project sandbox policies.

## Requirements

### 1. Install pi-sandbox during `pio_init`

When running `pio_init` (or an equivalent setup step), install `pi-sandbox` if it's not already present — e.g. via `pi install npm:pi-sandbox` or by adding it as a dependency/extension reference. This ensures every pio project has sandboxing available out of the box.

**Prerequisite check:** pi-sandbox depends on `@carderne/sandbox-runtime`, which requires `ripgrep` (`rg`) on PATH at init time. The installation step should detect if `rg` is available and surface a clear error or guidance if it's missing. See [pi-sandbox Quickstart](https://www.npmjs.com/package/pi-sandbox#quickstart) for the install instructions per platform.

### 2. Project-local `.pio/sandbox.json`

pi-sandbox supports config at `~/.pi/agent/sandbox.json` (global) and `.pi/sandbox.json` (local). Pio projects should use a pio-scoped path: **`.pio/sandbox.json`** so the config lives alongside other pio artifacts (goals, issues, PROJECT files).

This could be handled by:
- Creating a default `.pio/sandbox.json` during `pio_init`, or
- Generating one on-demand via a dedicated tool/command (e.g. `pio_setup_sandbox`), or
- Documenting the convention and providing scaffolding templates in the pio skill docs.

### 3. Scaffolding a sensible default config

The initial `.pio/sandbox.json` should start with a reasonable secure-by-default policy for typical development work, modeled after pi-sandbox's example `sandbox.json`:

```json
{
  "enabled": true,
  "filesystem": {
    "denyRead": ["/Users", "/home"],
    "allowRead": ["."],
    "allowWrite": [".", "/tmp"],
    "denyWrite": [".env", ".env.*", "*.pem", "*.key"]
  },
  "network": {
    "allowedDomains": ["github.com", "*.github.com"]
  }
}
```

Users can then relax or tighten the policy per project as needed.

## Files to modify (expected)

- `src/capabilities/init.ts` — add pi-sandbox installation and/or `.pio/sandbox.json` scaffolding to `pio_init`
- Potentially a new capability file if sandbox setup warrants its own tool/command
- `src/skills/pio/SKILL.md` — document the sandbox config convention

## Category

Feature / improvement

## Category

improvement

## Context

pi-sandbox package: npm:pi-sandbox (OS-level sandboxing for pi). Config paths it supports: `~/.pi/agent/sandbox.json` (global) and `.pi/sandbox.json` (local). Pio uses `.pio/` directory, so project config should go to `.pio/sandbox.json`. Dependency: requires `ripgrep` (`rg`) binary on PATH.
