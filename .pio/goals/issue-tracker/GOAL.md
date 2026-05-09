# Issue Tracker

Add two new pio capabilities: **`create-issue`** (a non-session tool for capturing bugs, gaps, and improvement ideas as markdown files) and **`goal-from-issue`** (a session capability that converts an existing issue into a structured goal by launching the `create-goal` flow with the issue content as initial context). Issues are stored under `.pio/issues/` as timestamp-named markdown files. Both capabilities must enforce uniqueness — no duplicate issues or goal workspace collisions.

## Current State

- **pio-extension** is a goal-driven workflow manager for the [pi](https://github.com/earendil-works/pi-coding-agent) coding agent framework. It provides capabilities for goals → plans → tasks → execution, all managed via sub-sessions with validation gates and prompt templates.
- All existing capabilities live under `src/capabilities/` and are registered in `src/index.ts` via setup functions (`setupInit`, `setupCreateGoal`, etc.).
- There are two patterns for capabilities:
  - **Session capabilities** (e.g., `create-goal`, `create-plan`, `evolve-plan`): use `launchCapability()` from `session-capability.ts` to spawn a sub-session with a custom system prompt, initial message, and validation rules. Their tool variants queue tasks via `enqueueTask()` into `.pio/session-queue/` for later processing by `/pio-next-task`.
  - **Non-session tools** (e.g., `init`, `validation`): execute entirely in the current session context via `defineTool` + `registerTool`, no sub-sessions involved.
- **`create-goal`** (`src/capabilities/create-goal.ts`) already supports receiving an `initialMessage` — both the tool (via `enqueueTask`) and command (via `launchCapability`). It also checks for goal workspace collisions via `goalExists()` before proceeding. The create-goal sub-session receives this initial message as a user message in its kickoff, giving the Goal Definition Assistant context to work from.
- **Task queuing** (`src/utils.ts`): `SessionQueueTask` includes fields for `capability`, `systemPromptName`, `workingDir`, `validation`, `initialMessage`, `readOnlyFiles`, and `writeOnlyFiles`. Tasks are stored as JSON in `.pio/session-queue/` with timestamped filenames.
- **No issue tracking** currently exists. There is no concept of issues, bug reports, or lightweight captures of "things to fix" outside of the full goal → plan → task workflow.

## To-Be State

### New directory structure

```
.pio/
├── issues/          # NEW — issue markdown files
│   └── {timestamp}.md
├── goals/<name>/    # existing
└── session-queue/   # existing
```

### 1. `create-issue` capability (non-session)

A new file **`src/capabilities/create-issue.ts`** implementing both a tool (`pio_create_issue`) and a command (`/pio-create-issue`). This runs entirely in the current session context — no sub-session is spawned.

**Behavior:**
- The agent identifies something missing, broken, or improvable in the current project (a bug, gap, idea, or observation).
- The agent generates a concise but contextual issue description.
- The tool creates a markdown file under `.pio/issues/{timestamp}.md` with the content provided.
- **Issue naming**: timestamp-based filenames (e.g., `20260101_120000.md`) to guarantee uniqueness and no collisions. The directory `.pio/issues/` is created if it does not exist.
- The issue format is a simple markdown document containing: title, description, and optional context (file references, observed behavior, expected behavior).
- The tool parameter schema takes at minimum: `title` (string), `description` (string), and optionally `context` or `category`.
- The command (`/pio-create-issue`) is provided for direct user invocation but with the same non-session execution model.

### 2. `goal-from-issue` capability (session)

A new file **`src/capabilities/goal-from-issue.ts`** implementing both a tool (`pio_goal_from_issue`) and a command (`/pio-goal-from-issue`). This is a session capability that bridges the issue → goal workflow gap.

**Command behavior (`/pio-goal-from-issue <issue-identifier> <goal-name>`):**
1. Locate and read the issue file from `.pio/issues/` (by filename or search).
2. Validate the issue exists; warn if not found.
3. Check that no goal workspace already exists for the given `<goal-name>` (reuse `goalExists()` from `src/utils.ts`). Warn on collision — do not overwrite.
4. Create the goal workspace directory (`.pio/goals/<goal-name>/`).
5. Launch a `create-goal` sub-session via `launchCapability()`, passing the full issue content as the `initialMessage` so the Goal Definition Assistant receives rich context about what the goal should address.

**Tool behavior (`pio_goal_from_issue`):**
- Takes parameters: `issuePath` (string, path or filename of the issue) and `name` (string, goal workspace name).
- Same validation as the command (issue exists, no goal collision).
- Creates the goal workspace directory.
- Queues a task via `enqueueTask()` with `capability: "create-goal"`, `systemPromptName: "create-goal.md"`, and an `initialMessage` containing the full issue content. The queued task is processed later by `/pio-next-task`.

### 3. Registration

Both capabilities are registered in **`src/index.ts`** following the existing pattern — import setup functions, call them in the default export.

### Key design decisions

- **No changes to `create-goal.ts`**: It already supports `initialMessage`, so `goal-from-issue` simply reuses its session prompt and infrastructure by passing the issue content through the standard mechanism.
- **Collision prevention**: Issue filenames are timestamp-based (unique by construction). Goal workspace collisions are prevented by checking `goalExists()` before creating — same pattern as `create-goal.ts`.
- **Issue format is lightweight**: A simple markdown file, not a structured schema. This keeps `create-issue` fast and unopinionated — agents can write freely, users can edit manually.
- **No issue lifecycle management** (close, assign, etc.) is in scope for this goal. Issues are fire-and-forget capture points that feed into the goal workflow.
