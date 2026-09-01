import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";
import { advancePhase } from "../../runtime/loop-engine";
import { PhaseManager } from "../../runtime/phase-manager";
import { getState, resetState, setState } from "../../runtime/session-state";
import { SessionVariableStore } from "../../runtime/session-store";
import type {
  CodeStepContext,
  WorkflowPhase,
} from "../../runtime/workflow-types";
import config, { CONTRACT, register } from "./config";
import workflowPhases from "./workflow";

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

const mockEnqueueTask = vi.hoisted(() => vi.fn());

vi.mock("../../queues", () => ({
  enqueueTask: mockEnqueueTask,
  readPendingTask: vi.fn(),
  listPendingTasks: vi.fn(),
  queueDir: vi.fn().mockReturnValue("/mock/queue"),
}));

vi.mock("../../runtime/state-persistence", () => ({
  loadLoopEngineState: vi.fn().mockReturnValue(null),
  saveLoopEngineState: vi.fn(),
  // Mirror real behavior: create a new object with only persisted fields
  extractPersistedState: vi.fn(
    (s: {
      currentPhaseId: string;
      currentIteration: number;
      isAdHocInput: boolean;
    }) => ({
      currentPhaseId: s.currentPhaseId,
      currentIteration: s.currentIteration,
      isAdHocInput: s.isAdHocInput,
    }),
  ),
}));

import * as statePersistence from "../../runtime/state-persistence";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-playground-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTool() {
  const registeredTools: Array<any> = [];
  const mockPi = {
    registerTool: vi.fn((tool: any) => registeredTools.push(tool)),
    registerCommand: vi.fn(),
  };
  register(mockPi as any);
  return registeredTools[0];
}

function makeCtx(cwd: string) {
  return {
    cwd,
    ui: { notify: vi.fn() },
    hasUI: false,
    sessionManager: {
      getSessionFile: vi.fn(() => ""),
      getEntries: vi.fn(() => []),
    },
    modelRegistry: {},
    model: undefined,
    isIdle: vi.fn(() => true),
    signal: undefined,
    abort: vi.fn(),
    hasPendingMessages: vi.fn(() => false),
    shutdown: vi.fn(),
    getContextUsage: vi.fn(),
    compact: vi.fn(),
    getSystemPrompt: vi.fn(() => ""),
  };
}

// ---------------------------------------------------------------------------
// CONTRACT
// ---------------------------------------------------------------------------

describe("CONTRACT", () => {
  it("has empty inputs array", () => {
    expect(CONTRACT.inputs).toEqual([]);
  });

  it("has exactly one output with correct name and file", () => {
    expect(CONTRACT.outputs).toHaveLength(1);
    const output = CONTRACT.outputs[0];
    // Output is a MarkdownFileSpec (not a OneOfGroup or array)
    expect(Array.isArray(output)).toBe(false);
    expect(output).not.toHaveProperty("kind");
    expect((output as any).name).toBe("playground-output");
    expect((output as any).file).toBe("PLAYGROUND.md");
  });
});

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (default export)
// ---------------------------------------------------------------------------

describe("CapabilityPackageConfig (default export)", () => {
  it("has capability name workflow-playground", () => {
    expect(config.capability).toBe("workflow-playground");
  });

  it("references CONTRACT", () => {
    expect(config.contract).toBe(CONTRACT);
  });

  it("has writeAllowlist with PLAYGROUND.md", () => {
    expect(config.writeAllowlist).toEqual(["PLAYGROUND.md"]);
  });
});

// ---------------------------------------------------------------------------
// pio_launch_playground tool
// ---------------------------------------------------------------------------

describe("pio_launch_playground tool", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    mockEnqueueTask.mockClear();
  });

  afterEach(() => cleanup(tempDir));

  it("is registered with name pio_launch_playground", () => {
    const tool = getTool();
    expect(tool.name).toBe("pio_launch_playground");
  });

  it("creates directory and enqueues task without checking workspace existence", async () => {
    const tool = getTool();
    const result = await tool.execute(
      "test-id",
      { workspacePrefix: "goals/test-playground" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    // Assert: workspace was created
    expect(
      fs.existsSync(path.join(tempDir, ".pio", "goals", "test-playground")),
    ).toBe(true);

    // Assert: task was enqueued
    expect(mockEnqueueTask).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain("queued");
  });

  it("applies default workspacePrefix when not provided", async () => {
    const tool = getTool();
    // Call with no workspacePrefix — the execute body should fall back to "goals/test-playground"
    await tool.execute("test-id", {}, undefined, undefined, makeCtx(tempDir));

    // Assert: default workspace was created
    expect(
      fs.existsSync(path.join(tempDir, ".pio", "goals", "test-playground")),
    ).toBe(true);

    // Assert: task was enqueued with default prefix
    expect(mockEnqueueTask).toHaveBeenCalledTimes(1);
    expect(mockEnqueueTask).toHaveBeenCalledWith(
      tempDir,
      expect.any(String),
      expect.objectContaining({
        capability: "workflow-playground",
        params: expect.objectContaining({
          workspacePrefix: "goals/test-playground",
        }),
      }),
    );
  });

  it("does not check if workspace exists before creating", async () => {
    // Pre-create the workspace directory
    const workspaceDir = path.join(tempDir, ".pio", "goals", "test-playground");
    fs.mkdirSync(workspaceDir, { recursive: true });

    const tool = getTool();
    const result = await tool.execute(
      "test-id",
      { workspacePrefix: "goals/test-playground" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    // Assert: no collision error — playground always allows overwriting
    expect(result.content[0].text).not.toContain("ask_user");
    expect(result.content[0].text).not.toContain("already exists");

    // Assert: task was still enqueued
    expect(mockEnqueueTask).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Code-step coverage — structural presence
// ---------------------------------------------------------------------------

type CodePhase = Extract<
  (typeof workflowPhases)[number],
  { kind: "code"; run: (ctx: CodeStepContext) => void | Promise<void> }
>;

type LoopPhase = Extract<
  (typeof workflowPhases)[number],
  { kind: "loop"; body: WorkflowPhase[] }
>;

// The exported array is checked with `satisfies` (inferred literal-union
// element types). Passing that union where WorkflowPhase[] is expected trips
// TS union normalization on the two distinct branch:switch `cases` shapes —
// cast once at the boundary for engine/state consumption.
const phases = workflowPhases as WorkflowPhase[];

describe("code-step phases (structural presence)", () => {
  it('defines exactly three kind: "code" phases, each with a run function', () => {
    // Top-level phases plus loop-body phases — dowhile-cap-marker lives in
    // the dowhile-capped body, not at the top level
    const allPhases = phases.flatMap((p) => (p.body ? [p, ...p.body] : [p]));
    const codePhases = allPhases.filter(
      (p) => p.kind === "code" && typeof p.run === "function",
    );
    expect(codePhases).toHaveLength(3);
    const ids = codePhases.map((p) => p.id);
    expect(ids).toContain("code-step-set-var");
    expect(ids).toContain("code-step-fail");
    expect(ids).toContain("dowhile-cap-marker");
  });

  it("failing run throws the pinned message; set-var run is a no-op against a null store", async () => {
    const failPhase = workflowPhases.find(
      (p): p is CodePhase => p.id === "code-step-fail",
    );
    const setVarPhase = workflowPhases.find(
      (p): p is CodePhase => p.id === "code-step-set-var",
    );
    expect(failPhase).toBeDefined();
    expect(setVarPhase).toBeDefined();

    // Stub context — optional-chained store access makes both runs safe to invoke
    const stubCtx = { state: { store: null } } as unknown as CodeStepContext;

    // Throwing code step — assert the exact pinned message
    let caught: unknown;
    try {
      await failPhase!.run(stubCtx);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      "intentional playground failure: warn-and-continue",
    );

    // Non-throwing code step — does not throw against store: null
    let setVarThrew = false;
    try {
      await setVarPhase!.run(stubCtx);
    } catch {
      setVarThrew = true;
    }
    expect(setVarThrew).toBe(false);
  });

  it("capped-loop marker increments the pass counter against a real store", async () => {
    const cappedLoop = workflowPhases.find(
      (p): p is LoopPhase => p.id === "dowhile-capped",
    );
    expect(cappedLoop).toBeDefined();
    // The marker is a body phase of the capped loop, not a top-level phase
    const markerPhase = (cappedLoop!.body as WorkflowPhase[]).find(
      (
        p,
      ): p is WorkflowPhase & {
        run: (ctx: CodeStepContext) => void | Promise<void>;
      } => p.id === "dowhile-cap-marker" && p.kind === "code",
    );
    expect(markerPhase).toBeDefined();

    // No prior value — defaults to "0", increments to "1"
    const freshStore = new SessionVariableStore({});
    await markerPhase!.run({
      state: { store: freshStore },
    } as unknown as CodeStepContext);
    expect(freshStore.get("dowhile_cap_passes")).toBe("1");

    // Pre-seeded "2" — increments to "3"
    const seededStore = new SessionVariableStore({});
    seededStore.set("dowhile_cap_passes", "string", "2");
    await markerPhase!.run({
      state: { store: seededStore },
    } as unknown as CodeStepContext);
    expect(seededStore.get("dowhile_cap_passes")).toBe("3");
  });
});

// ---------------------------------------------------------------------------
// Do-while loop blocks — structural presence
// ---------------------------------------------------------------------------

describe("do-while loop blocks (structural presence)", () => {
  it("declares dowhile-var: var-toggled LLM-body loop with explicit cap", () => {
    const loop = workflowPhases.find(
      (p): p is LoopPhase => p.id === "dowhile-var",
    );
    expect(loop).toBeDefined();
    expect(loop!.kind).toBe("loop");
    expect(loop!.maxIterations).toBe(3);
    // A do-while loop container never receives an agent turn, so it carries
    // no instructions field (it would never be rendered).
    expect(loop!.instructions).toBeUndefined();
    expect(typeof loop!.repeatWhile).toBe("function");

    const body = loop!.body as WorkflowPhase[];
    expect(body).toHaveLength(2);

    // body[0] — variable-definition flip phase with exactly one llm var
    expect(body[0].id).toBe("dowhile-pass-a");
    expect(body[0].kind).toBe("variable-definition");
    expect(body[0].variables).toHaveLength(1);
    expect(body[0].variables![0].name).toBe("dowhile_pass_state");
    expect(body[0].variables![0].kind).toBe("llm");

    // body[1] — standard LLM observe phase
    expect(body[1].id).toBe("dowhile-pass-b");
    expect(body[1].kind).not.toBe("code");
    expect(typeof body[1].instructions).toBe("string");
  });

  it("declares dowhile-capped: all-programmatic body, always-true repeatWhile, explicit cap", () => {
    const loop = workflowPhases.find(
      (p): p is LoopPhase => p.id === "dowhile-capped",
    );
    expect(loop).toBeDefined();
    expect(loop!.kind).toBe("loop");
    expect(loop!.maxIterations).toBe(3);
    // A do-while loop container never receives an agent turn, so it carries
    // no instructions field (it would never be rendered).
    expect(loop!.instructions).toBeUndefined();
    expect(typeof loop!.repeatWhile).toBe("function");
    // Always-true repeat while — termination comes solely from the cap
    expect(loop!.repeatWhile!(getState())).toBe(true);

    const body = loop!.body as WorkflowPhase[];
    expect(body).toHaveLength(2);

    // body[0] — purely programmatic variable-definition (no llm vars)
    expect(body[0].id).toBe("dowhile-cap-count");
    expect(body[0].kind).toBe("variable-definition");
    const llmVars = (body[0].variables ?? []).filter((v) => v.kind === "llm");
    expect(llmVars).toHaveLength(0);

    // body[1] — real code phase (the pass counter)
    expect(body[1].id).toBe("dowhile-cap-marker");
    expect(body[1].kind).toBe("code");
    expect(typeof body[1].run).toBe("function");
  });

  it("declares dowhile-verify with non-empty instructions", () => {
    const verify = phases.find((p) => p.id === "dowhile-verify");
    expect(verify).toBeDefined();
    expect(typeof verify!.instructions).toBe("string");
    expect(verify!.instructions!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Code-step coverage — programmatic-log transfer traversal
// ---------------------------------------------------------------------------

describe("code-step traversal (programmatic-log transfer)", () => {
  beforeEach(() => {
    // resetState() resets ALL PioSessionState including loop engine fields
    resetState();
    vi.mocked(statePersistence.saveLoopEngineState).mockClear();
  });

  it("runs both code steps, transfers the log to the verify payload, and clears it on render", async () => {
    const store = new SessionVariableStore({});
    setState({
      isActive: true,
      sessionId: "playground-traversal-test",
      currentIteration: 1,
      totalPhases: phases.length,
      phasesList: phases,
      phaseManager: new PhaseManager(phases),
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
      currentPhaseId: "code-step-set-var",
    });

    // Spy immediately before the traversal — the intentional throw warns;
    // unmocked warnings would leak into suite output
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await advancePhase(store, "code-step-set-var", "reset");

    // 1. Traversal ran both code steps AND continued past the throw to the LLM phase
    expect(result.triggered).toBe(true);
    expect(getState().currentPhaseId).toBe("code-step-verify");

    // 2. Marker set through ctx.state.store survives the traversal
    expect(store.get("code_step_flag")).toBe("code-set");

    // 3. Log transferred — payload starts with the exact two-line section in execution order
    expect(
      result.payload?.content.startsWith(
        "## Programmatic activity since your last turn\n\n" +
          "• code-step-set-var (code)\n" +
          "• code-step-fail (code): intentional playground failure: warn-and-continue",
      ),
    ).toBe(true);

    // 4. Cleared on render — the log is empty exactly when the section rendered
    expect(getState().programmaticLog).toEqual([]);

    // 5. Exactly one warn containing the phase id and the pinned error text
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warned = warnSpy.mock.calls[0][0] as string;
    expect(warned).toContain("code-step-fail");
    expect(warned).toContain(
      "intentional playground failure: warn-and-continue",
    );

    // 6. Persist cadence — one per visited phase (3) + one per setupTurn (1)
    expect(
      vi.mocked(statePersistence.saveLoopEngineState),
    ).toHaveBeenCalledTimes(4);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Do-while capped loop — inline all-programmatic traversal
// ---------------------------------------------------------------------------

describe("dowhile-capped traversal (inline all-programmatic do-while)", () => {
  beforeEach(() => {
    // resetState() resets ALL PioSessionState including loop engine fields
    resetState();
    vi.mocked(statePersistence.saveLoopEngineState).mockClear();
  });

  it("runs exactly 3 full passes inline, stops at dowhile-verify, renders three marker bullets, and clears the log", async () => {
    const store = new SessionVariableStore({});
    setState({
      isActive: true,
      sessionId: "dowhile-capped-traversal-test",
      currentIteration: 1,
      totalPhases: phases.length,
      phasesList: phases,
      phaseManager: new PhaseManager(phases),
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      store,
      currentPhaseId: "dowhile-capped",
    });

    // Spy immediately before the traversal — unmocked warnings would leak
    // into suite output (the capped loop is expected to be silent)
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await advancePhase(store, "dowhile-capped", "reset");

    // 1. One call runs all three full passes inline (each visiting both body
    //    phases plus the synthetic loop-end node) and stops at the LLM phase
    expect(result.triggered).toBe(true);
    expect(getState().currentPhaseId).toBe("dowhile-verify");

    // 2. Counter phase ran exactly three times; static var re-set each pass
    expect(store.get("dowhile_cap_passes")).toBe("3");
    expect(store.get("dowhile_cap_ran")).toBe("yes");

    // 3. Counter contract pinned: repeats chosen so far = cap − 1 at cap exit
    expect(getState().loopPasses["dowhile-capped"]).toBe(2);

    // 4. Log transferred — exactly three marker bullets, no synthetic ids
    expect(
      result.payload?.content.startsWith(
        "## Programmatic activity since your last turn\n\n" +
          "• dowhile-cap-marker (code)\n" +
          "• dowhile-cap-marker (code)\n" +
          "• dowhile-cap-marker (code)",
      ),
    ).toBe(true);
    expect(result.payload?.content).not.toContain("__loop-end-");
    expect(result.payload?.content).not.toContain("__branch-end-");

    // 5. Cleared on render — the log is empty exactly when the section rendered
    expect(getState().programmaticLog).toEqual([]);

    warnSpy.mockRestore();
  });
});
