import type { WorkflowStep } from "../../capability-package";

export default [
  {
    id: "understand-goal",
    title: "Understand the goal",
    instructions: `Derive the goal name from the initial message. Use it as the working name — do not ask the user to confirm it. Proceed immediately to understanding the goal's purpose, scope, and requirements.

Ask open-ended but focused questions to understand:
- What problem or opportunity does this goal address?
- What area of the project does it touch (frontend, backend, config, docs)?
- Is there any existing document, PRD, ticket, or spec that describes what should change?

Keep this to 2-3 exchange rounds at most. You are gathering direction, not writing a requirements doc.`,
  },
  {
    id: "light-research",
    title: "Light research (only if needed)",
    instructions: `Do minimal, targeted reading — just enough to describe the current state accurately in \`GOAL.md\`. Use your tools (\`read\`, \`bash\`) sparingly:

1. Read \`AGENTS.md\` if it exists — this is the project's entry point and explains structure.
2. If the user references specific files or areas, skim those files for context (file headers, exports, key functions).
3. Look up only what you need to make concrete claims in the "Current State" section.

**Do not do deep research.** You are not auditing the codebase, tracing full dependency graphs, or performing comprehensive analysis. If the user hasn't mentioned a specific area, skip it. If reading a file raises more questions than it answers, move on — you can note the gap in \`GOAL.md\` instead. Limit yourself to reading 2-5 files at most unless the user asks for deeper investigation.`,
  },
  {
    id: "probing-gate",
    title: "Probing Gate",
    instructions: `Before writing GOAL.md, verify the following four dimensions. Follow the \`grill-me\` skill for probing technique.

- **Feasibility:** Can the described change actually work? Are there hidden dependencies or tooling gaps?
- **Scope boundaries:** Is the stated scope complete, or are hard decisions deferred that will bite later?
- **Constraints:** Auth, conventions, team patterns — anything that could block implementation?
- **Downstream impact:** Who consumes this? What breaks if we get it wrong?

If any dimension cannot be answered from research or user input, you **must ask before proceeding**. Unresolved gaps will be documented in the Open Assumptions section of GOAL.md.`,
  },
  {
    id: "fill-gaps",
    title: "Fill gaps with targeted questions",
    instructions: `After researching, ask the user about anything still unclear:
- Are there constraints (performance, backwards compatibility, specific patterns) you need to know?
- Is there a target date or priority level?
- Does the user have a specific design in mind, or should you propose one?
- Are there edge cases or acceptance criteria the user wants explicitly included?

Do not ask questions that your research already answered. Do not ask generic "anything else?" filler — only ask when there is a genuine gap that would make GOAL.md vague.`,
  },
  {
    id: "checkout-branch",
    title: "Checkout a dedicated branch",
    instructions: `Before writing GOAL.md, checkout a dedicated branch for this goal. Follow the Branch Checkout Protocol from the pio-git skill. Pass the goal name as context so the skill can derive the branch name. If branching fails or is skipped, proceed on the current branch — do not block goal creation.`,
    skills: { mandatory: ["pio-git"] },
  },
  {
    id: "write-goal",
    title: "Write GOAL.md",
    instructions: `When you have enough information, write \`GOAL.md\` into the goal workspace directory. The file must have the following sections, in this order (the fourth section is optional):

\`\`\`markdown
# <Goal Name>

<Short summary in 1-3 sentences. What is this goal and what does achieving it look like?>

## Current State

<Detailed description of how things work now, focused on the areas relevant to this goal.
Include specific file references with paths that illustrate the current implementation.
Be concrete — reference actual code patterns, architecture decisions, or configurations
that exist today. Do not describe unrelated parts of the system.>

## To-Be State

<Detailed description of how things will work when this goal is completed.
Focus on what is different from the current state. Be specific about new behaviors,
new files, changed patterns, or removed code. Include references to any external
documents, PRDs, designs, or specifications that define the target state.
If new files will be created, describe their purpose. If existing files change,
reference them.>

## Open Assumptions

<List assumptions that could not be confirmed during probing.
E.g., "assumes X service is available at runtime", "assumes team follows Y naming convention".
This section is optional — include only if probing revealed unconfirmed assumptions.
Purpose: creates accountability so the planning agent sees gaps that need validation before designing steps.>
\`\`\`

**Quality bar:** A reader should understand exactly what needs to happen without asking follow-up questions. Avoid vague language like "improve", "optimize", or "refactor" without specifying what that means concretely. Claims about current state should be backed by files you read **or clearly attributed to the user's description** (e.g., "per user, the auth flow lives in \`src/auth/\`"). Every claim about the to-be state should be traceable to something the user said or a document you found.

After writing and confirming, call \`pio_mark_complete\` to signal completion.`,
  },
  {
    id: "signal-completion",
    title: "Signal completion",
    instructions: `When GOAL.md has been written and confirmed, call the \`pio_mark_complete\` tool to validate that all expected outputs have been produced. If validation reports missing files, produce them before calling again. Do not end your work without calling this tool.`,
  },
] satisfies WorkflowStep[];
