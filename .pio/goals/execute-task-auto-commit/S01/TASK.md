# Task: Register skills and create pio-git skill

Extract skill registration into `setupSkills()` in `src/index.ts` using filesystem discovery (no hardcoded list), and create the `pio-git` skill at `src/skills/pio-git/SKILL.md`.

## Context

Currently, skill registration is inline in the extension factory function — a hardcoded array of 4 skill paths registered via `pi.on("resources_discover", ...)`. Skills on disk that aren't in this array (e.g., `write-a-skill`) are invisible to agents. A new `pio-git` skill is needed to provide git operations for pio workflow agents. This step replaces the hardcoded list with filesystem discovery so any subdirectory containing a `SKILL.md` is automatically registered, and creates the `pio-git` skill.

## What to Build

### 1. Extract `setupSkills()` in `src/index.ts`

Refactor the inline skill registration into a standalone `setupSkills(pi: ExtensionAPI)` function that:
- Scans the `SKILLS_DIR` directory using `fs.readdirSync()` (synchronous — no async needed at startup)
- For each subdirectory, checks if a `SKILL.md` file exists inside it (`path.join(dir, entry, "SKILL.md")` + `fs.existsSync()`)
- Collects matching paths into `skillPaths` (each entry: `path.join(SKILLS_DIR, "<skill-name>")`)
- Registers the handler via `pi.on("resources_discover", async () => ({ skillPaths }))`
- Is called from the extension factory (replacing the inline code)

No hardcoded skill names — adding a new skill requires only creating its directory and `SKILL.md`.

### 2. Create `src/skills/pio-git/SKILL.md`

A new skill file following the established SKILL.md structure (YAML frontmatter + markdown body). The skill defines how pio agents perform git operations using shell commands via the `bash` tool.

**Required sections:**

- **YAML frontmatter:** `name: pio-git` with a description covering git operations for pio agents
- **Convention lookup rule:** Before any git operation, read `.pio/PROJECT/GIT.md` to learn commit message format, types, scope rules, and branch naming. The skill never defines its own conventions — it defers to GIT.md entirely. If GIT.md does not exist, fall back to a short descriptive one-liner.
- **Staged commit protocol (unified approach):**
  - If `SUMMARY.md` exists in the working directory (per-step commits from `execute-task`), extract file paths from "Files Created", "Files Modified", and "Files Deleted" sections, then stage those exact paths with `git add <paths>`. Note: `git add` on a deleted path correctly stages the deletion.
  - Otherwise (`execute-plan` or no SUMMARY.md), run `git status --porcelain` to find all changed/untracked files, and stage those paths with `git add <paths>`.
  - Never use `git add -A` — only stage explicitly determined files.
- **Commit message construction:** Read `.pio/PROJECT/GIT.md` and follow its conventions exactly. Write a short descriptive one-liner summarizing the change. No "Step N" or similar substrings in commit messages. If GIT.md does not exist, use a plain descriptive one-liner.
- **Graceful failure semantics:** If any git command fails (no repo, not configured, permissions), log a warning and proceed — never block workflow completion.
- **Future extensibility note:** Document that the skill is structured to accommodate future operations: branch checkout on `create-goal`, PR creation on `finalize-goal`.

### Code Components

#### `setupSkills(pi: ExtensionAPI): void` (in `src/index.ts`)

**What it does:** Discovers all skills by scanning `SKILLS_DIR` for subdirectories containing `SKILL.md`, builds the `skillPaths` array, and registers a `resources_discover` handler.

**Interface:**
```typescript
function setupSkills(api: ExtensionAPI): void
```

**How it fits:** Called from the extension factory, replacing the inline `const skillPaths = [...]` and `pi.on("resources_discover", ...)` block. Uses the existing `SKILLS_DIR` constant and `path.join()` pattern already established in `src/index.ts`. Imports `fs` from `node:fs` (already used in tests).

### Approach and Decisions

- **Filesystem discovery, not a hardcoded list:** `setupSkills()` uses `fs.readdirSync(SKILLS_DIR)` + `fs.existsSync()` to find all subdirectories containing a `SKILL.md`. No manual registration needed — placing a skill directory under `skills/` is sufficient.
- **Synchronous scan at startup:** The scan happens synchronously during extension initialization (like the existing inline code). No async/await needed since this runs once at startup, not per-request.
- **Filter by `SKILL.md` existence:** Only directories containing a `SKILL.md` file are registered. Empty directories or directories without a valid skill entry are silently skipped.
- **Follow existing patterns:** The SKILL.md structure should mirror `src/skills/pio-project-knowledge/SKILL.md` — YAML frontmatter with `name` and `description`, followed by organized markdown sections. Use the conventions from `write-a-skill/SKILL.md` for SKILL.md authoring (description under 1024 chars, written in third person, first sentence describes capability, second sentence provides triggers).
- **Skill is prompt-driven only:** No TypeScript code or executable scripts — the skill instructs agents which shell commands to run via `bash`. Follow the pattern of `pio-planning/SKILL.md` (instructions-only, no code).

## Dependencies

None. This step is fully independent — it does not require changes from Steps 2 or 3.

## Files Affected

- `src/index.ts` — extract inline skill registration into `setupSkills()` using filesystem discovery, import `node:fs`
- `src/skills/pio-git/SKILL.md` — new file: shared git operations skill for pio agents
- `src/index.test.ts` — update skill registration tests to verify all skills are discovered (including `write-a-skill` and `pio-git`)

## Acceptance Criteria

### Code changes (`src/index.ts`)

1. `src/index.ts` contains a `setupSkills()` function that discovers skills by scanning `SKILLS_DIR` for subdirectories containing `SKILL.md`
2. The function registers the handler via `pi.on("resources_discover", async () => ({ skillPaths }))`
3. The function is called from the extension factory (replacing the previous inline registration)
4. No hardcoded skill names in the skill paths array — discovery is purely filesystem-based
5. All existing skills are auto-discovered: `pio`, `test-driven-development`, `pio-project-knowledge`, `pio-planning`, `write-a-skill`, `pio-git`
6. `npx tsc --noEmit` reports no TypeScript errors

### Skill file (`src/skills/pio-git/SKILL.md`)

7. `src/skills/pio-git/SKILL.md` exists with valid YAML frontmatter containing `name: pio-git`
8. Frontmatter `description` is under 1024 characters, written in third person, includes a "Use when..." trigger phrase
9. Skill documents the convention lookup rule: read `.pio/PROJECT/GIT.md` before operations, defer to its conventions
10. Skill documents the unified staged commit protocol: SUMMARY.md extraction if present, otherwise `git status --porcelain`
11. Skill specifies `git add <paths>` (not `git add -A`) as the staging method
12. Skill specifies commit messages as short descriptive one-liners without "Step N" substrings
13. Skill documents graceful failure semantics: warn and proceed, never block workflow completion
14. Skill structure accommodates future git operations (branch checkout, PR creation) as out-of-scope extensions

### Tests (`src/index.test.ts`)

15. Existing tests in `src/index.test.ts` pass with no regressions after the refactoring
16. All six skill names appear in `skillPaths` (verifyable: run `npx vitest run src/index.test.ts --reporter=verbose`)

### Programmatic Verification

17. Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0
18. Given all tests when `npx vitest run --reporter=verbose` is run then all tests pass with exit code 0

### Programmatic Verification

15. Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0
16. Given all tests when `npx vitest run --reporter=verbose` is run then all tests pass with exit code 0

## Risks and Edge Cases

- **Test regression:** The existing test `"skillPaths contain absolute paths under the skills directory"` explicitly checks for exactly 4 skill names (`pio`, `test-driven-development`, `pio-project-knowledge`, `pio-planning`). Update it to verify all 6 skills (or verify that discovery returns at least these, plus `write-a-skill` and `pio-git`).
- **Directory scanning edge cases:** Ensure the scan skips non-directory entries (e.g., `.DS_Store`, files directly in `skills/`). Use `fs.statSync()` or `path.isAbsolute()` + `entry.isDirectory()` to filter. Handle gracefully if `SKILLS_DIR` doesn't exist at startup (shouldn't happen, but don't crash).
- **Skill ordering:** Filesystem readdir may return entries in arbitrary order. If tests assert a specific order, they may need to sort or use `.toContain` checks instead.
- **ESM import of `node:fs`:** The current `index.ts` imports from `node:path` and `node:url`. Adding `import * as fs from "node:fs"` follows the same pattern. Ensure the ESM module syntax is consistent.
