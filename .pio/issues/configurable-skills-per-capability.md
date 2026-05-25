# Configurable skill injection per capability via pio configuration

## Problem

Skills are currently injected into sub-sessions as a flat `<available_skills>` block discovered from the filesystem. Agents rely on self-directed scanning to figure out which skills to load, leading to inconsistent behavior — e.g., agents skip loading `pio-git` during `create-goal` because they think they "know how to checkout branches already."

There's no declarative way for a capability or user to say "this session MUST load these skills before proceeding."

## Proposed Direction

1. **Capability config declares required skills.** Each `CapabilityConfig` could specify which skills are mandatory for that capability (e.g., `create-goal` requires `pio-git` and `grill-me`, `create-plan` requires `pio-planning` and `grill-me`). These become injected at session start, not optional.

2. **User overrides via `~/.pi/pio-config.yaml`.** Users can add, remove, or replace skills per capability to customize behavior (e.g., swap out the planning methodology, add custom team skills).

3. **Mandatory vs. discoverable split.** Skills fall into two categories: those explicitly required by the config (injected upfront) and those available for self-directed loading (current behavior). This eliminates the "agent forgot to load a skill" problem for critical dependencies.

## Category

improvement

## Context

Related files: `src/types.ts` (CapabilityConfig definition), `src/capability-config.ts` (config resolution), `src/model-config.ts` (per-capability config from pio-config.yaml), `src/prompts/_skill-loading.md` (current skill injection approach)
