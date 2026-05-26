---
skills:
  mandatory:
    - test-driven-development
---

# Task: Jira Utilities Module

Create a shared utility module (`src/capabilities/jira-utils.ts`) for all `acli` interaction — child process spawning, JSON parsing, error detection, and config file reading.

## Context

Currently there is no code to interact with external CLI tools or Jira in the pio-extension. Steps 2 and 3 (jira-to-issue and issue-to-jira capabilities) both need to spawn `acli` processes, parse JSON output, detect auth errors, and read a `.pio/jira-config.yaml` config file. This step centralizes all shared logic into pure utility functions — no tool or command registration here.

## What to Build

A new module at `src/capabilities/jira-utils.ts` exporting three pure functions:

### Code Components

#### `runAcli(cwd: string, args: string[]): Promise<AcliResult>`

- Spawns `acli` as a child process with the given arguments, using `cwd` as the working directory.
- Uses Node.js built-in `child_process` — no new dependencies. Since all callers are async (tool execute callbacks), use the async API (`spawn` or `execFile` via `promisify`).
- On success: parses stdout as JSON, returns `{ stdout: parsedObject, stderr, exitCode }`.
- When `acli` is not found on PATH (child_process ENOENT error): returns an error result with a helpful message mentioning `acli` installation.
- When the output contains "unauthorized" (case-insensitive) in stdout or stderr: returns an error result directing user to run `acli jira auth login`.
- When JSON parsing fails (non-JSON output from a successful acli call): includes the raw stderr in the error message.

**Interface:**

```ts
interface AcliResult {
  stdout: Record<string, unknown>;
  stderr?: string;
  exitCode: number;
}

interface AcliError {
  error: string;
  stdout?: Record<string, unknown>;
  stderr?: string;
  exitCode: number;
}
```

The function should return `Promise<AcliResult | AcliError>`. Use a discriminated union — presence of `error` field distinguishes success from failure.

#### `readJiraConfig(cwd: string): JiraConfig | undefined`

- Reads `.pio/jira-config.yaml` from the given working directory using `js-yaml`.
- Follows the same pattern as `readConfig()` in `src/model-config.ts`: check file existence, read with `fs.readFileSync`, parse with `js-yaml.load()`, validate fields.
- Returns `undefined` when the file doesn't exist, is empty, or is malformed YAML.
- Validates that `projectKey` and `defaultType` are strings if present.

**Interface:**

```ts
interface JiraConfig {
  projectKey?: string;
  defaultType?: string;
}
```

#### `jiraKeyToSlug(key: string): string`

- Derives a local issue slug from a Jira ticket key.
- Converts the key to lowercase and prefixes with `jira-`.
- Example: `PROJ-123` → `jira-proj-123`, `MY-PROJECT-456` → `jira-my-project-456`.
- Pure function, no I/O.

### Approach and Decisions

- **Use `spawn` from `child_process`:** Follow Node.js best practices — use the async `spawn()` API rather than sync variants since all callers are in async tool callbacks. Collect stdout/stderr via data events or use `promisify(execFile)` for simpler code.
- **Follow model-config.ts pattern for YAML:** The config reading logic should mirror `readConfig()` in `src/model-config.ts` — same error handling approach (try/catch, existence checks, type validation). Use `import { load } from "js-yaml"` matching the existing convention there.
- **Path resolution with cwd:** Accept `cwd` as parameter (matching `issuesDir(cwd)` pattern in `fs-utils.ts`). Build config path as `path.join(cwd, ".pio", "jira-config.yaml")`.
- **Error discrimination via union type:** Use a discriminated union (`error` field present = failure) rather than throwing exceptions. This allows callers to handle errors gracefully without try/catch — matching how `createIssue()` in `create-issue.ts` returns error strings instead of throwing.

## Skills

**test-driven-development** (mandatory): Write tests first for each utility function before implementing. Verify edge cases: acli not found, unauthorized errors, missing config file, malformed YAML, various Jira key formats.

No additional skills recommended beyond the mandatory pio skill and test-driven-development.

## Dependencies

None. This is Step 1 — no prior steps required.

## Files Affected

- `src/capabilities/jira-utils.ts` — new file: exports `runAcli`, `readJiraConfig`, `jiraKeyToSlug`, and interfaces `AcliResult`, `AcliError`, `JiraConfig`

## Acceptance Criteria

- `npm run check` reports no errors
- `runAcli` returns an error result (discriminated by `error` field) when `acli` is not found on PATH
- `runAcli` detects "unauthorized" in stdout or stderr and returns a helpful message referencing `acli jira auth login`
- `readJiraConfig` returns `undefined` when `.pio/jira-config.yaml` doesn't exist
- `readJiraConfig` parses valid YAML and returns typed `JiraConfig` with `projectKey` and `defaultType` fields
- `jiraKeyToSlug` converts `PROJ-123` to `jira-proj-123`
- `jiraKeyToSlug` is case-insensitive: `My-Project-456` → `jira-my-project-456`
- All three functions are exported from the module

## Risks and Edge Cases

- **acli may not be installed on CI:** Tests for `runAcli` should mock child_process spawning rather than relying on a real `acli` binary. Use vitest mocking (`vi.mock("node:child_process")`) or test the error path by verifying ENOENT handling.
- **Platform differences:** `which acli` doesn't exist on Windows. The ENOENT approach (spawn fails with code "ENOENT") works cross-platform — don't use a `which` check, rely on spawn error codes instead.
- **JSON parsing edge cases:** `acli` might output non-JSON text even on success (e.g., progress messages). Handle `JSON.parse` failures gracefully — return an error result with the raw output.
- **YAML loading safety:** `js-yaml.load()` can execute arbitrary JavaScript in unsafe mode. The config file is local and per-repo, but use safe loading if available (`load()` without explicit unsafe flag is safe by default in js-yaml 4.x).
