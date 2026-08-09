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
3. Observe and report that exactly 3 iterations occur before advancing to phase \`terminate-when\`
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
    instructions: `This phase tests the restricted-by-default write gate model. With \`write: []\` (empty array), no outputs are allowed.

Follow these steps:
1. Attempt to write \`PLAYGROUND.md\` and observe it is blocked by the restricted-by-default model (the empty write array blocks known contract output paths)
2. Report the block message verbatim, including the exact rejection reason`,
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
  // Phase 5: Contract Output Restriction Test
  // ---------------------------------------------------------------------------
  {
    id: "contract-output-restriction",
    title: "Contract output restriction test",
    write: ["playground-output"],
    instructions: `This phase tests that only the contract output explicitly listed in \`write\` is writable — other contract outputs are blocked.

Follow these steps:
1. Attempt to write \`PLAYGROUND.md\` and observe it is allowed (because \`playground-output\` is in the allowlist for this phase), but then delete or overwrite it with a placeholder since the final report comes later
2. Report that \`PLAYGROUND.md\` is writable because its contract output name (\`playground-output\`) appears in this phase's \`write\` array`,
  },

  // ---------------------------------------------------------------------------
  // Phase 6: Variable Definition — Basic Test
  // instructions ignored — engine generates template from variables array
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
        type: "string",
        kind: "computed",
        compute: (state: PioSessionState) => state.currentPhaseId,
      },
    ],
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
  // Phase 8: terminateWhen AND Logic Test
  // ---------------------------------------------------------------------------
  {
    id: "terminate-when-and-test",
    title: "terminateWhen AND Logic Test",
    minIterations: 1,
    maxIterations: 4,
    loopMessage:
      "This phase is replaying because not all terminateWhen conditions are met. You need to satisfy both: write a random file to /tmp/ folder AND call ask_user.",
    terminateWhen: [
      {
        type: "callback",
        callback: (state: PioSessionState) => state.filesWritten.length > 0,
      },
      {
        type: "callback",
        callback: (state: PioSessionState) => state.askUserCalled === true,
      },
    ],
    instructions: `This phase tests terminateWhen AND logic — both callbacks must return true to advance. Satisfying only one triggers a replay.

Follow these steps:
1. **Iteration 1:** Do NOT write any file and do NOT call ask_user. Report "Iteration 1 — both conditions not met". Observe that the phase replays because neither condition is met
2. **Iteration 2:** Write a file (e.g., via the write tool to /tmp/terminate-and-test.txt) AND call ask_user with any question. Observe that after both actions, all termination conditions pass and the phase advances
3. Report the exact number of iterations and explain why: terminateWhen uses AND logic — both callbacks must return true to advance`,
  },

  // ---------------------------------------------------------------------------
  // Phase 9: Template Interpolation
  // ---------------------------------------------------------------------------
  {
    id: "template-interpolation",
    title: "Template Interpolation",
    instructions: `This phase tests template interpolation. The placeholders below reference variables set in phase \`var-basic-test\`.

Resolved values from \`var-basic-test\`:
- \`\${phase_label}\` — should resolve to the static var value
- \`\${llm_chosen_value}\` — should resolve to whatever you set via setVar in \`var-basic-test\`
- \`\${current_phase_num}\` — should resolve to the current phase ID from \`var-basic-test\`

Follow these steps:
1. Call \`listVars\` to see all current variables
2. Report the resolved values of the interpolated placeholders above (they appear directly in these instructions)
3. Confirm that static, LLM-driven, and computed vars all survive across phases and interpolate correctly`,
  },

  // ---------------------------------------------------------------------------
  // Phase 10: Validation Gate Replay
  // instructions ignored — engine generates template from variables array
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
        description:
          "On the first iteration, do NOT set this variable — report it as intentionally unset. On the second iteration (after seeing it listed as undefined in the follow-up message), set it using setVar with any short string value.",
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Phase 11: Consecutive Programmatic — First
  // Purely programmatic — no LLM vars, skipped by advancePhase
  // ---------------------------------------------------------------------------
  {
    id: "programmatic-chain-1",
    title: "Consecutive Programmatic — First",
    kind: "variable-definition",
    variables: [
      {
        name: "prog_a",
        type: "string",
        kind: "static",
        value: "phase-a-set",
      },
      {
        name: "prog_a_seq",
        type: "string",
        kind: "computed",
        compute: (state: PioSessionState) => state.currentPhaseId,
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Phase 12: Consecutive Programmatic — Second
  // Purely programmatic — no LLM vars, skipped by advancePhase
  // ---------------------------------------------------------------------------
  {
    id: "programmatic-chain-2",
    title: "Consecutive Programmatic — Second",
    kind: "variable-definition",
    variables: [
      {
        name: "prog_b",
        type: "string",
        kind: "static",
        value: "phase-b-set",
      },
      {
        name: "prog_b_seq",
        type: "string",
        kind: "computed",
        compute: (state: PioSessionState) => state.currentPhaseId,
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Phase 14: branch:if Test
  // ---------------------------------------------------------------------------
  {
    id: "branch-if-test",
    title: "Branch:if Test",
    kind: "branch:if",
    condition: (_: PioSessionState) => true,
    // biome-ignore lint/suspicious/noThenProperty: 'then' is the canonical field name from WorkflowPhase interface
    then: [
      {
        id: "branch-if-then-step-1",
        title: "Branch:if Then — Step 1",
        instructions: `This phase is inside the \`then\` arm of a \`branch:if\` phase. Your task:

1. Report "Entering branch:if then-arm step 1"
2. Write a file to \`/tmp/branch-then-executed.txt\` with content "branch:if then-arm executed — step 1" (this is used for verification in the post-branch phase)
3. Note that standard phases inside branch arms trigger agent turns and work normally`,
      },
      {
        id: "branch-if-then-step-2",
        title: "Branch:if Then — Step 2 (programmatic)",
        kind: "variable-definition",
        variables: [
          {
            name: "branch_if_then_2",
            type: "string",
            kind: "static",
            value: "executed",
          },
        ],
      },
    ],
    else: [
      {
        id: "branch-if-else-step",
        title: "Branch:if Else (should not run)",
        kind: "variable-definition",
        variables: [
          {
            name: "branch_if_taken",
            type: "string",
            kind: "static",
            value: "else",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Phase 15: branch:if Verification
  // ---------------------------------------------------------------------------
  {
    id: "branch-if-verify",
    title: "Branch:if Verification",
    instructions: `This phase verifies the \`branch:if\` test from phase \`branch-if-test\`.

Follow these steps:
1. Call \`listVars\` and confirm that \`branch_if_then_2\` is set to "executed" (proves arm child 2 ran)
2. Check that \`/tmp/branch-then-executed.txt\` exists and contains expected content (proves arm child 1 ran)
3. Confirm that \`branch_if_taken\` is NOT set (proves the else arm did not execute — condition was always true, then arm taken)
4. Report "Branch:if test PASSED" with details about which branch was taken and both arm children executed`,
  },

  // ---------------------------------------------------------------------------
  // Phase 16: branch:switch with callback on
  // ---------------------------------------------------------------------------
  {
    id: "branch-switch-callback",
    title: "Branch:switch Callback Test",
    kind: "branch:switch",
    on: (_: PioSessionState) => "approved",
    cases: {
      approved: [
        {
          id: "switch-callback-approved-arm",
          title: "Switch Callback — Approved",
          kind: "variable-definition",
          variables: [
            {
              name: "switch_callback_result",
              type: "string",
              kind: "static",
              value: "approved-matched",
            },
          ],
        },
      ],
      rejected: [
        {
          id: "switch-callback-rejected-arm",
          title: "Switch Callback — Rejected (should not run)",
          kind: "variable-definition",
          variables: [
            {
              name: "switch_callback_result",
              type: "string",
              kind: "static",
              value: "rejected-matched",
            },
          ],
        },
      ],
    },
    defaultBranch: [
      {
        id: "switch-callback-default-arm",
        title: "Switch Callback — Default (should not run)",
        kind: "variable-definition",
        variables: [
          {
            name: "switch_callback_result",
            type: "string",
            kind: "static",
            value: "default-matched",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Phase 17: branch:switch with $varName string form
  // ---------------------------------------------------------------------------
  {
    id: "branch-switch-varname",
    title: "Branch:switch $varName Test",
    kind: "branch:switch",
    on: "$llm_chosen_value",
    cases: {
      confirmed: [
        {
          id: "switch-varname-confirmed-arm",
          title: "Switch VarName — Confirmed",
          kind: "variable-definition",
          variables: [
            {
              name: "switch_varname_result",
              type: "string",
              kind: "static",
              value: "confirmed-matched",
            },
          ],
        },
      ],
      "default-choice": [
        {
          id: "switch-varname-default-arm",
          title: "Switch VarName — Other",
          kind: "variable-definition",
          variables: [
            {
              name: "switch_varname_result",
              type: "string",
              kind: "static",
              value: "default-choice-matched",
            },
          ],
        },
      ],
    },
    defaultBranch: [
      {
        id: "switch-varname-default-branch",
        title: "Switch VarName — Default fallback",
        kind: "variable-definition",
        variables: [
          {
            name: "switch_varname_result",
            type: "string",
            kind: "static",
            value: "default-branch-matched",
          },
        ],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Phase 18: branch:switch Verification
  // ---------------------------------------------------------------------------
  {
    id: "branch-switch-verify",
    title: "Branch:switch Verification",
    instructions: `This phase verifies the \`branch:switch\` tests from phases \`branch-switch-callback\` and \`branch-switch-varname\`.

Follow these steps:
1. Call \`listVars\` and confirm that \`switch_callback_result\` is set to "approved-matched" (proves the callback switch routed to the correct case — the \`on\` callback returned "approved")
2. Confirm that \`switch_varname_result\` is set to SOME value ending in "-matched" (proves the $varName switch resolved the variable and matched a case or defaultBranch). Report which specific arm matched
3. Explain why: \`branch-switch-callback\` used a callback \`on\` form (deterministic result), \`branch-switch-varname\` used the $varName string form (depends on what you set in \`var-basic-test\`)
4. Report "Branch:switch tests PASSED" with details about routing behavior`,
  },

  // ---------------------------------------------------------------------------
  // Phase 19: Final Report
  // ---------------------------------------------------------------------------
  {
    id: "final-report",
    title: "Final Report",
    write: ["playground-output"],
    instructions: `This is the final phase. Write a comprehensive test report in \`PLAYGROUND.md\` covering all phases (1–18).

Follow these steps:
1. Write \`PLAYGROUND.md\` with a section for each phase summarizing behavior observed
2. For phases \`var-basic-test\` through \`validation-gate-replay\` specifically, include: variable values, interpolation results, loopWhile replay observations, terminateWhen AND logic behavior, and computed callback results
3. Confirm that user-defined \`loopWhile\` uses OR logic (\`loopwhile-test\`) and \`terminateWhen\` uses AND logic (\`terminate-when-and-test\`) based on direct observations
4. **Programmatic chain verification (\`programmatic-chain-1\` and \`programmatic-chain-2\`):**
   a. Call \`listVars\` and confirm that \`prog_a\`, \`prog_a_seq\`, \`prog_b\`, and \`prog_b_seq\` are all set
   b. Verify static values: \`prog_a = "phase-a-set"\` and \`prog_b = "phase-b-set"\`
   c. Verify computed phase IDs: \`prog_a_seq\` should equal "programmatic-chain-1" (the currentPhaseId when \`programmatic-chain-1\`'s executePhase ran) and \`prog_b_seq\` should equal "programmatic-chain-2" (the currentPhaseId when \`programmatic-chain-2\` ran). These different values prove the computed callbacks ran during the advancePhase loop, not after — if they ran after, both would have the same value
   d. Confirm that you received instructions for \`validation-gate-replay\`'s turn and then directly this phase's turn — no LLM instructions were shown for \`programmatic-chain-1\` or \`programmatic-chain-2\`. This proves the advancePhase helper correctly skipped the purely programmatic phases without triggering agent turns
   e. Include a dedicated section in \`PLAYGROUND.md\` documenting this skip-through behavior and the verified variable values
5. **Conditional branching verification (\`branch-if-test\` through \`branch-switch-verify\`):**
   a. \`branch:if\` results: confirm \`branch_if_then_2 === "executed"\`, \`/tmp/branch-then-executed.txt\` exists, and the else arm did NOT execute (\`branch_if_taken\` is not set)
   b. \`branch:switch\` (callback form): confirm \`switch_callback_result === "approved-matched"\` — the callback \`on\` returned "approved" and routed correctly
   c. \`branch:switch\` ($varName form): confirm \`switch_varname_result\` is set to some "-matched" value — the variable was resolved and a case or defaultBranch matched
   d. Document branch routing observations: which paths were taken, how multi-phase arms executed sequentially (step-1 → step-2 inside then arm), and post-branch continuation behavior
6. Include any unexpected behaviors or discrepancies
7. This is the final phase — produce a complete, well-structured report in \`PLAYGROUND.md\` covering all 18 phases total`,
  },
] satisfies WorkflowPhase[];
