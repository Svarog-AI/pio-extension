# Fix Test Directory Structure

During TDD execution (`execute_task`), test files are not placed in directories that mirror the source file structure. For example, if source files live at `genai/models.py`, generated tests end up at incorrect paths like `api/models.py` instead of the expected convention (e.g., `tests/genai/test_models.py`). The fix enforces a proper convention so both TEST.md specification and actual test creation respect correct directory placement relative to source files.

## Current State

Two prompts are missing guidance on test file placement:

- **`src/prompts/evolve-plan.md`** — The Specification Writer prompt instructs agents to write `TEST.md` with test file paths (e.g., "**File:** Path to the test file to create"), but provides no convention for determining where that path should be. The agent picks arbitrary or incorrect directories.

- **`src/prompts/execute-task.md`** — The Execute Task Agent prompt instructs agents to "create test files" and "use the test runner appropriate for the project's ecosystem," but says nothing about which directory to place them in. The agent guesses paths or reuses source directories.

Neither prompt instructs the agent to:
1. Check `.pio/PROJECT.md` for documented test conventions (the project-context feature can surface this information)
2. Inspect existing test files in the target project to discover patterns (`tests/`, `__tests__/`, colocated `.test.ts`, etc.)
3. Ask the user if no convention can be determined from either source

As a result, test file paths in TEST.md are unreliable, and tests created during execution end up in wrong directories — breaking imports, test runner discovery, and project organization.

## To-Be State

Both `src/prompts/evolve-plan.md` and `src/prompts/execute-task.md` are updated to enforce a three-step convention for test file placement:

1. **Check `.pio/PROJECT.md` first** — if the project context documents a test directory convention, follow it (e.g., "tests mirror src under `tests/`", "colocated `.test.ts` alongside source", etc.)
2. **Inspect existing tests** — if PROJECT.md doesn't specify, scan the target project for existing test files to discover the pattern: look for `tests/`, `__tests__/`, `*.test.*`, `*_test.*` naming conventions and directory structure
3. **Ask the user** — if neither source reveals a convention, ask the user explicitly before creating tests

The **evolve-plan** prompt should instruct the Specification Writer to apply this convention when writing test file paths in TEST.md's "Unit Tests" and "Integration Tests" sections. The paths specified in TEST.md must reflect proper directory placement so the Execute Task Agent receives correct instructions.

The **execute-task** prompt should instruct the Execute Task Agent to follow the same convention when actually creating test files, ensuring alignment with what TEST.md specifies. If TEST.md already contains explicit paths (from evolve-plan), those should be respected unless they clearly violate the discovered convention.

Files affected:
- `src/prompts/evolve-plan.md` — add test placement guidance in Step 6 (Write TEST.md) and/or guidelines
- `src/prompts/execute-task.md` — add test placement guidance in Step 4 (Write tests first) and/or guidelines
