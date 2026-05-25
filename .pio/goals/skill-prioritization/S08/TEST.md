# Tests: StepStatus.taskSkills() and mergeCapabilitySkills

This verifies that `StepStatus.taskSkills()` reads TASK.md frontmatter skills via `TASK_FRONTMATTER_SCHEMA`, and that `mergeCapabilitySkills()` correctly merges base capability skills with per-step task skills.

## Unit Tests

### StepStatus.taskSkills()

Given TASK.md with valid skills frontmatter when taskSkills() is called then it returns the parsed TaskSkills object.
Given TASK.md with only mandatory skills when taskSkills() is called then it returns skills with mandatory array.
Given TASK.md with only recommended skills when taskSkills() is called then it returns skills with recommended array.
Given TASK.md with both mandatory and recommended skills when taskSkills() is called then it returns both fields.
Given TASK.md with no skills key in frontmatter when taskSkills() is called then it returns null.
Given TASK.md with empty frontmatter when taskSkills() is called then it returns null.
Given TASK.md does not exist when taskSkills() is called then it returns null.
Given TASK.md has malformed YAML when taskSkills() is called then it returns null.
Given TASK.md has invalid skills schema when taskSkills() is called then it returns null.
Given TASK.md is updated after first call when taskSkills() is called again then it reflects the new content (no caching).

### mergeCapabilitySkills()

Given base skills with mandatory and task skills with mandatory when mergeCapabilitySkills is called then mandatory arrays are concatenated and deduplicated.
Given base skills with recommended and task skills with recommended when mergeCapabilitySkills is called then recommended arrays are concatenated with first-seen-wins dedup by name.
Given base skills and null task skills when mergeCapabilitySkills is called then it returns base skills unchanged.
Given undefined base skills and valid task skills when mergeCapabilitySkills is called then it returns task skills.
Given empty base and empty task skills when mergeCapabilitySkills is called then it returns an empty object.

### execute-task prepareSession

Given execute-task CAPABILITY_CONFIG when prepareSession is inspected then it is defined as a function.
Given execute-task prepareSession with TASK.md skills when called via session-capability setter pattern then merged skills are set on the config.

### review-task prepareSession

Given review-task CAPABILITY_CONFIG when prepareSession is inspected then it is defined as a function.
Given review-task prepareSession with TASK.md skills when called via session-capability setter pattern then merged skills are set on the config.

## Programmatic Verification

Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the test suite when npm test is run then all tests pass with no regressions.
Given fs-utils.ts when grep for readTaskFrontmatterSkills is run then no matches are found.
Given fs-utils.ts when grep for mergeCapabilitySkills is run then a match is found.
