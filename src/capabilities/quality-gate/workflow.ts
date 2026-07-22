import type { WorkflowPhase } from "../../runtime/workflow-types";

export default [
  {
    id: "read-requirements",
    title: "Read requirements file",
    instructions: `Read the requirements file whose path was provided in session params. The path is available as \`requirementsFile\` in the params.

This is a generic markdown file — treat it as context for what should be tested and reviewed. Understand:

- **Scope** — what features or changes are being evaluated
- **Expected outcomes** — what success looks like
- **Deliverables** — what was supposed to be produced

Use this understanding to construct the E2E testing checklist in a later step.`,
  },
  {
    id: "push-to-remote",
    title: "Push commits to remote",
    instructions: `Use the pio-git skill's **Push Protocol** to push any unpushed commits to the remote repository.

Follow the Push Protocol steps:
1. Verify git repository (\`git rev-parse --show-toplevel\`)
2. Check for unpushed commits (\`git cherry -v origin/<branch>\`)
3. Push if behind (\`git push origin <current-branch>\`)

**Graceful failure semantics:** If push fails (no remote, no auth, not a git repo), log a warning and proceed — never block workflow completion. The quality gate must still complete even if git operations are unavailable.`,
  },
  {
    id: "open-pr",
    title: "Open a pull request",
    instructions: `Follow the **PR Creation Protocol** from the pio-git skill. This creates a PR if none exists, or reports the URL of an existing open PR.

The protocol handles: verifying git repo, checking \`gh\` CLI availability, determining target branch, checking for existing PRs, pushing if needed, and creating the PR with title and body.

**PR body should be outcome-focused.** The pio-git skill's PR Creation Protocol (step 10) instructs the agent to construct an outcome-focused PR body — summarize what the changes do from a user or product perspective, not internal implementation details. Reinforce this: the PR body should answer "what does this change for the user?" in a short paragraph, not list plan steps or file changes.

**Graceful failure semantics:** If PR creation fails (no \`gh\` CLI, not authenticated, network failure), log a warning and proceed — never block workflow completion. The quality gate must still complete even if PR creation is unavailable.

\`\`\`yaml
skills:
  mandatory:
    - pio-git
\`\`\``,
    skills: {
      mandatory: ["pio-git"],
    },
  },
  {
    id: "manual-testing-gate",
    title: "Manual E2E testing gate",
    instructions: `Construct an E2E testing checklist focused on **end-user impact scenarios** — how the changes affect real users of the product.

**Use available context.** Draw from whatever context is available in your session (requirements file, instructions in the session preamble, etc.) to understand what was changed. Build scenarios answering:
- "Can the user still do X?"
- "Does the new feature work from their perspective?"

If you don't have enough information to create scenarios, or have contradictions and unresolved questions, get information from the user using the ask_user tool.

Do NOT reference specific delivery mechanisms or hardcode knowledge of how context arrives — the capability must stay generic.

**Prohibited from the E2E checklist:** Programmatic checks such as \`npx tsc\`, \`npm test\`, linting, type checking, or framework self-tests. These belong in CI/CD pipelines, not the manual testing gate.

**Good examples (user-facing behaviors):**
- "user can still authenticate after API migration"
- "button click opens the modal"
- "form submits and shows confirmation"

**Bad examples (build/internal checks):**
- "\`npx tsc --noEmit\` passes"
- "\`npm test\` passes with no regressions"
- "CSS lint clean"

Present the checklist to the user via \`ask_user\` with \`displayMode: "inline"\`. The question should list the checklist items and ask for explicit confirmation that all tests have passed.

Use structured options:
- **"All tests passed"** — user confirms everything works
- **"Tests failed"** — user reports issues

**Proceed only on explicit approval.** If the user rejects, cancels, or doesn't respond, skip ahead to writing QUALITY_GATE.md with status \`"rejected"\` — document which gate failed and any issues mentioned.

Example \`ask_user\` call:
\`\`\`ts
ask_user({
  question: "Please confirm all E2E tests have passed:",
  context: "1. User can still authenticate after API migration\\n2. New feature X works from user perspective\\n3. ...",
  options: ["All tests passed", "Tests failed"],
  displayMode: "inline",
  allowComment: true,
});
\`\`\``,
  },
  {
    id: "code-review-gate",
    title: "Code review gate",
    instructions: `Ask the user via \`ask_user\` (\`displayMode: "inline"\`): "Has the code review passed?"

Use structured options:
- **"Code review passed"** — user confirms review is done
- **"Code review has comments"** — user reports review issues
- **"Review not done yet"** — review is pending

If the user says the code review has comments, fetch PR review comments using \`gh pr comments\` (or \`gh pr reviews list\`) and surface them to the user for context. This helps the user understand what needs to be addressed.

**The capability does NOT auto-fix or auto-approve.** The user always makes the decision. If review has comments, note them and proceed to writing QUALITY_GATE.md with status \`"rejected"\` — document the specific issues from the PR comments.

If the user can't confirm review is done (no response, cancel), proceed with status \`"rejected"\` — document that the review gate was cancelled.

Example \`ask_user\` call:
\`\`\`ts
ask_user({
  question: "Has the code review passed?",
  options: ["Code review passed", "Code review has comments", "Review not done yet"],
  displayMode: "inline",
  allowComment: true,
});
\`\`\``,
  },
  {
    id: "write-quality-gate-report",
    title: "Write QUALITY_GATE.md",
    write: ["quality-gate-report"],
    instructions: `Write \`QUALITY_GATE.md\` at the workspace root. Start with a YAML frontmatter block at the very top of the file, before any markdown headings:

\`\`\`yaml
---
status: approved
---
\`\`\`

Use \`status: approved\` when both gates passed (testing confirmed + code review passed).
Use \`status: rejected\` when either gate failed or was cancelled.

After the frontmatter closing \`---\`, write the human-readable markdown body:

**For APPROVED:**
- Gates passed summary
- Testing summary (what was tested, any notes)
- Any reviewer notes or comments

**For REJECTED:**
- Which gate failed (testing, code review, or both)
- Specific issues from PR comments (if fetched)
- Recommended areas for rework

Structure:
\`\`\`markdown
---
status: approved | rejected
---
# Quality Gate Report

## Decision
APPROVED or REJECTED

## Testing Gate
<Results of the E2E testing gate — passed, failed, or cancelled>

## Code Review Gate
<Results of the code review gate — passed, comments fetched, or not done>

## Reviewer Comments
<PR review comments if fetched, or "N/A">

## Summary
<Brief summary of the quality gate outcome and next steps>
\`\`\``,
  },
  {
    id: "signal-completion",
    title: "Signal completion",
    instructions: `You only need to do one thing:

**Call \`pio_mark_complete\`.** This validates that QUALITY_GATE.md exists with proper frontmatter and signals the session is done. This must be the last step — \`pio_mark_complete\` terminates the session.`,
  },
] satisfies WorkflowPhase[];
