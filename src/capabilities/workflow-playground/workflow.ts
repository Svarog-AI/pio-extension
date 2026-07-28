import type { PioSessionState } from "../../runtime/session-state";
import type { WorkflowPhase } from "../../runtime/workflow-types";

export default [
  // ---------------------------------------------------------------------------
  // Phase 1: minIterations Default Behavior Test
  // ---------------------------------------------------------------------------
  {
    id: "min-iterations",
    title: "minIterations test",
    minIterations: 3,
    maxIterations: 5,
    loopMessage:
      "This phase is replaying. Report your iteration number and continue — you need to reach minIterations (3) before advancing.",
    instructions: `This phase tests the minIterations default behavior. Without terminateWhen defined, the loop engine will advance the phase once minIterations is reached and conditions default to "met".

Follow these steps:
1. Report your iteration number at the start of each run (e.g., "Iteration 1", "Iteration 2")
2. Do nothing special — just let the loop engine advance naturally
3. Observe and report that exactly 3 iterations occur before advancing to Phase 2
4. Explain why: without \`terminateWhen\`, conditions default to "met" once \`minIterations\` (3) is reached`,
  },

  // ---------------------------------------------------------------------------
  // Phase 2: terminateWhen Callback Test
  // ---------------------------------------------------------------------------
  {
    id: "terminate-when",
    title: "terminateWhen test",
    minIterations: 1,
    maxIterations: 4,
    loopMessage:
      "This phase is replaying because you did not call ask_user. On this iteration, call ask_user with any question to trigger the termination condition.",
    terminateWhen: [
      {
        type: "callback",
        callback: (state: PioSessionState) => state.askUserCalled === true,
      },
    ],
    instructions: `This phase tests the terminateWhen callback feature. The loop engine checks \`state.askUserCalled\` after each iteration — when you call \`ask_user\`, this flag becomes \`true\` and the phase advances.

Follow these steps:
1. On iteration 1: do NOT call \`ask_user\`. Report "Iteration 1 — skipping ask_user" and observe that the phase replays
2. On iteration 2: call \`ask_user\` with any question (e.g., asking yourself to confirm) and then answer it. Report "Iteration 2 — calling ask_user". Observe that after calling \`ask_user\`, the termination condition fires and the phase advances
3. Report the exact number of iterations before advancement and explain why: \`terminateWhen\` checks \`state.askUserCalled\`, which is set to \`true\` by the loop engine when \`ask_user\` is called`,
  },

  // ---------------------------------------------------------------------------
  // Phase 3: Restricted Writes (empty write array)
  // ---------------------------------------------------------------------------
  {
    id: "restricted-writes",
    title: "Restricted writes test",
    write: [],
    instructions: `This phase tests the restricted-by-default write gate model. With \`write: []\` (empty array), contract output paths are blocked, but non-contract files still pass through.

Follow these steps:
1. Attempt to write \`PLAYGROUND.md\` and observe it is blocked by the restricted-by-default model (the empty write array blocks known contract output paths)
2. Write a non-contract file (e.g., \`notes.md\`) with your observations so far from Phases 1–3, and observe that non-contract files still pass through
3. Report both outcomes verbatim, including the exact block message for the contract output`,
  },

  // ---------------------------------------------------------------------------
  // Phase 4: /tmp/ Writes Test
  // ---------------------------------------------------------------------------
  {
    id: "tmp-writes",
    title: "/tmp/ writes test",
    write: ["playground-output"],
    instructions: `This phase tests that \`/tmp/\` writes bypass all write gate restrictions. The loop engine explicitly skips write gating for any path starting with \`/tmp/\`.

Follow these steps:
1. Write a file to \`/tmp/\` (e.g., \`/tmp/playground-tmp-test.md\`) with some content and observe it succeeds — the \`/tmp/\` path is always allowed by the write gate regardless of \`write\` configuration
2. Report that \`/tmp/\` writes pass through freely, even though this phase has a populated write allowlist
3. Note why: the loop engine explicitly skips write gating for any path starting with \`/tmp/\``,
  },

  // ---------------------------------------------------------------------------
  // Phase 5: Project Files Allowed Test
  // ---------------------------------------------------------------------------
  {
    id: "project-files",
    title: "Project files allowed test",
    write: ["playground-output"],
    instructions: `This phase tests that non-contract project/workspace files always pass through the write gate, regardless of the \`write\` allowlist configuration.

Follow these steps:
1. Write a file in the workspace directory (e.g., \`workspace-test.md\` or a file under the \`.pio/goals/test-playground/\` path) and observe it succeeds — non-contract files always pass through regardless of write restrictions
2. Attempt to write \`PLAYGROUND.md\` and observe it is allowed (because \`playground-output\` is in the allowlist for this phase), but then delete or overwrite it with a placeholder since the final report comes later
3. Alternatively, if \`PLAYGROUND.md\` has already been created by an earlier phase, attempt to edit it and confirm it's allowed
4. Report outcomes: project file writes pass through freely; contract outputs in the allowlist are also writable
5. This demonstrates that the write gate only restricts specific contract output paths — all other files (including arbitrary workspace files) are always writable`,
  },

  // ---------------------------------------------------------------------------
  // Phase 6: Variable Definition — Basic Test
  // ---------------------------------------------------------------------------
  {
    id: "var-basic-test",
    title: "Variable Definition — Basic Test",
    kind: "variable-definition",
    minIterations: 1,
    maxIterations: 3,
    variables: [
      {
        name: "phase_label",
        type: "string",
        kind: "static",
        value: "Variable System Test",
      },
      {
        name: "llm_chosen_value",
        type: "string",
        kind: "llm",
        description:
          "Choose any short word (e.g. 'confirmed') and set it as the llm_chosen_value variable using setVar.",
      },
      {
        name: "current_phase_num",
        type: "number",
        kind: "computed",
        compute: (state: PioSessionState) => state.currentPhase,
      },
    ],
    instructions: `This phase tests the variable definition mechanism — static, LLM-driven, and computed variables.

Follow these steps:
1. Call \`listVars\` to see pre-set static variables (including \`phase_label\`) and the computed \`current_phase_num\`
2. Use \`setVar\` to set \`llm_chosen_value\` to any short word (e.g., "confirmed")
3. Call \`listVars\` again and report all variable values
4. The phase should advance after setting the LLM-driven var — the engine's auto-generated var completeness callback handles replay if you forget to set it`,
  },

  // ---------------------------------------------------------------------------
  // Phase 7: loopWhile Condition Test
  // ---------------------------------------------------------------------------
  {
    id: "loopwhile-test",
    title: "loopWhile Condition Test",
    minIterations: 1,
    maxIterations: 3,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          state.filesWritten.filter((f) => f.endsWith("loopwhile-test.txt"))
            .length === 0,
      },
    ],
    instructions: `This phase tests user-defined loopWhile conditions. The loop engine checks whether a file ending with \`loopwhile-test.txt\` was written — it keeps looping until the file exists.

Follow these steps:
1. On iteration 1: do NOT write the required file. Report "Iteration 1 — skipping file write" and observe the phase replays
2. On iteration 2: write \`/tmp/loopwhile-test.txt\` with any content. Observe that after writing the file, the loopWhile condition returns \`false\` (condition not met → no loop replay) and the phase advances
3. Report the exact number of iterations and explain why: \`loopWhile\` uses OR logic — when the callback returns \`false\`, the engine does not loop back`,
  },

  // ---------------------------------------------------------------------------
  // Phase 8: terminateWhen AND Logic Test (with variables)
  // ---------------------------------------------------------------------------
  {
    id: "terminate-when-and-test",
    title: "terminateWhen AND Logic Test",
    kind: "variable-definition",
    minIterations: 1,
    maxIterations: 4,
    variables: [
      {
        name: "terminate_flag",
        type: "boolean",
        kind: "llm",
        description:
          "Set this to true using setVar when you are ready to advance.",
      },
    ],
    terminateWhen: [
      {
        type: "callback",
        callback: (state: PioSessionState) => state.filesWritten.length > 0,
      },
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          state.store?.get("terminate_flag") === true,
      },
    ],
    instructions: `This phase tests terminateWhen AND logic. Two conditions must BOTH pass to advance: (1) a file was written during the phase, AND (2) the \`terminate_flag\` variable was set to true.

Follow these steps:
1. On iteration 1: write a file but do NOT set the variable. Observe the phase replays (only 1 of 2 conditions met)
2. On iteration 2: write another file AND call \`setVar\` with \`name: "terminate_flag"\`, \`type: "boolean"\`, \`value: true\`. Observe that both conditions now pass and the phase advances
3. Report the exact number of iterations and explain why: \`terminateWhen\` uses AND logic — all conditions must return \`true\` to advance`,
  },

  // ---------------------------------------------------------------------------
  // Phase 9: Template Interpolation
  // ---------------------------------------------------------------------------
  {
    id: "template-interpolation",
    title: "Template Interpolation",
    instructions: `This phase tests template interpolation. The placeholders below reference variables set in Phase 6.

Resolved values from Phase 6:
- \`\${phase_label}\` — should resolve to the static var value
- \`\${llm_chosen_value}\` — should resolve to whatever you set via setVar in Phase 6
- \`\${current_phase_num}\` — should resolve to the computed phase number from Phase 6

Follow these steps:
1. Call \`listVars\` to see all current variables
2. Report the resolved values of the interpolated placeholders above (they appear directly in these instructions)
3. Confirm that static, LLM-driven, and computed vars all survive across phases and interpolate correctly`,
  },

  // ---------------------------------------------------------------------------
  // Phase 10: Validation Gate Replay
  // ---------------------------------------------------------------------------
  {
    id: "validation-gate-replay",
    title: "Validation Gate Replay",
    kind: "variable-definition",
    minIterations: 1,
    maxIterations: 3,
    variables: [
      {
        name: "retry_var",
        type: "string",
        kind: "llm",
        description: "Set this variable using setVar with any short value.",
      },
    ],
    instructions: `This phase tests loopWhile validation replay. The engine will replay this phase if \`retry_var\` is not set.

Follow these steps:
1. On iteration 1: deliberately NOT call \`setVar\` for \`retry_var\`. Report that you're intentionally skipping it to observe the loop replay behavior.
2. Observe the follow-up message from the engine — it should list \`retry_var\` as an undefined variable in a table format (the "Undefined Variables" section)
3. On iteration 2: call \`setVar\` with \`name: "retry_var"\` and any string value
4. Report that the phase advanced after setting the variable, confirming \`loopWhile\` validation replay works`,
  },

  // ---------------------------------------------------------------------------
  // Phase 11: Final Report
  // ---------------------------------------------------------------------------
  {
    id: "final-report",
    title: "Final Report",
    write: ["playground-output"],
    instructions: `This is the final phase. Write a comprehensive test report in \`PLAYGROUND.md\` covering all phases (1–10).

Follow these steps:
1. Write \`PLAYGROUND.md\` with a section for each phase (1–10) summarizing behavior observed
2. For Phases 6–10 specifically, include: variable values, interpolation results, loopWhile replay observations, terminateWhen AND logic behavior, and computed callback results
3. Confirm that user-defined \`loopWhile\` uses OR logic (Phase 7) and \`terminateWhen\` uses AND logic (Phase 8) based on direct observations
4. Include any unexpected behaviors or discrepancies
5. This is the final phase — produce a complete, well-structured report in \`PLAYGROUND.md\``,
  },
] satisfies WorkflowPhase[];
