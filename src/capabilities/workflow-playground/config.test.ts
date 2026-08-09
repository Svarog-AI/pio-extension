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
// Workflow phases (Phases 6–13)
// ---------------------------------------------------------------------------

import workflowPhases from "./workflow";

describe("workflow phases", () => {
  it("contains exactly 18 phases", () => {
    expect(workflowPhases).toHaveLength(18);
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

  // ---- Phase 11: Consecutive Programmatic — First ----

  describe("Phase 11: Consecutive Programmatic — First", () => {
    const phase = workflowPhases[10];

    it("has id 'programmatic-chain-1'", () => {
      expect(phase.id).toBe("programmatic-chain-1");
    });

    it("has kind 'variable-definition'", () => {
      expect(phase.kind).toBe("variable-definition");
    });

    it("has exactly 2 variables: static 'prog_a' and computed 'prog_a_seq'", () => {
      expect(phase.variables).toHaveLength(2);
      const staticVar = phase.variables!.find(
        (v: any) => v.name === "prog_a" && v.kind === "static",
      );
      expect(staticVar).toBeDefined();
      expect((staticVar as any).value).toBe("phase-a-set");
      const computedVar = phase.variables!.find(
        (v: any) => v.name === "prog_a_seq" && v.kind === "computed",
      );
      expect(computedVar).toBeDefined();
      expect(typeof (computedVar as any).compute).toBe("function");
    });

    it("has no LLM-driven variables (is programmatic)", () => {
      const llmVars = phase.variables!.filter((v: any) => v.kind === "llm");
      expect(llmVars).toHaveLength(0);
    });
  });

  // ---- Phase 12: Consecutive Programmatic — Second ----

  describe("Phase 12: Consecutive Programmatic — Second", () => {
    const phase = workflowPhases[11];

    it("has id 'programmatic-chain-2'", () => {
      expect(phase.id).toBe("programmatic-chain-2");
    });

    it("has kind 'variable-definition'", () => {
      expect(phase.kind).toBe("variable-definition");
    });

    it("has exactly 2 variables: static 'prog_b' and computed 'prog_b_seq'", () => {
      expect(phase.variables).toHaveLength(2);
      const staticVar = phase.variables!.find(
        (v: any) => v.name === "prog_b" && v.kind === "static",
      );
      expect(staticVar).toBeDefined();
      expect((staticVar as any).value).toBe("phase-b-set");
      const computedVar = phase.variables!.find(
        (v: any) => v.name === "prog_b_seq" && v.kind === "computed",
      );
      expect(computedVar).toBeDefined();
      expect(typeof (computedVar as any).compute).toBe("function");
    });

    it("has no LLM-driven variables (is programmatic)", () => {
      const llmVars = phase.variables!.filter((v: any) => v.kind === "llm");
      expect(llmVars).toHaveLength(0);
    });
  });

  // ---- Phase 14: branch:if Test ----

  describe("Phase 14: branch:if Test", () => {
    const phase = workflowPhases[12];

    it("has id 'branch-if-test'", () => {
      expect(phase.id).toBe("branch-if-test");
    });

    it("has kind 'branch:if'", () => {
      expect(phase.kind).toBe("branch:if");
    });

    it("has a condition callback that returns true", () => {
      expect(typeof phase.condition).toBe("function");
      expect(phase.condition!(null as any)).toBe(true);
    });

    it("has a then arm with exactly 2 phases", () => {
      expect(phase.then).toHaveLength(2);
    });

    it("then arm child 1 is a standard phase with instructions", () => {
      const child1 = phase.then![0];
      expect(child1.id).toBe("branch-if-then-step-1");
      expect(child1.kind).toBeUndefined();
      expect(child1.instructions).toBeDefined();
      expect(child1.instructions).toContain("/tmp/branch-then-executed.txt");
    });

    it("then arm child 2 is a variable-definition phase", () => {
      const child2 = phase.then![1];
      expect(child2.id).toBe("branch-if-then-step-2");
      expect(child2.kind).toBe("variable-definition");
      expect(child2.variables).toHaveLength(1);
      expect(child2.variables![0].name).toBe("branch_if_then_2");
      expect((child2.variables![0] as any).value).toBe("executed");
    });

    it("has an else arm with exactly 1 phase", () => {
      expect(phase.else).toHaveLength(1);
    });

    it("else arm sets branch_if_taken = 'else'", () => {
      const elsePhase = phase.else![0];
      expect(elsePhase.id).toBe("branch-if-else-step");
      expect(elsePhase.kind).toBe("variable-definition");
      expect(elsePhase.variables![0].name).toBe("branch_if_taken");
      expect((elsePhase.variables![0] as any).value).toBe("else");
    });
  });

  // ---- Phase 15: branch:if Verification ----

  describe("Phase 15: branch:if Verification", () => {
    const phase = workflowPhases[13];

    it("has id 'branch-if-verify'", () => {
      expect(phase.id).toBe("branch-if-verify");
    });

    it("instructions verify branch_if_then_2 === 'executed'", () => {
      expect(phase.instructions).toContain("branch_if_then_2");
      expect(phase.instructions).toContain("executed");
    });

    it("instructions verify /tmp/branch-then-executed.txt", () => {
      expect(phase.instructions).toContain("/tmp/branch-then-executed.txt");
    });

    it("instructions verify branch_if_taken is NOT set", () => {
      expect(phase.instructions).toContain("branch_if_taken");
      expect(phase.instructions).toContain("NOT set");
    });
  });

  // ---- Phase 16: branch:switch with callback on ----

  describe("Phase 16: branch:switch Callback Test", () => {
    const phase = workflowPhases[14];

    it("has id 'branch-switch-callback'", () => {
      expect(phase.id).toBe("branch-switch-callback");
    });

    it("has kind 'branch:switch'", () => {
      expect(phase.kind).toBe("branch:switch");
    });

    it("has an on callback that returns 'approved'", () => {
      expect(typeof phase.on).toBe("function");
      expect((phase.on as Function)(null as any)).toBe("approved");
    });

    it("has 3 arms: approved, rejected, and defaultBranch", () => {
      expect(phase.cases).toBeDefined();
      expect(Object.keys(phase.cases!)).toContain("approved");
      expect(Object.keys(phase.cases!)).toContain("rejected");
      expect(phase.defaultBranch).toBeDefined();
    });

    it("approved arm sets switch_callback_result = 'approved-matched'", () => {
      const approvedArm = phase.cases!["approved"]![0];
      expect(approvedArm.variables![0].name).toBe("switch_callback_result");
      expect((approvedArm.variables![0] as any).value).toBe("approved-matched");
    });
  });

  // ---- Phase 17: branch:switch with $varName ----

  describe("Phase 17: branch:switch $varName Test", () => {
    const phase = workflowPhases[15];

    it("has id 'branch-switch-varname'", () => {
      expect(phase.id).toBe("branch-switch-varname");
    });

    it("has kind 'branch:switch'", () => {
      expect(phase.kind).toBe("branch:switch");
    });

    it("has on as a $varName string", () => {
      expect(phase.on).toBe("$llm_chosen_value");
    });

    it("has cases for 'confirmed' and 'default-choice' plus defaultBranch", () => {
      expect(phase.cases).toBeDefined();
      expect(Object.keys(phase.cases!)).toContain("confirmed");
      expect(Object.keys(phase.cases!)).toContain("default-choice");
      expect(phase.defaultBranch).toBeDefined();
    });

    it("all arms set switch_varname_result with '-matched' suffix", () => {
      for (const [, arm] of Object.entries(phase.cases!)) {
        const result = arm[0].variables![0];
        expect(result.name).toBe("switch_varname_result");
        expect((result as any).value).toMatch(/-matched$/);
      }
      const defaultResult = phase.defaultBranch![0].variables![0];
      expect(defaultResult.name).toBe("switch_varname_result");
      expect((defaultResult as any).value).toMatch(/-matched$/);
    });
  });

  // ---- Phase 18: branch:switch Verification ----

  describe("Phase 18: branch:switch Verification", () => {
    const phase = workflowPhases[16];

    it("has id 'branch-switch-verify'", () => {
      expect(phase.id).toBe("branch-switch-verify");
    });

    it("instructions verify switch_callback_result", () => {
      expect(phase.instructions).toContain("switch_callback_result");
      expect(phase.instructions).toContain("approved-matched");
    });

    it("instructions verify switch_varname_result with '-matched' suffix", () => {
      expect(phase.instructions).toContain("switch_varname_result");
      expect(phase.instructions).toContain("-matched");
    });
  });

  // ---- Phase 19: Final Report ----

  describe("Phase 19: Final Report", () => {
    const phase = workflowPhases[17];

    it("has id 'final-report'", () => {
      expect(phase.id).toBe("final-report");
    });

    it("has write: ['playground-output']", () => {
      expect(phase.write).toEqual(["playground-output"]);
    });

    it("instructions mention writing PLAYGROUND.md", () => {
      expect(phase.instructions).toContain("PLAYGROUND.md");
    });

    it("instructions include listVars verification for programmatic variables", () => {
      expect(phase.instructions).toContain("listVars");
      expect(phase.instructions).toContain("prog_a");
      expect(phase.instructions).toContain("prog_a_seq");
      expect(phase.instructions).toContain("prog_b");
      expect(phase.instructions).toContain("prog_b_seq");
    });

    it("instructions verify static values prog_a and prog_b", () => {
      expect(phase.instructions).toContain("phase-a-set");
      expect(phase.instructions).toContain("phase-b-set");
    });

    it("instructions verify computed sequence values reference phase IDs", () => {
      expect(phase.instructions).toContain("prog_a_seq");
      expect(phase.instructions).toContain("programmatic-chain-1");
      expect(phase.instructions).toContain("prog_b_seq");
      expect(phase.instructions).toContain("programmatic-chain-2");
    });

    it("instructions confirm no LLM turn for programmatic phases", () => {
      expect(phase.instructions).toContain("no LLM instructions were shown");
    });

    it("instructions reference 18 phases total", () => {
      expect(phase.instructions).toContain("1–18");
    });

    it("instructions include conditional branching verification section", () => {
      expect(phase.instructions).toContain(
        "Conditional branching verification",
      );
      expect(phase.instructions).toContain("branch:if");
      expect(phase.instructions).toContain("branch:switch");
      expect(phase.instructions).toContain("branch_if_then_2");
      expect(phase.instructions).toContain("switch_callback_result");
      expect(phase.instructions).toContain("switch_varname_result");
    });
  });
});
