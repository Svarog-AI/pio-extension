# Task: Update project-context capability config and descriptions

Update `src/capabilities/project-context.ts` to support writing all 7 new files under `.pio/PROJECT/` and reflect the multi-file structure in tool/command descriptions.

## Context

The project context capability currently produces a single `.pio/PROJECT.md`. With the new multi-file structure, it must be allowed to write to 7 separate files under `.pio/PROJECT/`. The `writeAllowlist` controls which paths the agent session can write to — this is enforced by the validation layer in `src/guards/validation.ts`. Additionally, the tool description and command description should reference the new multi-file output rather than a single file.

## What to Build

Modify `src/capabilities/project-context.ts` in three areas:

1. **`writeAllowlist`** — Replace `[ ".pio/PROJECT.md" ]` with an array of 7 paths under `.pio/PROJECT/`.
2. **`defaultInitialMessage`** — Update the message to reference the new multi-file structure instead of a single `PROJECT.md`.
3. **Descriptions** — Update the tool `description` and command `description` to mention the multi-file output.

### Code Components

#### `CAPABILITY_CONFIG.writeAllowlist`

Change from:
```typescript
writeAllowlist: [".pio/PROJECT.md"]
```
To exactly these 7 paths:
```typescript
writeAllowlist: [
  ".pio/PROJECT/OVERVIEW.md",
  ".pio/PROJECT/DEVELOPMENT.md",
  ".pio/PROJECT/CONVENTIONS.md",
  ".pio/PROJECT/GIT.md",
  ".pio/PROJECT/ARCHITECTURE.md",
  ".pio/PROJECT/DEPENDENCIES.md",
  ".pio/PROJECT/GLOSSARY.md",
]
```

#### `CAPABILITY_CONFIG.defaultInitialMessage`

Update to mention the multi-file structure. The callback signature is `(workingDir: string, params?: Record<string, unknown>) => string`. The message should instruct the agent to produce all 7 files (not just one). Exact wording is flexible — key requirement is it must not reference writing a single `PROJECT.md`.

#### Tool description (`createProjectContextTool.description`)

Current: `"Analyze project documentation, configuration, and infrastructure files to produce a PROJECT.md knowledge file in .pio/. Use this tool directly — all filesystem operations are handled internally."`

Update to reference the multi-file structure (e.g., "produce a set of context files under `.pio/PROJECT/`"). Keep the instruction to use the tool directly.

#### Command description (`pi.registerCommand` handler)

Current: `"Analyze project files and generate .pio/PROJECT.md for session context injection"`

Update to reference the new multi-file output (e.g., "generate `.pio/PROJECT/` context files").

### Approach and Decisions

- Keep `writeAllowlist` as a **static array** (not a callback). This is consistent with how `create-goal.ts` uses static config. Only capabilities needing dynamic resolution (like `evolve-plan`, `execute-task`) use callbacks — project-context has no step dependency.
- The paths must be relative: `.pio/PROJECT/OVERVIEW.md` etc. The validation layer (`src/guards/validation.ts` line 474) resolves these against `config.workingDir` using `path.resolve`. Since project-context is project-scoped (no `goalName`), `workingDir = cwd`, so paths resolve to `{cwd}/.pio/PROJECT/OVERVIEW.md`.
- Follow the existing file style: no new imports needed; all changes are within the existing module scope.

## Dependencies

Step 1 must be completed first (session loader change). Step 2 is independent of Steps 3–5 but should follow Step 1 per plan ordering.

## Files Affected

- `src/capabilities/project-context.ts` — modified: update `writeAllowlist`, `defaultInitialMessage`, tool description, and command description
- `src/capability-config.test.ts` — may need updates if existing tests assert on the project-context `writeAllowlist` (check for references)

## Acceptance Criteria

- [ ] `npm run check` reports no TypeScript errors
- [ ] `writeAllowlist` contains exactly 7 paths: `.pio/PROJECT/OVERVIEW.md`, `.pio/PROJECT/DEVELOPMENT.md`, `.pio/PROJECT/CONVENTIONS.md`, `.pio/PROJECT/GIT.md`, `.pio/PROJECT/ARCHITECTURE.md`, `.pio/PROJECT/DEPENDENCIES.md`, `.pio/PROJECT/GLOSSARY.md`
- [ ] `defaultInitialMessage` mentions the multi-file structure (not a single file)
- [ ] Tool description references the new output structure
- [ ] Command description references the new output structure
- [ ] No reference to the old path `.pio/PROJECT.md` remains in `project-context.ts`
- [ ] All existing tests continue to pass (`npm test`)

## Risks and Edge Cases

- **Existing tests:** Check `capability-config.test.ts` for any assertions on project-context's `writeAllowlist` or `defaultInitialMessage`. The existing test "passes through static writeAllowlist (create-goal has [\"GOAL.md\"])" targets create-goal, not project-context, but search for any project-context specific assertions.
- **Path format consistency:** Ensure all 7 paths use forward slashes (`.pio/PROJECT/...`) matching the existing convention used throughout the codebase.
