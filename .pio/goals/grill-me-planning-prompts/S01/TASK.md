# Task: Rewrite grill-me skill as a reusable technique guide

Completely rewrite `src/skills/grill-me/SKILL.md` from its current ~7-line body into a proper reusable technique guide supporting four usage contexts.

## Context

The `grill-me` skill currently has only ~7 lines of body text and a narrow description focused on reactive stress-testing ("Interview the user relentlessly about a plan or design"). It needs to become a comprehensive, self-contained technique guide usable across all pio planning/definition workflows: goal definition (probing scope), plan creation (validating assumptions), plan revision (confirming pivots), and reactive stress-testing (the existing mode).

Per pio core principles, capabilities describe WHAT outcomes are needed, skills provide HOW to achieve them. This skill should be the canonical source for deep probing technique — capability-agnostic and self-contained.

## What to Build

Completely rewrite `src/skills/grill-me/SKILL.md`. The file uses YAML frontmatter (with `name` and `description` fields) followed by markdown body. The rewrite must produce a substantial skill document — not a few lines, but a proper technique guide with structured sections.

### Code Components

This task involves a single file: `src/skills/grill-me/SKILL.md`. No TypeScript code, tests, or other artifacts are affected.

#### Frontmatter — description field

Broaden the `description` field so the skill auto-discovers naturally across all planning/definition contexts. The current description ("Interview the user relentlessly about a plan or design until reaching shared understanding") only matches reactive stress-testing scenarios. The new description should mention: probing user intent, validating assumptions, goal definition, planning, plan revision, and reactive stress-testing (when user mentions "grill me").

#### Skill body — four usage contexts

The body must provide concrete technique guidance for each of four contexts:

1. **Goal definition** — Probing user intent to clarify scope. Ask focused questions about the problem, affected areas, and constraints. Stay light — goal definition is directional, not exhaustive. Stop after 2-3 rounds per section. The agent should recommend answers when possible but leave room for the user to redirect.

2. **Plan creation** — Validating assumptions after research. When feasibility doubts emerge or multiple valid approaches exist, probe the user to resolve gaps before committing to a plan. Present findings concisely, ask one decision at a time, recommend answers. The agent should anchor questions in specific research discoveries (files read, patterns found) rather than asking abstractly.

3. **Plan revision** — Confirming pivots mid-flight. The revision trigger revealed something broke — validate that the new direction is acceptable, negotiate scope changes, confirm which completed work to preserve. This context has urgency: decisions here affect already-completed work. The agent should present what changed (revision trigger reason, how remaining work differs from archived plan) before asking.

4. **Reactive stress-testing** — User explicitly says "grill me." Walk down each decision tree branch relentlessly. Ask one at a time. Recommend answers. This is the existing mode — preserve its spirit but give it proper structure within the larger guide.

#### Skill body — shared technique guidance

Across all contexts, provide concrete HOW: how to structure questions (one at a time, recommend answers), when to stop probing, how to handle ambiguity vs. confirmed decisions, and how to use `ask_user` effectively for structured options.

#### Relationship with pio-planning's User Interaction Protocol

The skill must document its relationship with `pio-planning`'s Section 8 ("User Interaction Protocol"). That section covers general timing guidelines: when to ask, max attempts per boundary, summarizing before writing, not over-interviewing. The grill-me skill covers the deep probing technique — how to probe effectively once you've decided to engage. State this distinction clearly without hardwiring capability references (no "in create-plan.md Step 3..." type language).

#### Relationship with ask-user skill

The `ask-user` skill (`pi-ask-user`) defines the protocol for the `ask_user` tool itself — decision gate handshake, anti-overasking guardrails, payload quality standards. The grill-me skill should reference ask-user's protocols when appropriate (e.g., "follow the ask-user skill protocol: gather context first, present 2-5 clear choices, max 2 attempts per boundary") but must not duplicate them. Grill-me provides the probing technique; ask-user provides the tool mechanics.

### Approach and Decisions

- **Follow existing skill structure conventions.** The `pio-planning` and `ask-user` skills demonstrate good patterns: YAML frontmatter with name/description, organized sections with headings, concrete guidance, anti-patterns section. Use similar structure.
- **Capability-agnostic throughout.** Do not reference specific prompt files (`create-goal.md`, `create-plan.md`, etc.) or capability names in the skill body. The contexts are described by their interaction dynamics (probing scope, validating assumptions), not by which capability triggers them.
- **Reference other skills by name, not by path.** When mentioning pio-planning or ask-user, reference them as skill names that agents will recognize from `<available_skills>`, not as file paths.
- **Use markdown formatting consistently with other skills.** Headings for sections, bold for emphasis, code spans for tool names and protocol references, bullet lists for rules and guidelines.
- **No source code in the skill.** Like all pio skills, this is a technique document — describe behavior and patterns, never write implementation code.

## Skills

- **write-a-skill** — this task is a complete skill rewrite; the write-a-skill skill provides authoritative guidance on SKILL.md structure, description requirements (triggers, third person, max 1024 chars), when to split content into REFERENCE.md (exceeding 100 lines), and the review checklist for skill quality.

## Dependencies

None. This is Step 1 — no prior steps required.

## Files Affected

- `src/skills/grill-me/SKILL.md` — complete rewrite: broaden frontmatter description, expand body from ~7 lines to a full technique guide covering four usage contexts, shared probing techniques, and relationships with pio-planning and ask-user skills

## Acceptance Criteria

- [ ] `src/skills/grill-me/SKILL.md` frontmatter `description` field is broadened to cover all four contexts (goal definition, plan creation, plan revision, reactive stress-testing)
- [ ] Skill body provides concrete technique guidance for each of the four usage contexts (goal definition, plan creation, plan revision, reactive stress-testing) — each context has a dedicated section with actionable HOW instructions
- [ ] Skill remains self-contained and capability-agnostic (no references to specific prompt files like `create-goal.md`, `create-plan.md` or capability names in instructions)
- [ ] The skill documents how it relates to pio-planning's User Interaction Protocol (timing vs. technique distinction stated clearly)
- [ ] The skill references the ask-user skill for tool mechanics without duplicating its protocol details
- [ ] The rewritten file is structurally substantial — a proper technique guide with organized sections, not an incremental augmentation of the existing ~7 lines

## Risks and Edge Cases

- **Avoid capability leakage.** It's easy to slip in references like "during plan creation..." when describing contexts. Use context-describing language ("when validating assumptions after research...") instead of capability names.
- **Balance between pio-planning and grill-me responsibilities.** Overlapping guidance between this skill and pio-planning's User Interaction Protocol could confuse agents. The distinction must be clear: pio-planning = when to engage, grill-me = how to probe effectively.
- **Don't duplicate ask-user protocol details.** Grill-me should reference ask-user for tool mechanics (handshake, guardrails) but not re-explain them. Keep grill-me focused on probing technique — question design, recommendation strategy, stopping conditions per context.
