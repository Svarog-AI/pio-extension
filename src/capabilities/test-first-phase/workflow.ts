import type { WorkflowPhase } from "../../runtime/workflow-types";

export default [
  {
    id: "first-phase-diagnostic",
    title: "First Phase Diagnostic",
    instructions: `This is a diagnostic sandbox phase with no minIterations configured. Your job is to observe and report what instructions you receive.

Follow these steps:
1. Report the phase ID ("first-phase-diagnostic") and whether you received explicit phase-specific instructions via CustomMessage or only generic system prompt context
2. Describe whether you saw directives like "You are on 'first-phase-diagnostic'..." or just default pi system prompt
3. Write your findings to FIRST_PHASE_RESULT.md with a clear verdict: CustomMessage was injected vs. only system prompt was available`,
    write: ["first-phase-result"],
  },
] satisfies WorkflowPhase[];
