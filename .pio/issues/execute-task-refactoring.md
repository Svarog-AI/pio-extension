# Execute-task should take the refactoring step of TDD more seriously

The `execute-task` prompt describes a test-first workflow with **Step 4: Write tests first (Red phase)** and **Step 5: Implement the feature (Green phase)**, but **there is no explicit Refactor step**. The process jumps straight from "make it pass" to "run verification" — effectively skipping the third leg of the TDD cycle.

The prompt does mention the `test-driven-development` skill, which documents RED → GREEN → REFACTOR in full. However, without an explicit step in the execute-task process itself, agents routinely skip refactoring entirely since the immediate workflow doesn't call for it.

**Problems:**

1. **No explicit Refactor step:** After making tests green, the agent proceeds to verification (Step 6) and cross-referencing acceptance criteria (Step 7). There's no instruction to clean up the code while tests are still green.
2. **"Stay within scope" may discourage refactoring:** The guideline says "Do not refactor unrelated code, fix style issues in other files, or add 'while you're at it' improvements." While this prevents scope creep, without a dedicated refactor step it can also discourage cleaning up the *current* implementation — even though TDD expects refactoring of just-written code before moving on.
3. **Quality degradation over steps:** Without explicit refactoring, each step's implementation is left in its "first working" state — quick-and-dirty code that made tests pass but wasn't cleaned up for readability, maintainability, or alignment with project conventions.
4. **No test re-verification after cleanup:** TDD requires running tests *after* every refactor to confirm nothing broke. The current process doesn't instruct the agent to do this as part of the workflow.

**Proposed solution:**

Add a **Step 6: Refactor (before verification)** between Step 5 (Green) and Step 7 (Run all verification):

```
### Step 6: Refactor (with green tests as safety net)

With all tests passing, clean up the code you just wrote. This is where you improve quality without changing behavior:

1. **Review what you wrote** — read through every new or modified function/method/line from your Green-phase implementation.
2. **Improve naming** — do variable names, function names, and types clearly describe intent? Rename anything ambiguous.
3. **Extract shared logic** — did you duplicate code across test cases or feature branches? Extract helpers where it improves readability (DAMP over DRY in tests, but extract genuine duplication).
4. **Remove dead code** — temporary variables, commented-out blocks, unused imports, or debug logging from the implementation phase.
5. **Align with project conventions** — does the code match existing patterns for error handling, module structure, and architectural style? Fix inconsistencies in your changes.
6. **Run tests after each refactor step** — confirm nothing broke. A refactor that breaks a test isn't a refactor — it's a feature change.

**Rules:**
- Refactor only code *you* wrote or modified this session. Do not touch unrelated files.
- Behavior must not change. If a test fails, revert and understand why before proceeding.
- This is NOT the place for new features, scope expansion, or architectural redesigns — just cleanup.
```

Update subsequent step numbers accordingly (verification becomes Step 7, etc.).

**File references:**
- `src/prompts/execute-task.md` — Steps 4–8 (missing explicit Refactor step)
- `src/skills/test-driven-development/SKILL.md` — Documents RED → GREEN → REFACTOR cycle (referenced but not enforced by the prompt)

## Category

improvement
