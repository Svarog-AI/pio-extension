# Tests: Iterative TDD prompt restructuring

Verifies that execute-task.md is restructured from a linear "plan all tests → write all tests → implement" workflow to an iterative tracer-bullet approach, that execute-task.ts defaultInitialMessage is simplified, and that review-task.md treats TEST.md as a test record rather than a design spec.

## Unit Tests

Given execute-task.md when scanned for "Step 4: Create TEST.md" then the heading is not present.
Given execute-task.md when scanned for the "Given ____ when ____ then ____" planning format as a pre-implementation requirement then it is not present.
Given execute-task.md when scanned for an iterative TDD step referencing the tdd skill then the reference is present.
Given execute-task.md when scanned for post-hoc TEST.md generation instruction then the instruction is present.
Given execute-task.md when scanned for tracer bullet mechanics or incremental loop rules then such HOW details are not present in the prompt.
Given execute-task.md step headings when collected then they are sequential with no gaps.
Given execute-task.md when scanned for the old "Test-first discipline" guideline then it is replaced with iterative TDD guidance referencing the tdd skill.
Given execute-task.ts defaultInitialMessage when invoked with a valid stepNumber then it returns a simple task directive without methodology instructions like "create TEST.md" or "write tests first".
Given review-task.md when scanned for "the test plan specifying exactly what must pass" then the phrase is not present.
Given review-task.md when scanned for TEST.md description then it references TEST.md as a test record or summary.
Given review-task.md authority hierarchy when scanned for TEST.md description then it no longer calls TEST.md a "formal specification and verification contract".

## Programmatic Verification

Given the TypeScript project when npm run check is run then it exits with code 0.
Given the test suite when npx vitest run is executed then it exits with code 0.
