---
name: pio-project-knowledge
description: Canonical reference for the 7 `.pio/PROJECT/*.md` files — their paths, section structure, and update rules. Use when the `project-context` capability needs to know what each PROJECT file contains, or when the `finalize-goal` capability needs to route decisions to the correct PROJECT file for updates.
---

## Overview

The 7 files under `.pio/PROJECT/` form the **project context** loaded by pio sub-sessions. On `before_agent_start`, `OVERVIEW.md` is injected as a custom conversation message, giving every agent a baseline understanding of the project. The remaining 6 files are available on demand for deeper context.

This skill documents:
1. **Canonical paths** — exact relative paths for all 7 files
2. **Section structure** — expected headings and content for each file
3. **Update rules** — which decision categories map to which PROJECT file (enables the `finalize-goal` agent to route decisions correctly)

## File Registry

| # | Canonical Path | Title | Purpose |
|---|---------------|-------|---------|
| 1 | `.pio/PROJECT/OVERVIEW.md` | Project Overview | Project description, tech stack, repository structure |
| 2 | `.pio/PROJECT/DEVELOPMENT.md` | Development Guide | Build/test commands, test conventions, CI/CD, local setup |
| 3 | `.pio/PROJECT/CONVENTIONS.md` | Code Conventions | Coding style, linting/formatting, AI agent instructions |
| 4 | `.pio/PROJECT/GIT.md` | Git Conventions | Commit message format, types, scope, tags, branches, signing |
| 5 | `.pio/PROJECT/ARCHITECTURE.md` | Architecture | Patterns and design decisions, capability pattern, service integrations, data flow |
| 6 | `.pio/PROJECT/DEPENDENCIES.md` | Dependencies | External APIs, third-party libraries, internal module graph, data flow |
| 7 | `.pio/PROJECT/GLOSSARY.md` | Glossary | Terms, acronyms, business concepts |

## Section Structure

### OVERVIEW.md

```
# Project Overview
  — Purpose of the project (2-4 sentences)
  — Author, license, repository reference

## Tech Stack
  — Programming languages, frameworks, databases, infrastructure tools
  — Include versions when available

## Repository Structure
  — Key directories and their purpose
  — Tree format or concise list (top-level only)
```

### DEVELOPMENT.md

```
# Development Guide

## Build and Test
  — How to build, test, and lint
  — Commands, frameworks, prerequisites

## Test Directory Convention
  — Where test files live relative to source files
  — Test runner and configuration details

## CI/CD and Release
  — CI/CD pipeline stages, release cycle, deployment process

## Local Environment Setup
  — Environment variables, configs, secrets
  — External services required (database, message broker, etc.)
  — Commands to start locally
```

### CONVENTIONS.md

```
# Code Conventions

## Coding Style
  — Conventions from editor configs (tsconfig.json, .editorconfig, .prettierrc)
  — Indentation, line length, quotes, semicolons, naming conventions

## Linting and Formatting
  — Linting tools, formatting tools, how to run them
  — Configuration files and key rules

## AI Agent Instructions
  — Conventions from AGENTS.md / CLAUDE.md or similar files
  — Project-specific agent guidance encoded in prompts
```

### GIT.md

```
# Git Conventions

## Commit Message Format
  — Format: Conventional Commits (type(scope): description), custom prefixes
  — Observed commit types and usage examples
  — Scope usage patterns
  — Tag/versioning scheme (semver, calver, or none detected)
  — Branch naming patterns and branching strategy
  — Merge commit conventions (squash vs. merge PRs)
  — Signing practices (GPG, DCO sign-off, or none observed)
```

### ARCHITECTURE.md

```
# Architecture

## Patterns and Design Decisions
  — Architecture patterns (MVC, layered, event-driven, microservices, etc.)
  — Capability pattern (if applicable): module structure, registration, lifecycle
  — Key design decisions and trade-offs
  — ADRs (Architecture Decision Records) if they exist

## Service Integrations
  — How the project integrates with other services
  — Deployment topology
  — Ecosystem context — how the project fits into larger systems
```

### DEPENDENCIES.md

```
# Dependencies

## External APIs
  — Third-party APIs and services the project integrates with
  — Endpoints, versions, authentication methods

## Third-Party Libraries
  — Key libraries and frameworks, why they are used
  — Typically presented as a table: Package | Version | Purpose

## Internal Package Graph
  — If a monorepo: how internal packages depend on each other
  — Module dependency tree or ASCII diagram

## Data Flow Between Services
  — How data moves across service boundaries
  — Workflow pipeline diagrams (ASCII art)
```

### GLOSSARY.md

```
# Glossary

## Terms
  — Domain-specific terminology with definitions

## Acronyms
  — Acronyms and their full expansions (typically a table)

## Business Concepts
  — Key business concepts relevant to understanding the codebase
```

## Update Rules

When evaluating decisions (e.g., from a completed goal's `DECISIONS.md`), use these rules to determine which PROJECT file to update. Each rule maps a decision category to a target file and specific section.

### OVERVIEW.md

| Decision Category | Target Section | Action |
|-------------------|---------------|--------|
| New files or directories introduced | Repository Structure | Add entries to the directory tree |
| New dependency categories or technology additions | Tech Stack | Add language, framework, or tool entries with versions |

### ARCHITECTURE.md

| Decision Category | Target Section | Action |
|-------------------|---------------|--------|
| System-wide architectural patterns adopted | Patterns and Design Decisions | Document the pattern and rationale |
| Capability contract changes (module structure, registration) | Patterns and Design Decisions (Capability Pattern) | Update capability pattern description |
| New data flows between services or modules | Service Integrations | Add or update data flow diagrams |

### CONVENTIONS.md

| Decision Category | Target Section | Action |
|-------------------|---------------|--------|
| New TypeScript config settings or naming conventions | Coding Style | Document the new convention |
| New AI agent instructions or prompt conventions | AI Agent Instructions | Add or update agent guidance |
| New linting or formatting rules | Linting and Formatting | Document tools and rules |

### DEPENDENCIES.md

| Decision Category | Target Section | Action |
|-------------------|---------------|--------|
| New third-party libraries added | Third-Party Libraries | Add to the libraries table with version and purpose |
| New internal modules or package relationships | Internal Package Graph | Update module dependency tree |
| New external API integrations | External APIs | Document endpoints and authentication |

### DEVELOPMENT.md

| Decision Category | Target Section | Action |
|-------------------|---------------|--------|
| New build or test scripts / patterns | Build and Test | Add commands and descriptions |
| Test directory convention changes | Test Directory Convention | Update the stated convention |
| New CI/CD pipeline stages | CI/CD and Release | Document new stages or processes |
| New local environment requirements | Local Environment Setup | Add environment variables or service requirements |

### GIT.md

| Decision Category | Target Section | Action |
|-------------------|---------------|--------|
| Commit convention changes (new types, scope rules) | Commit Message Format | Update observed types table and format description |
| Branch naming pattern changes | Commit Message Format (branch naming) | Update branch naming patterns |
| Tagging or versioning practice changes | Commit Message Format (tagging) | Update tag/versioning scheme |

### GLOSSARY.md

| Decision Category | Target Section | Action |
|-------------------|---------------|--------|
| New domain terms introduced | Terms | Add term with definition |
| New acronyms used in the codebase | Acronyms | Add acronym and expansion |
| New business concepts relevant to the codebase | Business Concepts | Add concept description |

## Decision Filtering

Not every decision warrants a PROJECT file update. Apply this filter before updating:

- **Skip implementation-only details:** Internal function signatures, local variable naming, or algorithm choices that don't affect project-wide conventions.
- **Skip local design choices:** Decisions scoped to a single file or module with no downstream consequences.
- **Skip one-off decisions:** Temporary workarounds, experimental features, or decisions unlikely to persist.
- **Update when the decision establishes a pattern, convention, or structural change** that future contributors or agents should know about.

When in doubt, skip — it's better to leave a decision undocumented in PROJECT files than to force an update that doesn't fit any section naturally.
