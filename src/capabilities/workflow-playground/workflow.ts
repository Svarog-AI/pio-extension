import type { PioSessionState } from "../../runtime/session-state";
import type { WorkflowPhase } from "../../runtime/workflow-types";

export default [
  {
    id: "hey",
    title: "Hey Hey",
    instructions: `Just chill and write "Chilling!"`,
    minIterations: 1,
  },
  // ---------------------------------------------------------------------------
  // Phase 1: Edge Case — Pure Variable Phase (no LLM vars)
  // instructions ignored — engine generates template from variables array
  // Tests that a variable phase with ONLY static + computed vars (no llm kind)
  // completes and advances correctly. No setVar call needed from the agent.
  // ---------------------------------------------------------------------------
  {
    id: "edge-case-pure-var",
    title: "Edge Case — Pure Variable Phase",
    kind: "variable-definition",
    minIterations: 1,
    maxIterations: 2,
    variables: [
      {
        name: "pure_static_val",
        type: "string",
        kind: "static",
        value: "i-am-pure-static",
      },
      {
        name: "pure_computed_len",
        type: "number",
        kind: "computed",
        compute: (_state: PioSessionState) => "i-am-pure-static".length,
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Phase 2: Edge Case — Two Variable Phases Back-to-Back
  // instructions ignored — engine generates template from variables array
  // Follows immediately after Phase 1 (another variable-defining phase).
  // Tests that advancement from one var phase to another works:
  // Phase 1's agent_end triggers preparePhaseVariables(Phase 2) + followUp.
  // ---------------------------------------------------------------------------
  {
    id: "edge-case-var-chain",
    title: "Edge Case — Var Phase Chain",
    kind: "variable-definition",
    minIterations: 1,
    maxIterations: 2,
    variables: [
      {
        name: "chain_llm_val",
        type: "string",
        kind: "llm",
        description:
          "Set this to 'chain-link' using setVar. This phase follows another variable-defining phase (Phase 1).",
      },
      {
        name: "pure_static_check",
        type: "string",
        kind: "computed",
        compute: (state: PioSessionState) =>
          state.store?.get("pure_static_val") ?? "MISSING",
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Phase 3: Edge Case Verification
  // Verifies variables from Phases 1–2 survived and chained correctly.
  // ---------------------------------------------------------------------------
  {
    id: "edge-case-verify",
    title: "Edge Case Verification",
    instructions: `This phase verifies the edge case variable phases (1–2).

Resolved values:
- \`\${pure_static_val}\` — should be "i-am-pure-static" (static var from Phase 1)
- \`\${pure_computed_len}\` — should be 17 (computed len of the static string, Phase 1)
- \`\${chain_llm_val}\` — should be "chain-link" (llm var from Phase 2)
- \`\${pure_static_check}\` — should be "i-am-pure-static" (computed in Phase 2 reading Phase 1's static var)

Follow these steps:
1. Call \`listVars\` to see all current variables
2. Report whether each resolved value above matches expectations
3. Note: Phase 1 had NO llm-kind variables — only static + computed. Verify it still completed and advanced.
4. Note: Phase 2 followed immediately after Phase 1 (two var-defining phases back-to-back). Verify the chain worked — did preparePhaseVariables for Phase 2 fire correctly?`,
  },

  // ---------------------------------------------------------------------------
  // Phase 4: Final Report
  // ---------------------------------------------------------------------------
  {
    id: "final-report",
    title: "Final Report",
    write: ["playground-output"],
    instructions: `This is the final phase. Write a comprehensive test report in \`PLAYGROUND.md\` covering all phases (1–3).

Follow these steps:
1. Write \`PLAYGROUND.md\` with a section for each phase (1–3) summarizing behavior observed
2. Include a "Variable Definition Verification" section with a pass/fail table:
   - Phase 1: pure variable phase (static + computed only, no llm)
   - Phase 2: back-to-back variable phase chain
   - Phase 3: cross-phase variable verification
3. Include any unexpected behaviors or discrepancies
4. This is the final phase — produce a complete, well-structured report in \`PLAYGROUND.md\``,
  },
] satisfies WorkflowPhase[];
