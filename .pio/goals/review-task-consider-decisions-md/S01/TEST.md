# Tests: DECISIONS.md support in review-task

Verifies that `resolveReviewReadOnlyFiles()` includes `DECISIONS.md` unconditionally for all step numbers, and that the `review-task.md` prompt contains instructions about `DECISIONS.md`, user-requested changes, and the authority hierarchy.

## Unit Tests

Given stepNumber 1 when resolveReviewReadOnlyFiles is called then DECISIONS.md appears in the returned readOnlyFiles array.
Given stepNumber 2 when resolveReviewReadOnlyFiles is called then DECISIONS.md appears in the returned readOnlyFiles array.
Given stepNumber 5 when resolveReviewReadOnlyFiles is called then DECISIONS.md appears with the correct zero-padded folder name S05.

## Programmatic Verification

Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given src/prompts/review-task.md Step 2 when searched for DECISIONS.md instructions then it contains guidance about reading DECISIONS.md for Step 2+.
Given src/prompts/review-task.md Step 2 when searched for user-requested changes instructions then it contains guidance about treating User-Requested Changes as approved scope extensions.
Given src/prompts/review-task.md when searched for authority hierarchy then it lists User-Requested Changes > Decisions > Plan/Task/Test > Goal.
Given src/prompts/review-task.md alignment check section when searched for new dimensions then it includes TASK ↔ DECISIONS and TASK ↔ User-Requested Changes.
