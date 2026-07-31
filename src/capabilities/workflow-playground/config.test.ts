import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";
import config, { CONTRACT, register } from "./config";

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
// Workflow phases (Phases 6–11)
// ---------------------------------------------------------------------------

import workflowPhases from "./workflow";

describe("workflow phases", () => {
  it("contains exactly 11 phases", () => {
    expect(workflowPhases).toHaveLength(11);
  });

  // ---- Phase 6: Variable Definition — Basic Test ----

  describe("Phase 6: Variable Definition — Basic Test", () => {
    const phase = workflowPhases[5]; // 0-indexed

    it("has kind 'variable-definition'", () => {
      expect(phase.kind).toBe("variable-definition");
    });

    it("has exactly 3 variables with expected kinds", () => {
      expect(phase.variables).toHaveLength(3);
      const kinds = phase.variables!.map((v: any) => v.kind);
      expect(kinds).toContain("static");
      expect(kinds).toContain("llm");
      expect(kinds).toContain("computed");
    });

    it("has a static variable named 'phase_label'", () => {
      const staticVar = phase.variables!.find(
        (v: any) => v.name === "phase_label" && v.kind === "static",
      );
      expect(staticVar).toBeDefined();
      expect((staticVar as any).value).toBe("Variable System Test");
    });

    it("has an LLM-driven variable named 'llm_chosen_value'", () => {
      const llmVar = phase.variables!.find(
        (v: any) => v.name === "llm_chosen_value" && v.kind === "llm",
      );
      expect(llmVar).toBeDefined();
      expect((llmVar as any).description).toBeDefined();
    });

    it("has a computed variable named 'current_phase_num' with a callback", () => {
      const computedVar = phase.variables!.find(
        (v: any) => v.name === "current_phase_num" && v.kind === "computed",
      );
      expect(computedVar).toBeDefined();
      expect(typeof (computedVar as any).compute).toBe("function");
    });

    it("does not have user-defined loopWhile or terminateWhen", () => {
      expect(phase.loopWhile).toBeUndefined();
      expect(phase.terminateWhen).toBeUndefined();
    });
  });

  // ---- Phase 7: loopWhile Condition Test ----

  describe("Phase 7: loopWhile Condition Test", () => {
    const phase = workflowPhases[6];

    it("has user-defined loopWhile", () => {
      expect(phase.loopWhile).toBeDefined();
      expect(phase.loopWhile!.length).toBeGreaterThan(0);
    });

    it("loopWhile callback checks for file write", () => {
      const callback = phase.loopWhile![0].callback;
      expect(typeof callback).toBe("function");
    });

    it("does not have variables (not a variable-defining phase)", () => {
      expect(phase.variables).toBeUndefined();
    });
  });

  // ---- Phase 8: terminateWhen AND Logic Test ----

  describe("Phase 8: terminateWhen AND Logic Test", () => {
    const phase = workflowPhases[7];

    it("has no kind or variables fields", () => {
      expect(phase.kind).toBeUndefined();
      expect(phase.variables).toBeUndefined();
    });

    it("has terminateWhen with 2 conditions", () => {
      expect(phase.terminateWhen).toHaveLength(2);
    });

    it("first terminateWhen condition checks filesWritten", () => {
      const callback = phase.terminateWhen![0].callback;
      expect(typeof callback).toBe("function");
    });

    it("second terminateWhen condition checks askUserCalled", () => {
      const callback = phase.terminateWhen![1].callback;
      expect(typeof callback).toBe("function");
    });

    it("has custom instructions with iteration-specific guidance", () => {
      expect(phase.instructions).toBeDefined();
      expect(phase.instructions).toContain("Iteration 1");
      expect(phase.instructions).toContain("Iteration 2");
    });

    it("has a loopMessage field", () => {
      expect(phase.loopMessage).toBeDefined();
      expect(typeof phase.loopMessage).toBe("string");
      expect(phase.loopMessage!.toLowerCase()).toContain("file");
      expect(phase.loopMessage!.toLowerCase()).toContain("ask_user");
    });
  });

  // ---- Phase 9: Template Interpolation ----

  describe("Phase 9: Template Interpolation", () => {
    const phase = workflowPhases[8];

    it("instructions contain dollar-brace phase_label placeholder", () => {
      expect(phase.instructions).toContain(`${"$"}{phase_label}`);
    });

    it("instructions contain dollar-brace llm_chosen_value placeholder", () => {
      expect(phase.instructions).toContain(`${"$"}{llm_chosen_value}`);
    });

    it("instructions contain dollar-brace current_phase_num placeholder", () => {
      expect(phase.instructions).toContain(`${"$"}{current_phase_num}`);
    });
  });

  // ---- Phase 10: Validation Gate Replay ----

  describe("Phase 10: Validation Gate Replay", () => {
    const phase = workflowPhases[9];

    it("has kind 'variable-definition'", () => {
      expect(phase.kind).toBe("variable-definition");
    });

    it("declares an LLM-driven variable named 'retry_var'", () => {
      const retryVar = phase.variables!.find(
        (v: any) => v.name === "retry_var" && v.kind === "llm",
      );
      expect(retryVar).toBeDefined();
    });

    it("retry_var description contains iteration-aware instructions", () => {
      const retryVar = phase.variables!.find(
        (v: any) => v.name === "retry_var" && v.kind === "llm",
      );
      const desc = (retryVar as any).description;
      expect(desc).toBeDefined();
      expect(desc.toLowerCase()).toContain("first iteration");
      expect(desc.toLowerCase()).toContain("second iteration");
    });
  });

  // ---- Phase 11: Final Report ----

  describe("Phase 11: Final Report", () => {
    const phase = workflowPhases[10];

    it("has write: ['playground-output']", () => {
      expect(phase.write).toEqual(["playground-output"]);
    });

    it("instructions mention writing PLAYGROUND.md", () => {
      expect(phase.instructions).toContain("PLAYGROUND.md");
    });
  });
});
