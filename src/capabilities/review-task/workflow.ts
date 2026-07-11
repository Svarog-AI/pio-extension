import type { WorkflowStep } from "../../capability-package";

export default [
  {
    id: "step-1",
    title: "Get project context",
    instructions: `Review the project context for background on this goal. Check \`.pio/PROJECT/OVERVIEW.md\` if available and any other project documentation.

Then review the plan file in the workspace to understand:

- What this step is supposed to deliver
- How it fits into the overall plan
- Dependencies on earlier steps`,
  },
  {
    id: "step-2",
    title: "Read `task`, `summary`, and the test record",
    instructions: `Read all files from the workspace:

- **\`task\` input** — the focused specification of what was built. Contains code components, approach decisions, files affected, and acceptance criteria.
- **The test record** — documenting what was tested during implementation. Contains "Given/when/then" test case summaries and programmatic verification commands.
- **\`summary\` input** — the changelog written by the implementation agent. Lists status (\`completed\`), files created/modified/deleted, decisions made, and test coverage notes.

**User-Requested Changes:** The \`summary\` input includes a **User-Requested Changes** section recording explicit user feedback during implementation (e.g., "can you also do X", "merge this file into another"). When present, treat these listed changes as explicit user-approved scope extensions. The reviewer should NOT flag files or behaviors introduced by these changes as unauthorized modifications (HIGH severity). Instead, verify they were applied correctly and note them in the review.

**Authority Hierarchy:** When resolving conflicts between specification sources, use this hierarchy from highest to lowest authority:

1. **User-Requested Changes** (the \`summary\` input) — user-approved scope extensions always take precedence
2. **Task** (the \`task\` input) and **Plan** (the plan file) — formal specification; TASK elaborates the plan
3. **Test Record** (the test record) — summary of what was tested during implementation; verifies the \`task\` input was covered
4. **Goal** (the requirements document) — high-level target outcome; superseded by everything above

When implementation follows a higher-authority source but deviates from a lower one, this is not an issue. Flag deviations only when they violate a source at its own authority level without justification from a higher source.`,
  },
  {
    id: "step-3",
    title: "Read implementation files",
    instructions: `Use the \`summary\` input's "Files Created" and "Files Modified" sections to locate every file touched during implementation. Read each one fully:

1. **New files** — verify the structure, interfaces, and exports match what the \`task\` input described.
2. **Modified files** — check that changes are localized, follow existing patterns, and don't introduce regressions.
3. Cross-reference: does every acceptance criterion from the \`task\` input have a corresponding change?`,
  },
  {
    id: "step-4",
    title: "Analyze the implementation",
    instructions: `Evaluate the implementation across these dimensions:

#### Test Coverage vs Requirements
- Does the test record's verification plan actually cover all acceptance criteria from the \`task\` input?
- Are there gaps where a criterion has no test or programmatic check?
- Were tests actually written (or are they only described in the test record)?
- Are there any missing tests that are important for the coverage?

#### Implementation Correctness
- Does the code actually implement what the \`task\` input specified?
- Are interfaces, types, and signatures correct?
- Do integration points (imports, exports, wiring) work as expected?
- Does the implementation follow best practices?
- Is the implementation unnecessarily complex? Is there a solution that's more readable?
- Are there bugs in the code?

#### Simplicity and Quality
- Is the implementation the simplest solution that satisfies requirements?
- Are there anti-patterns (over-engineering, unnecessary abstractions, dead code)?
- Does the code follow existing project conventions (naming, structure, patterns)?

#### Alignment Check
- **GOAL ↔ PLAN**: Does this step's plan item align with the overall goal?
- **PLAN ↔ TASK**: Does the task spec faithfully represent the plan step?
- **TASK ↔ TESTS**: Do tests cover all acceptance criteria?
- **TASK ↔ Implementation**: Does code match the task spec?
- **\`task\` input ↔ User-Requested Changes**: When the \`summary\` input's "User-Requested Changes" section lists changes, treat those as explicit scope extensions approved by the user. Do not flag files or behaviors introduced solely by user-requested changes as "accidental changes to unrelated files" (HIGH) or scope creep. Instead, verify correctness and document in the review.

**How the hierarchy resolves conflicts:** When you find a deviation from the \`task\` input or the plan file, check the \`summary\` input before flagging an issue. A deviation is justified if it appears in a source at a higher authority level.`,
  },
  {
    id: "step-5",
    title: "Categorize issues",
    instructions: `For each issue found, assign a severity level using the classification rules below. Be concrete — every issue must reference the exact file path and line(s) where the problem occurs.

#### CRITICAL — Mandatory REJECT

- **Fundamentally wrong implementation.** The code is broken, produces incorrect results, or fails to implement what the \`task\` input specified.
- **Test quality deviations.** Tests that fail to cover important behavior described in the \`task\` input's acceptance criteria. Good tests covering important behavior are mandatory.
- **Meaningless tests.** Tests that don't actually verify behavior: checking cosmetic properties, presence of text lines, trivial assertions that prove nothing.
- **Tests that don't make sense for the domain.** Tests that verify irrelevant properties or use incorrect assertions for the domain being tested.
- **Absence of tests covering important behavior.** When the task requires tests, their absence is critical. Good tests covering important behavior are mandatory.
- **Bugs and bad practices.** The code has bugs that may pass, but may have impact in the future.

#### HIGH — Mandatory REJECT

- **Code smells and unnecessary complexity.** Over-engineering, unnecessary abstractions, dead code (unused functions, unreachable branches), and overly complex implementations when simpler solutions satisfy the requirements.
- **Security risks.** Injection vulnerabilities, improper input validation, exposed credentials or secrets, unsafe deserialization, path traversal, and any other security risk you identify. Flag any security concern — the list above is illustrative, not exhaustive.
- **Accidental changes to unrelated files.** Modifications to files or behavior unrelated to the task scope as defined in the \`task\` input. Compare the \`summary\` input's "Files Modified" list against what the \`task\` input says should change. Flag any unauthorized modifications.

#### MEDIUM — Requires user confirmation

- **Design flaws and code duplication.** DRY violations, inappropriate abstractions (wrong abstraction choices, not over-engineering), coupling issues between modules, interface design problems.
- **Deviation from project conventions.** The implementation violates documented conventions in \`.pio/PROJECT/CONVENTIONS.md\` (naming, structure, patterns, coding standards). Compare the implementation against the conventions file and flag any departures.
- **Other quality concerns.** Missing edge cases, minor correctness issues, insufficient test coverage for non-critical paths.

#### LOW — At your discretion

- **Style improvements.** Naming suggestions, formatting, minor refactoring opportunities. Can be deferred to later.

#### Severity Classification Reference

| Pattern | Severity | Action |
|---------|----------|--------|
| Fundamentally wrong implementation | CRITICAL | REJECT |
| Test deviations from the test record | CRITICAL | REJECT |
| Meaningless or absent tests | CRITICAL | REJECT |
| Code smells / over-engineering | HIGH | REJECT |
| Security risks | HIGH | REJECT |
| Accidental scope changes | HIGH | REJECT |
| Design flaws / duplication | MEDIUM | ask_user |
| Deviation from project conventions | MEDIUM | ask_user |
| Style / naming improvements | LOW | At discretion |

#### Rules

- **Critical and high issues must never be ignored.** If any exist, the review is REJECTED. No exceptions.
- **Medium issues require mandatory user confirmation.** When medium-severity issues exist (and no critical or high issues exist), you **must** call \`ask_user\` to present your findings and get explicit REJECT or ACCEPT direction before writing \`REVIEW.md\`. You cannot unilaterally approve or reject on medium issues alone.
- **Low issues are at your discretion.** You may approve despite them if they don't affect correctness.
- **Be specific.** Every issue should reference the exact file path and line(s) where the problem occurs.

#### Before classifying: match every issue to the severity table

Before assigning severity labels, you **must** match every discovered issue to a specific entry in the severity classification reference table above. For each issue, write out the matching in this format:

\`\`\`
[issue description] → matches [exact severity category name] because [quote the matching bullet from the rules].
\`\`\`

This is a mandatory step — do not skip it. Complete this matching exercise for every issue you identify before proceeding to Step 6. Quoting the exact text from the classification rules forces you to look at the table instead of relying on intuition.

#### Prohibited downgrading language

When justifying severity, you are **prohibited** from using qualifying language that downgrades an issue's classification. The following words and phrases are banned in severity justifications:

- "minor"
- "harmless"
- "cosmetic"
- "small"
- "test-only"

If an issue matches a HIGH or CRITICAL bullet in the classification rules, it is that severity — period. The location of the code (production vs test files) and your perception of its impact size do not change the severity. Using these qualifying words to downgrade an issue's severity is a violation of the classification rules.

#### Common mistakes to avoid

1. **Dead code in test files is still HIGH, not LOW.** The dead code rules apply regardless of whether the file is a test file or production code. An unused function in a test file is still dead code — classify it as HIGH.
2. **Unused functions are never "style improvements."** An unused function matches the HIGH "dead code" category — it does not match LOW "style improvements." Do not reclassify dead code as a style suggestion.
3. **Severity does not change based on production vs test context.** The classification rules do not distinguish between production and test code. A bug is a bug regardless of file type. A correctness issue in a test file is the same severity as in a production file.`,
  },
  {
    id: "step-6",
    title: "Make the approval decision",
    instructions: `Based on your analysis and the severity rules from Step 5, follow this decision flow:

**First, check for external blockers (BLOCKED decision):** Before applying severity rules, determine whether the step has an external blocker that re-execution cannot resolve. Ask yourself: *can re-execution fix this?* If the answer is no, use **BLOCKED**. Examples of external blockers:
- A required dependency has not yet been built
- An external API or service is not ready
- An environmental constraint is outside pio's control

**The key distinction:** Can re-execution fix it? Yes → REJECT. No, because the blocker is external → BLOCK. When BLOCKED, the task specification must be adapted by evolve-plan — no amount of re-execution will resolve the issue.

**If no external blocker exists, proceed with severity-based decision:** Start by assuming this review is **REJECTED**. To change this to **APPROVED**, you must explicitly verify each condition below:

1. **No critical issues found.** Verify that zero CRITICAL issues were identified in Step 5.
2. **No high issues found.** Verify that zero HIGH issues were identified in Step 5.
3. **No medium issues found.** Verify that zero MEDIUM issues were identified in Step 5.

Only after confirming all three conditions above, write: **Therefore: APPROVED**.

**Mandatory REJECT:** If any **CRITICAL** or **HIGH** issues exist, the decision is **REJECTED**. This is mandatory — no discretion allowed. The following conditions also mandate REJECT:
- Acceptance criteria from the \`task\` input are not met
- Test coverage has significant gaps or tests deviate from the test record
- The implementation deviates substantially from the task spec

**Medium issues require \`ask_user\`:**
- When **MEDIUM** issues are the highest severity found (no critical or high), you **must** call \`ask_user\` before proceeding.
- Present your findings clearly: list the medium issues, explain their impact, and ask the user to explicitly REJECT or ACCEPT.
- Do not unilaterally approve or reject when medium issues are the highest severity. The user decides.
- After receiving the user's decision, proceed with the corresponding outcome.

**When in doubt, use \`ask_user\`** to ask the user for guidance before deciding.`,
  },
  {
    id: "step-7",
    title: "Write REVIEW.md with YAML frontmatter",
    instructions: `Write \`REVIEW.md\` in the workspace starting with a YAML frontmatter block at the very top of the file, before any markdown headings. The frontmatter provides structured outcome data for automation:

\`\`\`yaml
---
decision: APPROVED | REJECTED | BLOCKED
criticalIssues: <number>
highIssues: <number>
mediumIssues: <number>
lowIssues: <number>
---
\`\`\`

The frontmatter fields are:
- \`decision\` — one of \`APPROVED\`, \`REJECTED\`, or \`BLOCKED\`. This is the authoritative outcome used by automation to create marker files.
- \`criticalIssues\`, \`highIssues\`, \`mediumIssues\`, \`lowIssues\` — integer counts of issues found at each severity level during your analysis in Step 5.

After the frontmatter closing \`---\`, write the human-readable markdown body. The \`## Decision\` section must remain in the body for readability, and its value must match the \`decision\` field in the frontmatter (frontmatter for machines, body for humans). Full structure:

\`\`\`markdown
---
decision: APPROVED | REJECTED | BLOCKED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---
# Code Review: <Step Title> (Step N)

## Decision
APPROVED, REJECTED, or BLOCKED

## Summary
<Brief assessment of overall quality, 2-4 sentences>

## Critical Issues
- [CRITICAL] <description> — \`<file path>\` (line X)
- (none, if no critical issues)

## High Issues
- [HIGH] <description> — \`<file path>\` (line X)
- (none, if no high issues)

## Medium Issues
- [MEDIUM] <description> — \`<file path>\` (line X)
- (none, if no medium issues)

## Low Issues
- [LOW] <description> — \`<file path>\` (line X)
- (none, if no low issues)

## Test Coverage Analysis
<Are all acceptance criteria covered by tests? Any gaps?>

## Gaps Identified
<Discrepancies between GOAL ↔ PLAN ↔ TASK ↔ TESTS ↔ Implementation>

## Recommendations
<Suggestions for improvement on re-execution, if rejected. Omit or write "N/A" if approved.>

## Blocker Details
<Applicable only when BLOCKED: what is blocking, what was attempted, what is needed to unblock. Omit or write "N/A" otherwise.>
\`\`\`\`

**When \`decision\` is \`BLOCKED\`,** you must document in the Blocker Details section (not frontmatter):
- What external dependency or constraint is blocking the step
- What has been attempted so far
- What would be needed to unblock the step

This information is read by evolve-plan during spec revision — it is critical context for deciding whether to adapt the \`task\` input or trigger \`REVISE_PLAN_NEEDED.md\` at the workspace root.
\`\`\``,
  },
  {
    id: "step-8",
    title: "Signal completion — automation handles markers",
    instructions: `You only need to do two things:

1. **Write \`REVIEW.md\`** (completed in Step 7). Ensure the YAML frontmatter is at the very top of the file and the \`decision\` field matches your actual review outcome.
2. **Call \`pio_mark_complete\`.** This is your final step.`,
  },
] satisfies WorkflowStep[];
