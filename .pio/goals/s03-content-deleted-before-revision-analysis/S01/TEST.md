# Tests: Defer step folder cleanup from prepareSession to postExecute

This verifies that `prepareSession()` preserves all step folders (only archives PLAN.md), and that `cleanupIncompleteSteps()` deletes non-APPROVED folders when called as `postExecute`.

## Unit Tests

### prepareSession — folder preservation

Given non-APPROVED step folders when prepareSession is called then the folders are still present on disk.
Given APPROVED step folders when prepareSession is called then the folders remain present with APPROVED markers intact.
Given multiple non-APPROVED step folders when prepareSession is called then all non-APPROVED folders are preserved.
Given a goal with all steps APPROVED when prepareSession is called then all folders remain present.

### prepareSession — marker preservation

Given a REVISE_PLAN_NEEDED marker in a step folder when prepareSession is called with revisionTriggerStep then the marker is still present after prepareSession.
Given a REVISE_PLAN_NEEDED marker without revisionTriggerStep param when prepareSession is called then the folder and marker are preserved.

### CAPABILITY_CONFIG — postExecute wiring

Given CAPABILITY_CONFIG when postExecute is accessed then it is defined and references cleanupIncompleteSteps.

### cleanupIncompleteSteps — disk scanning and deletion

Given mixed APPROVED and non-APPROVED S{NN}/ folders on disk when cleanupIncompleteSteps is called then only non-APPROVED folders are deleted.
Given all APPROVED S{NN}/ folders when cleanupIncompleteSteps is called then all folders are preserved.
Given no S{NN}/ folders on disk when cleanupIncompleteSteps is called then no error is thrown.
Given all non-APPROVED S{NN}/ folders when cleanupIncompleteSteps is called then all folders are deleted.
Given S{NN}/ folders on disk that differ from PLAN.md frontmatter when cleanupIncompleteSteps is called then disk-scanned folders are processed regardless of PLAN.md content.

### cleanupIncompleteSteps — marker cleanup

Given an APPROVED step folder with REVISE_PLAN_NEEDED and matching revisionTriggerStep when cleanupIncompleteSteps is called then the marker is removed but the APPROVED folder remains.
Given a revisionTriggerStep pointing to a non-existent folder when cleanupIncompleteSteps is called then no error is thrown.

### End-to-end lifecycle

Given a goal with mixed step states when prepareSession followed by cleanupIncompleteSteps is called then PLAN.md is archived, all step folders exist after prepareSession, and only APPROVED folders remain after cleanupIncompleteSteps.

## Programmatic Verification

Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the revise-plan test file when npx vitest run src/capabilities/revise-plan.test.ts is executed then all tests pass.
