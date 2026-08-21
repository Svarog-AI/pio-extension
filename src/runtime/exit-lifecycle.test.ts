import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapState } from "../capability-state";
import type { TransitionResult } from "../state-machines";
import type { CapabilityConfig, CapabilityContract } from "../types";
import { runExitLifecycle } from "./exit-lifecycle";

// ---------------------------------------------------------------------------
// Module-level mocks — pin the four external collaborators; everything else
// (CapState, applyMarkers, fs, temp dirs) runs for real.
// ---------------------------------------------------------------------------

const mockValidateOutputs = vi.hoisted(() => vi.fn());
const mockDispatch = vi.hoisted(() => vi.fn());
const mockGetMachine = vi.hoisted(() => vi.fn());
const mockRecordTransition = vi.hoisted(() => vi.fn());
const mockEnqueueTask = vi.hoisted(() => vi.fn());

vi.mock("../guards/validation", () => ({
  validateOutputs: mockValidateOutputs,
}));

vi.mock("../state-machines", () => ({
  dispatch: mockDispatch,
  getMachine: mockGetMachine,
  recordTransition: mockRecordTransition,
}));

// Partial mock — only enqueueTask is spied. Mocking it is mandatory: the real
// one writes to process.cwd()/.pio/session-queue/, i.e. this repo.
vi.mock("../queues", async (importOriginal) => ({
  ...(await importOriginal()),
  enqueueTask: mockEnqueueTask,
}));

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SUCCESS_MESSAGE =
  "Validation passed. All expected outputs have been produced.";
const FAKE_MACHINE = { id: "pio-workflow" };

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-exit-lifecycle-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

/** Contract with a named output plus markers driving APPROVED/REJECTED. */
function makeContract(
  overrides: Partial<CapabilityContract> = {},
): CapabilityContract {
  return {
    inputs: [],
    outputs: [{ name: "review", file: "REVIEW.md" }],
    markers: [
      {
        outputFile: "review",
        field: "status",
        values: { approved: "APPROVED", rejected: "REJECTED" },
      },
    ],
    ...overrides,
  };
}

/** Config for a completing review-task session in a temp workspace. */
function makeConfig(
  tempDir: string,
  overrides: Partial<CapabilityConfig> = {},
): CapabilityConfig {
  return {
    capability: "review-task",
    workspaceDir: tempDir,
    sessionParams: {
      queueKey: "goals/test-goal",
      stateMachineId: "pio-workflow",
    },
    contract: makeContract(),
    allowProjectWrites: false,
    ...overrides,
  };
}

function makeNextTask(overrides?: Partial<TransitionResult>): TransitionResult {
  return {
    capability: "execute-task",
    stateMachineId: "pio-workflow",
    params: { stepNumber: 2, queueKey: "goals/test-goal/S02" },
    sessionName: "test-goal execute-task S02",
    additionalContext: "next context",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite setup — temp workspace with an approved REVIEW.md and a stale REJECTED
// marker so the real marker engine has work to do (create + stale sweep).
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMachine.mockReturnValue(FAKE_MACHINE);
  mockValidateOutputs.mockReturnValue({ success: true });
  mockDispatch.mockReturnValue([]);

  tempDir = createTempDir();
  fs.writeFileSync(
    path.join(tempDir, "REVIEW.md"),
    "---\nstatus: approved\n---\nreview body\n",
    "utf-8",
  );
  fs.writeFileSync(path.join(tempDir, "REJECTED"), "", "utf-8");
});

afterEach(() => {
  cleanup(tempDir);
});

// ---------------------------------------------------------------------------
// Success path — single transition
// ---------------------------------------------------------------------------

describe("success path (single transition)", () => {
  it("runs validate → dispatch → enqueue → record → markers → postExecute → fileCleanup in order", async () => {
    const nextTask = makeNextTask();
    mockDispatch.mockReturnValue([nextTask]);

    let capStateAtPostExecute: unknown;
    let markerExistsAtPostExecute = false;
    let postExecuteDone = false;
    const postExecute = vi.fn(async (_dir, _params, capState) => {
      capStateAtPostExecute = capState;
      markerExistsAtPostExecute = fs.existsSync(path.join(tempDir, "APPROVED"));
      // Macrotask delay: only observed if the lifecycle truly awaits the hook.
      await new Promise((resolve) => setTimeout(resolve, 5));
      postExecuteDone = true;
    });

    const cleanupTarget = path.join(tempDir, "scratch.tmp");
    fs.writeFileSync(cleanupTarget, "x", "utf-8");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const config = makeConfig(tempDir, {
      postExecute,
      fileCleanup: [cleanupTarget],
    });

    const result = await runExitLifecycle(config);

    // Step 1 — validateOutputs called once with a real CapState
    expect(mockValidateOutputs).toHaveBeenCalledTimes(1);
    const capStateArg = mockValidateOutputs.mock.calls[0][0];
    expect(capStateArg).toBeInstanceOf(CapState);

    // Step 3 — dispatch resolved via getMachine, called with capability name,
    // context object and the session's own params (identity preserved)
    expect(mockGetMachine).toHaveBeenCalledWith("pio-workflow");
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(
      FAKE_MACHINE,
      "review-task",
      { workspaceDir: tempDir },
      config.sessionParams,
    );

    // Step 3 — enqueueTask once; queueKey from adjustedParams wins (sub-case a)
    const enriched = {
      stepNumber: 2,
      queueKey: "goals/test-goal/S02",
      stateMachineId: "pio-workflow",
      sessionName: "test-goal execute-task S02",
      additionalContext: "next context",
      previousCapability: "review-task",
    };
    expect(mockEnqueueTask).toHaveBeenCalledTimes(1);
    expect(mockEnqueueTask).toHaveBeenCalledWith(
      process.cwd(),
      "goals/test-goal/S02",
      {
        capability: "execute-task",
        params: enriched,
      },
    );

    // Step 3 — recordTransition with the SAME enriched object (audit parity)
    expect(mockRecordTransition).toHaveBeenCalledTimes(1);
    const [recordDir, recordFrom, recordTo, recordParams] =
      mockRecordTransition.mock.calls[0];
    expect(recordDir).toBe(tempDir);
    expect(recordFrom).toBe("review-task");
    expect(recordTo).toBe(nextTask);
    expect(recordParams).toBe(mockEnqueueTask.mock.calls[0][2].params);

    // Step 4a — real marker engine ran BEFORE postExecute: APPROVED created,
    // stale REJECTED swept
    expect(markerExistsAtPostExecute).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "REJECTED"))).toBe(false);

    // Step 4b — postExecute called with (dir, sessionParams, same CapState)
    // and awaited before the lifecycle returns
    expect(postExecute).toHaveBeenCalledTimes(1);
    expect(postExecute).toHaveBeenCalledWith(
      tempDir,
      config.sessionParams,
      capStateArg,
    );
    expect(capStateAtPostExecute).toBe(capStateArg);
    expect(postExecuteDone).toBe(true);

    // Step 5 — fileCleanup target deleted on disk
    expect(fs.existsSync(cleanupTarget)).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      `pio: cleaned up file after validation: ${cleanupTarget}`,
    );

    expect(result).toEqual({
      success: true,
      message: SUCCESS_MESSAGE,
      notification:
        "Next task enqueued: execute-task. Use `/pio-next-task` to start the sub-session.",
    });

    logSpy.mockRestore();
  });

  it("falls back to the completing session's queueKey when adjustedParams has none", async () => {
    // Sub-case (b): nextTask without params — adjustedParams = {} so no
    // queueKey to take precedence over the completing session's key.
    mockDispatch.mockReturnValue([
      {
        capability: "execute-task",
        stateMachineId: "pio-workflow",
        sessionName: "test-goal execute-task S02",
        additionalContext: "next context",
      },
    ]);

    const result = await runExitLifecycle(makeConfig(tempDir));

    expect(mockEnqueueTask).toHaveBeenCalledTimes(1);
    expect(mockEnqueueTask).toHaveBeenCalledWith(
      process.cwd(),
      "goals/test-goal",
      {
        capability: "execute-task",
        params: {
          stateMachineId: "pio-workflow",
          sessionName: "test-goal execute-task S02",
          additionalContext: "next context",
          previousCapability: "review-task",
        },
      },
    );
    expect(result.success).toBe(true);
  });

  it("deletes resolver-declared cleanup[] input files", async () => {
    const contract = makeContract({
      inputs: [{ name: "task-spec", file: "TASK.md" }],
    });
    fs.writeFileSync(path.join(tempDir, "TASK.md"), "spec body", "utf-8");
    mockDispatch.mockReturnValue([makeNextTask({ cleanup: ["task-spec"] })]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runExitLifecycle(makeConfig(tempDir, { contract }));

    expect(fs.existsSync(path.join(tempDir, "TASK.md"))).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      `pio: cleaned up transition artifact: ${path.join(tempDir, "TASK.md")}`,
    );
    expect(result.success).toBe(true);

    logSpy.mockRestore();
  });

  it("warns and continues when a cleanup[] input name is not in the contract", async () => {
    mockDispatch.mockReturnValue([makeNextTask({ cleanup: ["ghost"] })]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await runExitLifecycle(makeConfig(tempDir));

    expect(warnSpy).toHaveBeenCalledWith(
      "pio: cleanup — input 'ghost' not found in capability \"review-task\" contract",
    );
    expect(result.success).toBe(true);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Validation failure — no side effects after Step 1
// ---------------------------------------------------------------------------

describe("validation failure", () => {
  it("returns the raw validation message with no side effects after step 1", async () => {
    mockValidateOutputs.mockReturnValue({
      success: false,
      message: "Output file 'missing.md' is missing",
    });
    const postExecute = vi.fn();
    const cleanupTarget = path.join(tempDir, "scratch.tmp");
    fs.writeFileSync(cleanupTarget, "x", "utf-8");

    const config = makeConfig(tempDir, {
      postExecute,
      fileCleanup: [cleanupTarget],
    });

    const result = await runExitLifecycle(config);

    expect(result).toEqual({
      success: false,
      message: "Output file 'missing.md' is missing",
    });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(mockRecordTransition).not.toHaveBeenCalled();
    expect(postExecute).not.toHaveBeenCalled();
    // No marker created, fileCleanup untouched
    expect(fs.existsSync(path.join(tempDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(cleanupTarget)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// postValidate failure
// ---------------------------------------------------------------------------

describe("postValidate failure", () => {
  it("returns the hook's message when postValidate fails", async () => {
    const postValidate = vi
      .fn()
      .mockReturnValue({ success: false, message: "Custom check failed" });
    const postExecute = vi.fn();
    const config = makeConfig(tempDir, { postValidate, postExecute });

    const result = await runExitLifecycle(config);

    expect(result).toEqual({ success: false, message: "Custom check failed" });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(mockRecordTransition).not.toHaveBeenCalled();
    expect(postExecute).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tempDir, "APPROVED"))).toBe(false);
  });

  it("falls back to the generic message when postValidate fails without one", async () => {
    const postValidate = vi.fn().mockReturnValue({ success: false });

    const result = await runExitLifecycle(
      makeConfig(tempDir, { postValidate }),
    );

    expect(result).toEqual({
      success: false,
      message: "Post-validation failed.",
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("returns the error text when postValidate throws", async () => {
    const postValidate = vi.fn().mockImplementation(() => {
      throw new Error("boom");
    });

    const result = await runExitLifecycle(
      makeConfig(tempDir, { postValidate }),
    );

    expect(result).toEqual({
      success: false,
      message: "Post-validation error: Error: boom",
    });
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tempDir, "APPROVED"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Multi-transition result — no enqueue, no throw, flow continues
// ---------------------------------------------------------------------------

describe("multi-transition result", () => {
  it("names both capabilities without enqueuing; markers still run", async () => {
    mockDispatch.mockReturnValue([
      makeNextTask({ capability: "execute-task" }),
      makeNextTask({ capability: "revise-plan" }),
    ]);

    const result = await runExitLifecycle(makeConfig(tempDir));

    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(mockRecordTransition).not.toHaveBeenCalled();
    // Markers still ran — verbatim flow continues past the branch
    expect(fs.existsSync(path.join(tempDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "REJECTED"))).toBe(false);
    expect(result).toEqual({
      success: true,
      message: SUCCESS_MESSAGE,
      notification:
        "Multiple transitions available: execute-task, revise-plan. Transition is not supported at the moment and will be reimplemented. Transition manually via tool call.",
    });
  });
});

// ---------------------------------------------------------------------------
// queueKey missing — guard sits before Step 1
// ---------------------------------------------------------------------------

describe("queueKey missing", () => {
  it("skips the transition with console.error; validation never runs", async () => {
    const postExecute = vi.fn();
    const cleanupTarget = path.join(tempDir, "scratch.tmp");
    fs.writeFileSync(cleanupTarget, "x", "utf-8");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runExitLifecycle(
      makeConfig(tempDir, {
        sessionParams: {},
        postExecute,
        fileCleanup: [cleanupTarget],
      }),
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "mark-complete: queueKey missing from session params — ensure enqueue provides it",
    );
    // Pins the guard's before-Step-1 position
    expect(mockValidateOutputs).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(postExecute).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(tempDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(cleanupTarget)).toBe(true);

    errorSpy.mockRestore();

    expect(result).toEqual({
      success: true,
      notification: "(skipped transition: queueKey missing)",
    });
    expect(result.message).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Zero transitions — terminal capability is a normal success
// ---------------------------------------------------------------------------

describe("zero transitions (terminal capability)", () => {
  it("succeeds with undefined notification; markers, postExecute and fileCleanup still run", async () => {
    mockDispatch.mockReturnValue([]);
    const postExecute = vi.fn();
    const cleanupTarget = path.join(tempDir, "scratch.tmp");
    fs.writeFileSync(cleanupTarget, "x", "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await runExitLifecycle(
      makeConfig(tempDir, { postExecute, fileCleanup: [cleanupTarget] }),
    );

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(mockRecordTransition).not.toHaveBeenCalled();
    // Tail of the lifecycle still ran
    expect(fs.existsSync(path.join(tempDir, "APPROVED"))).toBe(true);
    expect(postExecute).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(cleanupTarget)).toBe(false);

    logSpy.mockRestore();

    expect(result.success).toBe(true);
    expect(result.message).toBe(SUCCESS_MESSAGE);
    expect(result.notification).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Missing workspaceDir — first guard, no side effects
// ---------------------------------------------------------------------------

describe("missing workspaceDir", () => {
  it("fails with the verbatim tool-body message and no side effects", async () => {
    const postExecute = vi.fn();
    const cleanupTarget = path.join(tempDir, "scratch.tmp");
    fs.writeFileSync(cleanupTarget, "x", "utf-8");

    const config = makeConfig(tempDir, {
      workspaceDir: undefined,
      postExecute,
      fileCleanup: [cleanupTarget],
    });

    const result = await runExitLifecycle(config);

    expect(result).toEqual({
      success: false,
      message:
        "No directory is defined for this session. Something went wrong.",
    });
    expect(mockValidateOutputs).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
    expect(mockEnqueueTask).not.toHaveBeenCalled();
    expect(postExecute).not.toHaveBeenCalled();
    expect(fs.existsSync(cleanupTarget)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Enqueue failure — warn, continue, still success (recommended coverage)
// ---------------------------------------------------------------------------

describe("enqueue failure", () => {
  it("warns and continues to markers when enqueueTask throws", async () => {
    mockDispatch.mockReturnValue([makeNextTask()]);
    mockEnqueueTask.mockImplementation(() => {
      throw new Error("disk full");
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await runExitLifecycle(makeConfig(tempDir));

    expect(warnSpy).toHaveBeenCalledWith(
      "pio: failed to enqueue next task: Error: disk full",
    );
    // recordTransition sits after the throw inside the same try — not reached
    expect(mockRecordTransition).not.toHaveBeenCalled();
    // Flow continued past the catch: real marker engine ran
    expect(fs.existsSync(path.join(tempDir, "APPROVED"))).toBe(true);

    warnSpy.mockRestore();

    expect(result.success).toBe(true);
    expect(result.message).toBe(SUCCESS_MESSAGE);
    expect(result.notification).toBeUndefined();
  });
});
