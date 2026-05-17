# Tests: Update project-context capability config and descriptions

## Unit Tests

### File: `src/capabilities/project-context.test.ts` (new)

**Test runner:** Vitest (`npm test`)

**Test cases:**

#### `describe("CAPABILITY_CONFIG.writeAllowlist")`

- **it("contains exactly 7 file paths")** — Assert `CAPABILITY_CONFIG.writeAllowlist.length === 7`.
- **it("includes OVERVIEW.md")** — Assert `.pio/PROJECT/OVERVIEW.md` is present.
- **it("includes DEVELOPMENT.md")** — Assert `.pio/PROJECT/DEVELOPMENT.md` is present.
- **it("includes CONVENTIONS.md")** — Assert `.pio/PROJECT/CONVENTIONS.md` is present.
- **it("includes GIT.md")** — Assert `.pio/PROJECT/GIT.md` is present.
- **it("includes ARCHITECTURE.md")** — Assert `.pio/PROJECT/ARCHITECTURE.md` is present.
- **it("includes DEPENDENCIES.md")** — Assert `.pio/PROJECT/DEPENDENCIES.md` is present.
- **it("includes GLOSSARY.md")** — Assert `.pio/PROJECT/GLOSSARY.md` is present.
- **it("does not include the old PROJECT.md path")** — Assert `.pio/PROJECT.md` is NOT in the array.

#### `describe("CAPABILITY_CONFIG.defaultInitialMessage")`

- **it("returns a non-empty string")** — Call `defaultInitialMessage("/tmp/test")`, assert result is a non-empty string.
- **it("references multi-file structure (not single PROJECT.md)")** — Assert the returned string does NOT contain the exact phrase `PROJECT.md` as a standalone reference to a single file. Should instead mention `.pio/PROJECT/` directory or multiple files.

#### `describe("createProjectContextTool")`

- **it("has description referencing multi-file output")** — Assert `createProjectContextTool.description` does NOT contain `.pio/PROJECT.md`. Should reference the `.pio/PROJECT/` directory or mention multiple context files.
- **it("is named pio_create_project_context")** — Assert `createProjectContextTool.name === "pio_create_project_context"` (unchanged sanity check).

#### `describe("setupProjectContext")`

- **it("registers a command named pio-project-context")** — Call `setupProjectContext(mockApi)`, assert `mockApi.registerCommand` was called with `"pio-project-context"`.
- **it("command description references multi-file output")** — Assert the command registration's `description` does NOT contain `.pio/PROJECT.md`. Should reference `.pio/PROJECT/` directory or multiple files.

**Mock strategy:** For `setupProjectContext` tests, create a mock `ExtensionAPI` with spies on `registerTool` and `registerCommand`. Extract `setupProjectContext` for import — it's already exported.

## Integration Tests

### File: `src/capability-config.test.ts` (existing — verify no breakage)

**What:** Verify that `resolveCapabilityConfig` still resolves project-context correctly after the config changes. The existing test at line 379 checks that project-context has no `prepareSession` — this should remain true.

- **Existing test: "prepareSession is undefined when capability does not define it"** — Should continue to pass (project-context doesn't define prepareSession).
- **Verify:** Run `npm test` and confirm all existing capability-config tests pass.

**New test case to add:**

#### `describe("resolveCapabilityConfig — project-context writeAllowlist")`

- **it("resolves project-context with 7-file writeAllowlist")** — Call `resolveCapabilityConfig("/tmp/proj", { capability: "project-context" })`, assert `result.writeAllowlist` contains all 7 `.pio/PROJECT/*.md` paths.
- **it("project-context workingDir falls back to cwd")** — Same resolution, assert `result.workingDir === "/tmp/proj"` (no goalName for project-context).

## Programmatic Verification

- **What:** TypeScript compilation passes with no errors.
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no output about type errors.

- **What:** All existing tests continue to pass.
  - **How:** `npm test` (vitest)
  - **Expected result:** All tests pass, including the new project-context tests and all pre-existing capability-config tests.

- **What:** No stale reference to `.pio/PROJECT.md` in `project-context.ts`.
  - **How:** `grep -c "PROJECT.md" src/capabilities/project-context.ts | grep -v "PROJECT/"` (should find zero matches)
  - **Expected result:** No output or exit code indicating no matches.

## Test Order

1. Write `src/capabilities/project-context.test.ts` with unit tests for `CAPABILITY_CONFIG`, tool, and command descriptions.
2. Update `src/capability-config.test.ts` with the new project-context writeAllowlist test case.
3. Run `npm run check` (TypeScript).
4. Run `npm test` (full suite).
