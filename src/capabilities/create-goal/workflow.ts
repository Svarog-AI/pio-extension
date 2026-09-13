import type { PioSessionState } from "../../runtime/session-state";
import type { WorkflowPhase } from "../../runtime/workflow-types";

const AS_IS_CONFIRMED_VAR = "asIsConfirmed";
const TO_BE_CONFIRMED_VAR = "toBeConfirmed";
const PENDING_QUESTIONS_VAR = "pendingQuestions";
const CURRENT_QUESTION_VAR = "currentQuestion";

export default [
  {
    id: "load-project-files",
    title: "Load general project knowledge",
    instructions:
      "Read pio project files using the project-context skill to load them into your context.",
  },
  {
    id: "review-goal-request",
    title: "Revoew what the user needs",
    instructions: `User has described their goal in the additional context section of the session. Reason about it and ask any clarifying questions, without going deep into analyzing the current state of the project.`,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) => state.askUserCalled,
      },
    ],
  },
  {
    id: "analyze-current-project-state",
    title: "Analyze the current state of the project",
    kind: "loop",
    repeatWhile: (state: PioSessionState) => {
      const asIsConfirmed = state.store.get(AS_IS_CONFIRMED_VAR) as boolean;
      return !asIsConfirmed;
    },
    body: [
      {
        id: "analyze-and-load-project-files",
        title: "Analyze and load project files into context",
        minIterations: 2,
        instructions: `Focusing on what is relevant for the goal, analyze the project files and identify ones relevant to undersanding how to achieve the goal.`,
        loopMessage: `Review if there are gaps in your understanding of the AS-IS state of the project, and try to fill them in.`,
      },
      {
        id: "as-is-state-report",
        title: "Write the AS-IS report",
        write: ["as-is-report"],
        instructions: `Create or iterate on a report detailing the AS-IS state of the project. Ground every claim in the project files you actually read in this session — do not rely on memory or assumptions, and explicitly mark anything you could not verify against the code as unverified.

        Write it to the AS-IS-REPORT.md file in your workspace.

        The report must contain the following sections:
        1. Why these areas matter: a short overview focused on the goal — which parts of the AS-IS state matter for achieving it and which outcomes depend on them.
        2. An inventory of all components relevant to the current goal.
        3. A detailed breakdown of what each component does and why it is relevant for the goal, with code references in the form path/to/file.ext:line (or exported symbol name). Stay sharply focused on the goal — the rest of the project is out of scope.
        4. A Mermaid diagram (flowchart or class diagram) illustrating the relevant components and their relations. Do not use ASCII art.

        Before finishing, self-check: every component listed in section 2 appears in section 3 with at least one concrete code reference, and every one of them is present in the diagram.`,
      },
      {
        id: "confirm-as-is-with-user",
        title: "Confirm the AS-IS state understanding with the user",
        kind: "variable-definition",
        variables: [
          {
            name: AS_IS_CONFIRMED_VAR,
            kind: "llm",
            type: "boolean",
            description:
              "Use ask_user to confirm if the AS-IS state is correct. In the question, make sure to include the link to the draft file.",
          },
        ],
      },
      {
        id: "user-wants-changes",
        title: "If user wants changes",
        kind: "branch:if",
        condition: (state: PioSessionState) =>
          !state.store.get(AS_IS_CONFIRMED_VAR),
        // biome-ignore lint/suspicious/noThenProperty: 'then' is the canonical field name from WorkflowPhase interface
        then: [
          {
            id: "get-user-feedback",
            title: "Get user feedback about what needs to be changed",
            instructions:
              "Use ask_user to ask user for feedback until the user decides there is nothing more to give. 'Nothing else' should always be an option for the feedback.",
            loopWhile: [
              {
                type: "callback",
                callback: (state: PioSessionState) => state.askUserCalled,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "gather-knowledge",
    title: "Gather necessary knowledge relevant to the goal",
    kind: "loop",
    repeatWhile: (state: PioSessionState) => {
      if (!state.store.isDefined(PENDING_QUESTIONS_VAR)) {
        return true;
      }
      const questions = state.store.get(PENDING_QUESTIONS_VAR);
      return Array.isArray(questions) && questions.length > 0;
    },
    body: [
      {
        id: "generate-questions",
        title:
          "Generate open questions to resolve for understanding what needs to be done",
        kind: "variable-definition",
        variables: [
          {
            name: PENDING_QUESTIONS_VAR,
            type: "array",
            kind: "llm",
            description: `Think about the gaps in your understanding about the goal. Generate a list of open questions that you need to answer to get the full understanding. 

            If the variable exists, then append any new, follow-up questions to the end of the array.
            
            This includes:
            1. Libraries, frameworks, references and other dependencies - don't rely on your knowledge only, find evidence on the web.
            2. Architecture and organization questions.
            3. Potential design patterns that should be implemented.
            4. The end purpose of the goal - what are the outcomes that lie beyond just doing the work?
            5. The context in which the goal is being implemented.
            `,
          },
        ],
      },
      {
        id: "pop-next-question",
        title: "Pop the next question",
        kind: "code",
        run: (ctx) => {
          const questions = ctx.state.store.get(PENDING_QUESTIONS_VAR);
          if (!Array.isArray(questions) || questions.length === 0) return;
          const [next, ...rest] = questions;
          ctx.state.store.set(PENDING_QUESTIONS_VAR, "array", rest);
          // Stash the popped question for the following agent phases.
          ctx.state.store.set(CURRENT_QUESTION_VAR, "string", String(next));
        },
      },
      {
        id: "answer-question",
        title: "Answer the current question",
        instructions: `Find an answer to the following question: 
        
        \${${CURRENT_QUESTION_VAR}}
        
        Investigate the project, do web_search or ask_user if needed. But never answer just based on your knowledge without references.
        `,
      },
    ],
  },
  {
    id: "draft-to-be-state",
    title: "Draft the TO-BE project state",
    kind: "loop",
    repeatWhile: (state: PioSessionState) => {
      const toBeConfirmed = state.store.get(TO_BE_CONFIRMED_VAR) as boolean;
      return !toBeConfirmed;
    },
    body: [],
  },
  {
    id: "write-goal",
    title: "Write the GOAL.md output file",
    instructions: `Write \`GOAL.md\` into the goal workspace directory. The file must have the following sections:

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
] satisfies WorkflowPhase[];

// export default [
//   {
//     id: "understand-goal",
//     title: "Understand the goal",
//     instructions: `Derive the goal name from the initial message. Use it as the working name — do not ask the user to confirm it. Proceed immediately to understanding the goal's purpose, scope, and requirements.

// Ask open-ended but focused questions to understand:
// - What problem or opportunity does this goal address?
// - What area of the project does it touch (frontend, backend, config, docs)?
// - Is there any existing document, PRD, ticket, or spec that describes what should change?

// Keep this to 2-3 exchange rounds at most. You are gathering direction, not writing a requirements doc.`,
//   },
//   {
//     id: "light-research",
//     title: "Light research (only if needed)",
//     instructions: `Do minimal, targeted reading — just enough to describe the current state accurately in \`GOAL.md\`. Use your tools (\`read\`, \`bash\`) sparingly:

// 1. Read \`AGENTS.md\` if it exists — this is the project's entry point and explains structure.
// 2. If the user references specific files or areas, skim those files for context (file headers, exports, key functions).
// 3. Look up only what you need to make concrete claims in the "Current State" section.

// **Do not do deep research.** You are not auditing the codebase, tracing full dependency graphs, or performing comprehensive analysis. If the user hasn't mentioned a specific area, skip it. If reading a file raises more questions than it answers, move on — you can note the gap in \`GOAL.md\` instead. Limit yourself to reading 2-5 files at most unless the user asks for deeper investigation.`,
//   },
//   {
//     id: "probing-gate",
//     title: "Probing Gate",
//     instructions: `Before writing GOAL.md, verify the following four dimensions. Follow the \`grill-me\` skill for probing technique.

// - **Feasibility:** Can the described change actually work? Are there hidden dependencies or tooling gaps?
// - **Scope boundaries:** Is the stated scope complete, or are hard decisions deferred that will bite later?
// - **Constraints:** Auth, conventions, team patterns — anything that could block implementation?
// - **Downstream impact:** Who consumes this? What breaks if we get it wrong?

// If any dimension cannot be answered from research or user input, you **must ask before proceeding**. Unresolved gaps will be documented in the Open Assumptions section of GOAL.md.`,
//   },
//   {
//     id: "fill-gaps",
//     title: "Fill gaps with targeted questions",
//     instructions: `After researching, ask the user about anything still unclear:
// - Are there constraints (performance, backwards compatibility, specific patterns) you need to know?
// - Is there a target date or priority level?
// - Does the user have a specific design in mind, or should you propose one?
// - Are there edge cases or acceptance criteria the user wants explicitly included?

// Do not ask questions that your research already answered. Do not ask generic "anything else?" filler — only ask when there is a genuine gap that would make GOAL.md vague.`,
//   },
//   {
//     id: "checkout-branch",
//     title: "Checkout a dedicated branch",
//     instructions: `Before writing GOAL.md, checkout a dedicated branch for this goal. Follow the Branch Checkout Protocol from the pio-git skill. Pass the goal name as context so the skill can derive the branch name. If branching fails or is skipped, proceed on the current branch — do not block goal creation.`,
//     skills: { mandatory: ["pio-git"] },
//   },
//   {
//     id: "write-goal",
//     title: "Write GOAL.md",
//     write: ["goal"],
//     instructions: `When you have enough information, write \`GOAL.md\` into the goal workspace directory. The file must have the following sections, in this order (the fourth section is optional):

// \`\`\`markdown
// # <Goal Name>

// <Short summary in 1-3 sentences. What is this goal and what does achieving it look like?>

// ## Current State

// <Detailed description of how things work now, focused on the areas relevant to this goal.
// Include specific file references with paths that illustrate the current implementation.
// Be concrete — reference actual code patterns, architecture decisions, or configurations
// that exist today. Do not describe unrelated parts of the system.>

// ## To-Be State

// <Detailed description of how things will work when this goal is completed.
// Focus on what is different from the current state. Be specific about new behaviors,
// new files, changed patterns, or removed code. Include references to any external
// documents, PRDs, designs, or specifications that define the target state.
// If new files will be created, describe their purpose. If existing files change,
// reference them.>

// ## Open Assumptions

// <List assumptions that could not be confirmed during probing.
// E.g., "assumes X service is available at runtime", "assumes team follows Y naming convention".
// This section is optional — include only if probing revealed unconfirmed assumptions.
// Purpose: creates accountability so the planning agent sees gaps that need validation before designing steps.>
// \`\`\`

// **Quality bar:** A reader should understand exactly what needs to happen without asking follow-up questions. Avoid vague language like "improve", "optimize", or "refactor" without specifying what that means concretely. Claims about current state should be backed by files you read **or clearly attributed to the user's description** (e.g., "per user, the auth flow lives in \`src/auth/\`"). Every claim about the to-be state should be traceable to something the user said or a document you found.

// After writing and confirming, call \`pio_mark_complete\` to signal completion.`,
//   },
//   {
//     id: "signal-completion",
//     title: "Signal completion",
//     instructions: `When GOAL.md has been written and confirmed, call the \`pio_mark_complete\` tool to validate that all expected outputs have been produced. If validation reports missing files, produce them before calling again. Do not end your work without calling this tool.`,
//   },
// ] satisfies WorkflowPhase[];
