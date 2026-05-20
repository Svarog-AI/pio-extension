# Task: Create pio-project-knowledge skill

Create `src/skills/pio-project-knowledge/SKILL.md` as a shared knowledge source for the 7 `.pio/PROJECT/*.md` files, providing canonical paths, section structure, and update rules that both `project-context` (for creation) and `finalize-goal` (for updates) can reference.

## Context

Currently, PROJECT file structure is encoded inline in `src/prompts/project-context.md` (Phase 2 analysis questions mapping to output files). The upcoming `finalize-goal` capability needs similar knowledge — but for *updating* rather than creating. Without a shared source, this leads to duplication: the same 7-file descriptions would appear in two different prompts.

A single SKILL.md eliminates duplication by serving as the canonical reference. Both the project-context prompt and the future finalize-goal prompt can load this skill and defer to it for file structure details.

## What to Build

Create `src/skills/pio-project-knowledge/SKILL.md` documenting:
1. **Canonical file paths** — all 7 files under `.pio/PROJECT/` with exact relative paths
2. **Purpose and section structure** — what each file contains (title, sections, expected content)
3. **Update rules** — which types of decisions map to which PROJECT file (enabling the finalize-goal agent to route decisions correctly)

The skill follows the established SKILL.md format: YAML frontmatter with `name` and `description`, followed by structured markdown sections. No source code — this is a documentation artifact consumed by AI agents via the skill loading mechanism.

### Code Components

This task produces a single file — no TypeScript code, interfaces, or functions.

#### `src/skills/pio-project-knowledge/SKILL.md`

**YAML frontmatter:**
- `name: pio-project-knowledge`
- `description`: concise description indicating it documents the 7 PROJECT files, their structure, and update rules for AI agents working with pio project context

**Required sections:**

1. **Overview** — brief introduction explaining these 7 files form the project context loaded by sub-sessions
2. **File Registry** — a table or structured list of all 7 files with:
   - Canonical path (relative to repo root)
   - Title/heading used in the file
   - Brief purpose description
3. **Section Structure** — for each of the 7 files, document the expected sections/headings and what content belongs in each. This is derived from the Phase 2 output templates in `src/prompts/project-context.md`:
   - OVERVIEW.md: Project Overview, Tech Stack, Repository Structure
   - DEVELOPMENT.md: Build and Test, Test Directory Convention, CI/CD and Release, Local Environment Setup
   - CONVENTIONS.md: Coding Style, Linting and Formatting, AI Agent Instructions
   - GIT.md: Commit Message Format (with sub-details for types, scope, tags, branches, signing)
   - ARCHITECTURE.md: Patterns and Design Decisions, Service Integrations
   - DEPENDENCIES.md: External APIs, Third-Party Libraries, Internal Package/Module Graph, Data Flow Between Services
   - GLOSSARY.md: Terms, Acronyms, Business Concepts
4. **Update Rules** — the mapping that enables the finalize-goal agent to decide which PROJECT file to update for a given decision category:
   - New files/directories introduced → OVERVIEW.md (Repository Structure)
   - New dependency categories or technology additions → OVERVIEW.md (Tech Stack)
   - System-wide architectural patterns → ARCHITECTURE.md (Patterns and Design Decisions)
   - Capability contract changes → ARCHITECTURE.md (Capability Pattern section if applicable)
   - New data flows between services → ARCHITECTURE.md (Service Integrations / data flow)
   - New TypeScript config or naming conventions → CONVENTIONS.md (Coding Style)
   - New AI agent instructions or prompt conventions → CONVENTIONS.md (AI Agent Instructions)
   - New third-party libraries added → DEPENDENCIES.md (Third-Party Libraries table)
   - New internal modules or package relationships → DEPENDENCIES.md (Internal Module Graph)
   - New build/test scripts or patterns → DEVELOPMENT.md (Build and Test)
   - Test directory convention changes → DEVELOPMENT.md (Test Directory Convention)
   - Commit convention, branch naming, or tagging practice changes → GIT.md
   - New domain terms, acronyms, or business concepts → GLOSSARY.md
5. **Decision Filtering** — guidance that decisions which don't map to any rule above should be skipped (no forced updates). Implementation-only details, local design choices with no downstream consequences, and one-off decisions should not trigger PROJECT file updates.

### Approach and Decisions

- **Follow existing SKILL.md format exactly:** YAML frontmatter (`name`, `description`) followed by markdown sections. Study `src/skills/pio/SKILL.md` for the exact format pattern.
- **Derive section structure from actual files:** Read the 7 PROJECT files under `.pio/PROJECT/` to determine current headings and content patterns — don't guess. Use what actually exists as the authoritative reference.
- **Cross-reference project-context.md:** The Phase 2 section in `src/prompts/project-context.md` maps analysis questions to output files. This is the primary source for understanding what content belongs in each file.
- **Update rules should be specific and actionable:** Each rule should clearly state the decision category and the target PROJECT file + section. Avoid vague mappings like "anything about architecture."

## Dependencies

None. This is Step 1 — no prior steps required.

## Files Affected

- `src/skills/pio-project-knowledge/SKILL.md` — new file: shared PROJECT file knowledge skill

## Acceptance Criteria

- [ ] `src/skills/pio-project-knowledge/SKILL.md` exists with YAML frontmatter (`name: pio-project-knowledge`, descriptive description)
- [ ] Skill documents all 7 PROJECT files with canonical paths, purpose, and section structure
- [ ] Skill includes "Update Rules" mapping decision categories to target PROJECT files (e.g., new dependency → DEPENDENCIES.md, naming convention → CONVENTIONS.md)
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Section headings may evolve:** The 7 PROJECT files are generated by the project-context agent and their exact headings can vary between runs. Document the *expected canonical* headings (from the prompt templates), not necessarily what's currently in a specific instance's `.pio/PROJECT/` directory.
- **Update rules must be comprehensive but not exhaustive:** Cover all common decision categories from the GOAL.md To-Be State section, but acknowledge that new categories may emerge. The finalize-goal agent should use best judgment for unmapped decisions (skip them).
