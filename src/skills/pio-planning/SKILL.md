---
name: pio-planning
description: Shared planning methodology for pio planning capabilities (create-plan, revise-plan). Documents PLAN.md structure, step design rules, acceptance criteria guidelines, research process, and scope discipline. Use when writing or reviewing a PLAN.md for any pio goal.
---

## Overview

This skill defines the planning methodology shared across all pio planning capabilities. It specifies how to produce a `PLAN.md` — the canonical implementation plan for a pio goal. A reader who understands this skill knows exactly how to write a PLAN.md without needing any other prompt file.

This skill covers:
1. **PLAN.md Structure** — file format, frontmatter, required sections
2. **Step Design Rules** — how to decompose work into executable steps
3. **Acceptance Criteria Guidelines** — how to specify verifiable completion checks
4. **Research Process** — what to investigate before designing steps
5. **Scope Discipline** — boundaries and constraints on plan content
6. **Subgoal Decomposition** — when and how to nest subgoals within plan steps
7. **User Interaction Protocol** — how to gather decisions during planning

## PLAN.md Structure

### YAML Frontmatter

PLAN.md must start with a YAML frontmatter block containing `totalSteps`. This value must equal the actual number of step headings in the plan. The frontmatter block appears before the document title, delimited by `---` on their own lines:

```yaml
---
totalSteps: <number of steps>
---
```

**Rule:** The `totalSteps` value must equal the count of `### Step N:` headings in the document. If steps are added or removed, update `totalSteps` accordingly.

### Document Title

Immediately after the frontmatter, the document title follows the format:

```markdown
# Plan: <Goal Name>
```

Below the title, include a one-line summary of what the plan achieves, referencing GOAL.md for context.

### Required Sections

Every PLAN.md must contain these sections in order:

1. **`## Prerequisites`** — List preconditions that must be met before starting (e.g., "database migration tool installed"). If none, write "None." Do not omit this section.
2. **`## Steps`** — The numbered implementation steps (see Step Design Rules below).
3. **`## Notes`** — Additional context: known risks, edge cases, migration strategy decisions, backwards-compatibility notes, or things an executor should watch out for. If none, write "None." Do not omit this section.

### Step Heading Format

Each step uses the heading format:

```markdown
### Step N: <Descriptive Title>
```

Where `N` is the step number (1-indexed, sequential) and the title is a concise description of what the step accomplishes.

## Step Design Rules

Each step is a deliverable — a coherent output you can name and verify as complete. Design steps as concrete transformations, not as activities or tasks. A step description should read like "build X" not "work on X".

Each step must contain three required subsections:

### Description

Natural language description of what exactly changes in this step. Describe the behavior being added, removed, or modified. You may include a short interface signature (type stub) to clarify a contract if it helps, but **do not write implementation code**. No function bodies, no class implementations, no multi-line logic blocks.

### Acceptance Criteria

A checklist of verifiable conditions that prove the step is complete. See Acceptance Criteria Guidelines below.

### Files Affected

List every file created, modified, or deleted:

- `path/to/existing.ts` — brief note on what changes (e.g., "add new function X", "refactor Y to use Z")
- `path/to/new-file.ts` — new file: purpose

### Step Quality Criteria

Steps should be:

- **Concrete:** A reader knows exactly what deliverable is produced and what code changes or new artifacts are involved.
- **Ordered:** Steps that depend on earlier steps come later. No reordering needed during execution. Steps must reflect real implementation order — if step 3 needs an export from step 1, that must be clear. An executor should never have to reorder steps.
- **Sized for an executor:** Small enough that a single focused session can produce one deliverable without distraction. Aim for steps that take minutes to an hour to implement, not days.
- **Independent where possible:** If two steps don't depend on each other, order them so they *could* be done in parallel. Mark such steps with `**Parallel with Step N**` if applicable.

## Acceptance Criteria Guidelines

### Mandatory

Every step must have at least one acceptance criterion.

### Prefer Programmatic Verification

Acceptance criteria should be verifiable through automated means:

- **Type checking:** `npx tsc --noEmit` reports no errors
- **Existing test suites:** "running existing test suite passes with no regressions"
- **Build commands:** project builds without errors
- **File existence:** new files or exports are created and importable
- **HTTP checks:** endpoints return expected status codes
- **Linting:** lint commands pass without errors

### Criteria Verify Completion — They Do Not Plan Tests

Your job is to specify how each step can be checked programmatically once implemented. Reference existing tests that cover the area, or describe what a passing check looks like. If programmatic verification truly isn't possible (e.g., visual change), state so explicitly and provide the best manual alternative.

**Examples:**

- Good: "`npx tsc --noEmit` reports no errors" (programmatic verification)
- Good: "the new function is exported from `src/auth/index.ts`" (verifiable fact)
- Good: "running existing test suite passes with no regressions" (existing tests)
- Bad: "unit tests for X cover all edge cases" (that's evolve-plan/execute-task territory)
- Bad: "write a new test file `src/__tests__/x.test.ts`" (belonging in TEST.md, not PLAN.md)

### No Dedicated Test Steps

You must not create dedicated plan steps for writing unit tests. Per-step unit testing is handled by `evolve-plan` (which generates `TEST.md` with specific test cases) and `execute-task` (which writes and runs those tests).

**Exception:** You may include an integration verification step near the end of a plan when the goal requires cross-module or end-to-end verification spanning multiple steps. This is distinct from per-step unit testing.

### Specificity

A criterion is too vague if an executor could disagree about whether it's met. Write criteria that leave no ambiguity about what "done" means.

## Research Process

Before designing steps, conduct thorough research using available tools (`read`, `bash`):

1. **Read `.pio/PROJECT/OVERVIEW.md`** if it exists — this is the project's entry point and explains structure.
2. **Read every file referenced in `GOAL.md`.** Trace dependencies, imports, and related code that will be affected by the change.
3. **Understand existing patterns:** conventions, testing setup, build configuration, and CI pipeline.
4. **Identify hidden complexity:** shared utilities, circular dependencies, migration requirements, backwards-compatibility concerns.
5. **Look at existing tests** — understand how things are tested today so you can specify proper acceptance criteria.

This is where deep research belongs. You need to be confident about implementation details before writing the plan. If a step's acceptance criteria can't be made programmatic because you don't understand the test setup, go learn the test setup.

## Scope Discipline

- **Stay within GOAL.md scope.** Do not add steps for refactoring unrelated code, fixing style issues, or "while you're at it" improvements. Those belong in separate goals.
- **`GOAL.md` is read-only during planning.** Never modify it. Your output is `PLAN.md` only — no source code creation.
- **Reference real files only.** Every path in PLAN.md should correspond to a file you actually read or confirmed exists. Don't guess paths.
- **No source code in PLAN.md.** This is a planning document, not an implementation draft. Describe every step in natural language or high-level pseudocode. You may write a short interface signature (type stub) if it clarifies a contract — never full function bodies or class implementations. If you find yourself writing `if`/`for`/`while` blocks, stop and rewrite that section as a description.

## Subgoal Decomposition

When a deliverable is too large or complex for a single executor session, decompose it into a nested subgoal. Subgoals run through the full pio lifecycle recursively — they get their own `GOAL.md`, `PLAN.md`, and independent step execution.

### I/O contract test

A deliverable is a coherent transformation. Can you state its output without listing internal sub-outputs?

- **Yes → leaf step** (`complexity` omitted or `"task"`). The output is a single deliverable you can name in one phrase.
  - *Example:* "Add input validation to the auth endpoint" — output is the validated endpoint.
  - *Example:* "Implement JWT token validation" — output is the validation middleware.
- **No → composite step** (`complexity: "subgoal"`). Stating the output requires listing multiple internal sub-deliverables.
  - *Example:* "Implement OAuth flow" — output requires token endpoint, callback handler, session store, error pages.
  - *Example:* "Build the data pipeline" — output requires ingestion, transformation, storage, monitoring.

### Encapsulation rule

Does the parent plan need to know *how* this deliverable is built?

- **Yes → keep as a regular flat step.** The parent coordinates or depends on internal details.
  - *Example:* "Update the API schema" — parent steps depend on specific field names and types.
  - *Example:* "Add migration scripts" — parent steps depend on migration order and naming.
- **No → subgoal.** Internal implementation details are irrelevant to the parent plan.
  - *Example:* "Implement OAuth flow" — parent only needs the auth middleware endpoint.
  - *Example:* "Build the notification service" — parent only needs the service interface.

### Frontmatter-based declaration

Subgoal metadata lives exclusively in PLAN.md frontmatter `steps` array. Each entry has:

- **`name`** (required): Human-readable label. Serves as the subgoal workspace directory name when `complexity` is `"subgoal"`. Use slugified form (lowercase, hyphens, no spaces).
- **`complexity`** (optional): `"task"` (default) for leaf steps, `"subgoal"` for composite steps.

Example frontmatter:

```yaml
---
totalSteps: 5
steps:
  - name: setup-infrastructure
    complexity: task
  - name: build-auth-pipeline
    complexity: subgoal
  - name: integrate-payments
    complexity: task
  - name: build-notification-service
    complexity: subgoal
  - name: end-to-end-testing
    complexity: task
---
```

No in-body annotations or regex parsing — the frontmatter is the single source of truth for subgoal metadata.

## User Interaction Protocol

When planning requires user input, follow these guidelines:

- **Present research findings before asking decisions.** Summarize what your research uncovered: key files, dependencies, hidden complexity, risks. Keep this concise — focus on what's new or surprising.
- **Use `ask_user` for architecture choices.** Present structured options with 2-5 clear choices and trade-off descriptions. Ask one decision at a time.
- **Max 2 attempts per boundary decision.** Don't loop indefinitely on a single question.
- **Summarize plan structure before writing.** After all questions are answered and steps are designed, present the planned step count and high-level step titles to the user before committing to PLAN.md. Confirm this is what they expect, then proceed.
- **Don't over-interview.** The user already documented their intent in GOAL.md — only ask when research genuinely revealed something unclear or when multiple valid paths exist. Keep to 2-3 exchange rounds total. If the path is clear, present findings briefly and move on.
- **If GOAL.md is too vague to plan against**, tell the user and suggest what needs clarification. Don't fill in blanks yourself — a vague goal produces a vague plan.
