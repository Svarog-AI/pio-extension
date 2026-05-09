# Plan: Issue Tracker

Add `create-issue` (non-session tool) and `goal-from-issue` (session capability) to pio-extension, enabling lightweight bug/idea capture as markdown files under `.pio/issues/` and conversion of issues into structured goals.

## Prerequisites

- None. All required utilities (`goalExists`, `resolveGoalDir`, `enqueueTask`, `launchCapability`) already exist in the codebase.

## Steps

### Step 1: Add issue-related utility functions to `src/utils.ts`

**Description:** Add shared helpers for managing the `.pio/issues/` directory and resolving issue files. These mirror the existing goal utility pattern (`resolveGoalDir`, `goalExists`). Functions needed:

- `issuesDir(cwd: string): string` — returns the path to `.pio/issues/`, creating it if absent (mirrors `queueDir`).
- `findIssuePath(cwd: string, identifier: string): string | undefined` — resolves an issue identifier (bare filename like `20260101_120000.md`, basename only, or a relative/absolute path) to a full filesystem path, returning `undefined` if not found.
- `readIssue(cwd: string, identifier: string): string | undefined` — resolves the issue via `findIssuePath` and returns its file contents, or `undefined` if not found.

These utilities are needed by both `create-issue` (directory creation) and `goal-from-issue` (issue lookup + reading).

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no type errors after the changes
- [ ] New functions follow the same import/export style as existing utils (named exports, no default export)
- [ ] `issuesDir` creates `.pio/issues/` with `{ recursive: true }` matching the pattern in `queueDir`

**Files affected:**
- `src/utils.ts` — add `issuesDir`, `findIssuePath`, and `readIssue` functions

### Step 2: Create `create-issue` capability (non-session tool)

**Description:** Implement a new file `src/capabilities/create-issue.ts` that provides both a tool (`pio_create_issue`) and a command (`/pio-create-issue`). This runs entirely in the current session — no sub-session is spawned. Follows the `init.ts` / `delete-goal.ts` pattern.

**Tool parameters (TypeBox schema):**
- `title: string` — issue title
- `description: string` — issue body/description
- `category?: string` — optional classification (e.g., "bug", "improvement", "idea")
- `context?: string` — optional additional context (file references, observed behavior)

**Behavior:**
1. Ensure `.pio/issues/` directory exists via `issuesDir()` from utils.
2. Generate a timestamp-based filename: `YYYYMMDD_HHmmss.md` using `Date.now()`.
3. Write a markdown file with the format:

```markdown
# {title}

{description}
```

With optional `## Category` and `## Context` sections when those params are provided.

4. Return confirmation message with the file path.

**Command:** `/pio-create-issue <title> [description]` accepts a title as the first positional arg and an optional description. If the description is omitted, the command should prompt the user to enter one interactively (e.g., via `ctx.ui.ask` or similar interactive API).

**Setup function:** `setupCreateIssue(pi: ExtensionAPI)` registers the tool and command following the existing pattern.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no type errors
- [ ] Tool imports match the established pattern (`defineTool` from pi, `Type` from typebox)
- [ ] Uses `issuesDir()` from `../utils` for directory management
- [ ] Exported setup function `setupCreateIssue` follows the signature `function(pi: ExtensionAPI)`
- [ ] Generated markdown file has correct structure (title as h1, description body, optional sections)
- [ ] Command prompts user for description when only title is provided

**Files affected:**
- `src/capabilities/create-issue.ts` — new file: full capability implementation

### Step 3: Create `goal-from-issue` capability (session capability)

**Description:** Implement a new file `src/capabilities/goal-from-issue.ts` that bridges issues to goals. Provides both a tool (`pio_goal_from_issue`) and a command (`/pio-goal-from-issue`). Follows the `create-goal.ts` pattern with pre-launch validation.

**Tool parameters (TypeBox schema):**
- `name: string` — goal workspace name (used as `.pio/goals/<name>`)
- `issuePath: string` — issue filename or identifier (e.g., `20260101_120000.md`)

**Behavior:**
1. Locate and read the issue using `readIssue()` from utils. If not found, return error.
2. Check goal workspace collision via `goalExists(resolveGoalDir(cwd, name))`. If exists, return error (same pattern as `create-goal.ts`).
3. Create goal workspace directory with `fs.mkdirSync(goalDir, { recursive: true })`.
4. **For the tool:** Queue a `create-goal` task via `enqueueTask()` with `capability: "create-goal"`, `systemPromptName: "create-goal.md"`, validation requiring `GOAL.md`, and `initialMessage` containing the full issue content prefixed with context (e.g., `"Convert the following issue into a goal:\n\n{issue content}"`).
5. **For the command:** Launch a `create-goal` sub-session via `launchCapability()` with the same config, passing issue content as `initialMessage`.

The key design decision from GOAL.md: reuse `create-goal.md` prompt — no new prompt template needed. The Goal Definition Assistant already handles receiving initial context via `initialMessage`.

**Setup function:** `setupGoalFromIssue(pi: ExtensionAPI)` registers the tool and command.

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no type errors
- [ ] Tool validates issue exists before proceeding (returns error text if not found)
- [ ] Tool validates goal workspace does not already exist (returns error on collision, same message pattern as `create-goal.ts`)
- [ ] Tool queues task with `capability: "create-goal"` and `systemPromptName: "create-goal.md"` (reuses existing create-goal infrastructure)
- [ ] Command launches sub-session via `launchCapability()` with issue content in `initialMessage`
- [ ] All pre-launch work happens before `launchCapability()` call (ctx staleness pattern from `create-goal.ts`)

**Files affected:**
- `src/capabilities/goal-from-issue.ts` — new file: full capability implementation

### Step 4: Register both capabilities in `src/index.ts`

**Description:** Wire the two new setup functions into the extension entry point following the existing registration pattern.

1. Add import statements for `setupCreateIssue` and `setupGoalFromIssue`.
2. Call both setup functions inside the default export, placing them alongside other capability registrations (order is not critical since they are independent).

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` reports no type errors
- [ ] Both `setupCreateIssue(pi)` and `setupGoalFromIssue(pi)` are called in the default export
- [ ] Import paths are correct (`./capabilities/create-issue` and `./capabilities/goal-from-issue`)

**Files affected:**
- `src/index.ts` — add 2 import lines + 2 setup function calls

### Step 5: Final type-check validation

**Description:** Run the full project type check to confirm all new code compiles cleanly with no errors across the entire codebase.

**Acceptance criteria:**
- [ ] `npm run check` (which runs `npx tsc --noEmit`) exits with code 0 and reports zero errors
- [ ] No unused import warnings in the new files

**Files affected:**
- None (validation step only)

## Notes

- **No new prompt templates needed.** `goal-from-issue` reuses `create-goal.md` by passing `systemPromptName: "create-goal.md"` to both `launchCapability` and `enqueueTask`. The existing Goal Definition Assistant prompt already knows how to work with `initialMessage` context.
- **Timestamp format for issues:** Use `YYYYMMDD_HHmmss` format (e.g., `20260127_143052.md`) rather than raw epoch milliseconds. This is more readable in directory listings while still guaranteeing uniqueness. Use something like:

  ```ts
  const now = new Date();
  const ts = now.toISOString().replace(/[T:.Z-]/g, "").slice(0, 14).slice(0, -3); // YYYYMMDDHHmmss
  const filename = `${ts}.md`;
  ```

- **Issue file format is intentionally simple.** No frontmatter, no structured schema — just markdown. This keeps `create-issue` fast and lets users edit issues manually if desired.
- **No issue listing/search tool is in scope.** The GOAL.md explicitly states "no issue lifecycle management" for this goal. A future goal could add `/pio-list-issues` or similar.
- **The `goal-from-issue` command name in the CLI:** Should be `/pio-goal-from-issue` per the GOAL.md naming convention. The tool name is `pio_goal_from_issue`.
