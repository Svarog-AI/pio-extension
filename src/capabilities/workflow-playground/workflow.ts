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
  // Phase 6: Write Allowlist Test (final report with blocked attempt first)
  // ---------------------------------------------------------------------------
  {
    id: "write-allowlist",
    title: "Write allowlist test — final report",
    write: ["playground-output"],
    instructions: `This is the final phase. Produce a comprehensive test report in \`PLAYGROUND.md\` summarizing all observations from Phases 1–5.

Follow these steps:
1. First, attempt to write a file that is NOT in the allowlist and NOT a contract output (e.g., \`not-allowed.md\`) — this should succeed because it's a non-contract file. If all files pass through for non-contract paths, report that the allowlist only blocks other contract outputs (there aren't any beyond playground-output in this capability)
2. Then write \`PLAYGROUND.md\` as a comprehensive test report summarizing all observations from Phases 1–5: which tests passed, which failed, and the exact error/block messages observed
3. Include a section for each phase with iteration counts, block/reject messages (verbatim), \`/tmp/\` test results, project file access results, and whether the behavior matched expectations
4. This is the final phase — produce a complete, well-structured report in \`PLAYGROUND.md\``,
  },
] satisfies WorkflowPhase[];
