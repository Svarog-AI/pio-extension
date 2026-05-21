# Refactor StaticCapabilityConfig and CapabilityConfig — naming improvements and hook extensions

## Problem

`StaticCapabilityConfig` (what each module exports as `CAPABILITY_CONFIG`) and `CapabilityConfig` (the resolved runtime config in sub-sessions) have naming and structure issues that warrant a dedicated investigation:

### Naming concerns

- **`StaticCapabilityConfig` vs `CapabilityConfig`** — the "Static" prefix doesn't clearly communicate the distinction. One is what capability modules export; the other is the runtime-resolved config passed to sub-sessions. Better names would disambiguate at a glance (e.g., `CapabilityDefinition` / `ResolvedCapabilityConfig`, or similar).
- **`validation`** is used in both types but serves slightly different purposes — in `StaticCapabilityConfig` it can be a callback (`ConfigCallback<ValidationRule>`), while in `CapabilityConfig` it's always resolved. The property name doesn't indicate this difference.
- **`defaultInitialMessage`** (on `StaticCapabilityConfig`) is a function returning a string, while `initialMessage` (on `CapabilityConfig`) is the plain string — two names for conceptually the same data at different stages of resolution.
- **`readOnlyFiles` / `writeAllowlist`** — clear in isolation but could benefit from grouping under a single access-control property since they're mutually exclusive concepts.

### Hook extension opportunities

The current lifecycle has 3 optional hooks (`prepareSession`, `postValidate`, `postExecute`) plus an untyped PreValidate phase. Potential extensions to investigate:

- **Typed PreValidate hook** — currently each capability validates inputs inline with no typed interface. A `PreValidateCallback` could standardize this (e.g., returning `{ ready: boolean; error?: string }`).
- **Session monitoring hooks** — nothing currently runs during the agent session itself (mid-execution callbacks, progress tracking).
- **Error/recovery hooks** — when validation fails or postValidate rejects, there's no typed hook for capability-specific error handling beyond `PostValidateCallback` returning `{ success: false }`.

### Scope

This issue is an investigation, not a commit-to-refactor. The goal (capability-class-architecture) concluded that the config-object pattern is the right approach — this is about improving the *shape* of those config objects, not introducing classes.

## Deliverable

An issue-level analysis or (if scoping allows) a new goal with:
1. Proposed naming changes for `StaticCapabilityConfig`, `CapabilityConfig`, and their properties
2. Assessment of which hook extensions are worth pursuing vs. over-engineering
3. Impact analysis: how many files would be affected by renaming
4. Migration strategy if renaming is approved

## Category

improvement

## Context

Files involved: src/types.ts (StaticCapabilityConfig, CapabilityConfig, lifecycle callback types), src/capabilities/*.ts (10 capabilities using CAPABILITY_CONFIG), src/capability-config.ts (resolveCapabilityConfig dynamic import), src/capabilities/session-capability.ts (hook invocation)
