import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";
import { validateOutputs } from "../../guards/validation";
import { resolveCapabilityConfig } from "../../capability-config";
import { validateEvolveStep } from "./callbacks";
import { register } from "./config";
import { readPendingTask } from "../../queues";
import type { CapabilityContract, MarkdownFileSpec } from "../../types";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-evolve-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Create a minimal goal directory tree with PLAN.md and optional COMPLETION_SUMMARY.md.
function createGoalTree(
  tempDir: string,
  goalName: string,
  options?: { withCompletionSummary?: boolean; planContent?: string },
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  // Always create PLAN.md
  fs.writeFileSync(
    path.join(goalDir, "PLAN.md"),
    options?.planContent || "# Plan\n\n### Step 1: Test step\n",
    "utf-8",
  );

  // Optionally create COMPLETION_SUMMARY.md
  if (options?.withCompletionSummary) {
    fs.writeFileSync(path.join(goalDir, "COMPLETION_SUMMARY.md"), "---\nstatus: complete\n---\n# Complete\n", "utf-8");
  }

  return goalDir;
}

// ---------------------------------------------------------------------------
// validateOutputs — COMPLETION_SUMMARY.md short-circuit at baseDir
// ---------------------------------------------------------------------------

describe("validateOutputs with COMPLETION_SUMMARY.md at baseDir", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("passes when COMPLETION_SUMMARY.md exists, even if other expected files are missing", () => {
    // Arrange: temp dir with COMPLETION_SUMMARY.md file but no TASK.md/TEST.md
    fs.writeFileSync(path.join(tempDir, "COMPLETION_SUMMARY.md"), "---\nstatus: complete\n---\n# Complete\n", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "TASK.md" }, { name: "test", file: "TEST.md" }],
    };

    // Act
    const result = validateOutputs(contract, tempDir);

    // Assert
    expect(result).toEqual({ success: true });
  });

  it("passes when COMPLETION_SUMMARY.md is the only expected file and it exists", () => {
    // Arrange: temp dir with COMPLETION_SUMMARY.md
    fs.writeFileSync(path.join(tempDir, "COMPLETION_SUMMARY.md"), "---\nstatus: complete\n---\n# Complete\n", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "completion-summary", file: "COMPLETION_SUMMARY.md" }],
    };

    // Act
    const result = validateOutputs(contract, tempDir);

    // Assert
    expect(result).toEqual({ success: true });
  });

  it("fails normally when COMPLETION_SUMMARY.md does not exist and expected files are missing", () => {
    // Arrange: temp dir with no COMPLETION_SUMMARY.md, no TASK.md
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "TASK.md" }],
    };

    // Act
    const result = validateOutputs(contract, tempDir);

    // Assert
    expect(result.success).toBe(false);
    expect(result.message).toContain("TASK.md");
  });

  it("does not match COMPLETION_SUMMARY.md in a subfolder", () => {
    // Arrange: temp dir with S01/COMPLETION_SUMMARY.md but no COMPLETION_SUMMARY.md at root
    const s01Dir = path.join(tempDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(path.join(s01Dir, "COMPLETION_SUMMARY.md"), "---\nstatus: complete\n---\n# Complete\n", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S01/TASK.md" }],
    };

    // Act
    const result = validateOutputs(contract, tempDir);

    // Assert: fails normally (short-circuit only for baseDir/COMPLETION_SUMMARY.md, not subfolder)
    expect(result.success).toBe(false);
    expect(result.message).toContain("S01/TASK.md");
  });
});

// ---------------------------------------------------------------------------
// resolveEvolveWriteAllowlist — always includes COMPLETION_SUMMARY.md
// ---------------------------------------------------------------------------

describe("resolveEvolveWriteAllowlist", () => {
  it("always includes COMPLETION_SUMMARY.md alongside step-folder paths", async () => {
    // Arrange: resolve evolve-plan config with stepNumber 2
    const params = { capability: "evolve-plan" as string, goalName: "my-feature", stepNumber: 2, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: writeAllowlist contains COMPLETION_SUMMARY.md, S02/TASK.md (no TEST.md)
    expect(result!.writeAllowlist).toContain("COMPLETION_SUMMARY.md");
    expect(result!.writeAllowlist).toContain("S02/TASK.md");
    expect(result!.writeAllowlist).not.toContain("S02/TEST.md");
  });
});

// ---------------------------------------------------------------------------
// resolveEvolveWriteAllowlist — REVISE_PLAN_NEEDED inclusion
// ---------------------------------------------------------------------------

describe("resolveEvolveWriteAllowlist with REVISE_PLAN_NEEDED", () => {
  it("includes S01/REVISE_PLAN_NEEDED in write allowlist for stepNumber=1", async () => {
    // Arrange: resolve evolve-plan config with stepNumber 1
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 1, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: writeAllowlist contains S01/REVISE_PLAN_NEEDED
    expect(result?.writeAllowlist).toContain("S01/REVISE_PLAN_NEEDED");
  });

  it("includes S03/REVISE_PLAN_NEEDED in write allowlist for stepNumber=3", async () => {
    // Arrange: resolve evolve-plan config with stepNumber 3
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 3, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: writeAllowlist contains S03/REVISE_PLAN_NEEDED
    expect(result?.writeAllowlist).toContain("S03/REVISE_PLAN_NEEDED");
  });

  it("marker path uses correct step folder naming (zero-padded)", async () => {
    // Arrange: resolve evolve-plan config with stepNumber 12
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 12, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: allowlist contains S12/REVISE_PLAN_NEEDED (not S120/... or S1/...)
    expect(result?.writeAllowlist).toContain("S12/REVISE_PLAN_NEEDED");
    // Verify no under-padded path exists (S1/ would match S10/, S11/, S12/ with .includes)
    expect(result?.writeAllowlist).not.toContain("S1/REVISE_PLAN_NEEDED");
  });
});

// ---------------------------------------------------------------------------
// REVISE_PLAN_NEEDED marker filename consistency
// ---------------------------------------------------------------------------

describe("REVISE_PLAN_NEEDED marker filename consistency", () => {
  it("marker filename in evolve-plan writeAllowlist matches revise-plan constant", async () => {
    // Arrange: resolve evolve-plan config for step 2
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 2, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: extract the marker path from writeAllowlist, check basename equals "REVISE_PLAN_NEEDED"
    const markerPath = result?.writeAllowlist?.find((p) => p.includes("REVISE_PLAN_NEEDED"));
    expect(markerPath).toBeDefined();
    const basename = markerPath!.split("/").pop();
    expect(basename).toBe("REVISE_PLAN_NEEDED");

    // Cross-check: the revise-plan module uses the same constant value
    const { REVISE_PLAN_MARKER } = await import("../revise-plan/callbacks");
    expect(basename).toBe(REVISE_PLAN_MARKER);
  });
});

// ---------------------------------------------------------------------------
// contract.outputs — DECISIONS.md requiredWhen for step > 1
// ---------------------------------------------------------------------------

describe("contract.outputs with DECISIONS_FILE requiredWhen", () => {
  it("excludes DECISIONS.md for stepNumber=1", async () => {
    // Arrange: step 1 should produce only TASK.md
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 1, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: contract.outputs has requiredWhen predicate for DECISIONS.md
    const decisionsEntry = result?.contract.outputs.find(
      (e: any) => "file" in e && e.file.includes("DECISIONS.md"),
    ) as MarkdownFileSpec | undefined;
    expect(decisionsEntry).toBeDefined();
    expect(decisionsEntry!.requiredWhen!(params)).toBe(false);
  });

  it("includes DECISIONS.md for stepNumber=2", async () => {
    // Arrange: step 2 should include DECISIONS.md alongside TASK.md
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 2, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: requiredWhen returns true for step > 1
    const decisionsEntry = result?.contract.outputs.find(
      (e: any) => "file" in e && e.file.includes("DECISIONS.md"),
    ) as MarkdownFileSpec | undefined;
    expect(decisionsEntry).toBeDefined();
    expect(decisionsEntry!.requiredWhen!(params)).toBe(true);
  });

  it("includes DECISIONS.md for stepNumber=3", async () => {
    // Arrange: step 3+ should also include DECISIONS.md
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 3, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: requiredWhen returns true for step > 1
    const decisionsEntry = result?.contract.outputs.find(
      (e: any) => "file" in e && e.file.includes("DECISIONS.md"),
    ) as MarkdownFileSpec | undefined;
    expect(decisionsEntry).toBeDefined();
    expect(decisionsEntry!.requiredWhen!(params)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveEvolveWriteAllowlist — DECISIONS.md for step > 1
// ---------------------------------------------------------------------------

describe("resolveEvolveWriteAllowlist with DECISIONS_FILE", () => {
  it("excludes DECISIONS.md from write allowlist for stepNumber=1", async () => {
    // Arrange: step 1 should not include DECISIONS.md in the write allowlist
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 1, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: no DECISIONS.md in the allowlist
    expect(result?.writeAllowlist?.some((p) => p.includes("DECISIONS.md"))).toBe(false);
  });

  it("includes DECISIONS.md in write allowlist for stepNumber=2", async () => {
    // Arrange: step 2 should include DECISIONS.md alongside existing entries
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 2, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: contains all expected files including DECISIONS.md and REVISE_PLAN_NEEDED (total length is 4, no TEST.md)
    expect(result?.writeAllowlist).toContain("COMPLETION_SUMMARY.md");
    expect(result?.writeAllowlist).toContain("S02/TASK.md");
    expect(result?.writeAllowlist).not.toContain("S02/TEST.md");
    expect(result?.writeAllowlist).toContain("S02/DECISIONS.md");
    expect(result?.writeAllowlist).toContain("S02/REVISE_PLAN_NEEDED");
    expect(result?.writeAllowlist?.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Shared helper for frontmatter-based tests
// ---------------------------------------------------------------------------

function createGoalTreeWithFrontmatter(
  tempDir: string,
  goalName: string,
  totalSteps: number,
  options?: {
    stepFolders?: Array<{ stepNumber: number; approved: boolean }>;
    withCompletionSummary?: boolean;
  },
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  // Create PLAN.md with YAML frontmatter
  const stepsYaml = Array.from({ length: totalSteps }, (_, i) => `  - name: step-${i + 1}\n    complexity: task`).join("\n");
  const planContent = `---\ntotalSteps: ${totalSteps}\nsteps:\n${stepsYaml}\n---\n# Plan\n\n### Step 1: Test step\n`;
  fs.writeFileSync(path.join(goalDir, "PLAN.md"), planContent, "utf-8");

  // Create step folders with optional APPROVED markers
  for (const step of options?.stepFolders ?? []) {
    const folder = `S${String(step.stepNumber).padStart(2, "0")}`;
    const stepDir = path.join(goalDir, folder);
    fs.mkdirSync(stepDir, { recursive: true });

    // Create TASK.md and TEST.md so the folder is considered "defined"
    fs.writeFileSync(path.join(stepDir, "TASK.md"), "# Task\n", "utf-8");
    fs.writeFileSync(path.join(stepDir, "TEST.md"), "# Tests\n", "utf-8");

    if (step.approved) {
      fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    }
  }

  // Optionally create COMPLETION_SUMMARY.md
  if (options?.withCompletionSummary) {
    fs.writeFileSync(path.join(goalDir, "COMPLETION_SUMMARY.md"), "---\nstatus: complete\n---\n# Complete\n", "utf-8");
  }

  return goalDir;
}

// ---------------------------------------------------------------------------
// validateEvolveStep — directory resolution
// ---------------------------------------------------------------------------

describe("validateEvolveStep", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("resolves workspace and returns ready with stepNumber", async () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "my-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "---\ntotalSteps: 3\nsteps:\n  - name: test\n    complexity: task\n---\n# Plan");

    const result = await validateEvolveStep("goals/my-goal", tempDir, 3);

    expect(result.ready).toBe(true);
    if (result.ready) {
      expect(result.stepNumber).toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
// Tool execute — pio_evolve_plan
// ---------------------------------------------------------------------------

describe("evolvePlanTool.execute", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

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
      sessionManager: { getSessionFile: vi.fn(() => ""), getEntries: vi.fn(() => []) },
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

  it("returns error when PLAN.md is missing", async () => {
    // Arrange: goal dir exists but no PLAN.md
    const goalDir = path.join(tempDir, ".pio", "goals", "no-plan");
    fs.mkdirSync(goalDir, { recursive: true });

    const tool = getTool();
    const result = await tool.execute("test-id", { workspacePrefix: "goals/no-plan", stepNumber: 1 }, undefined, undefined, makeCtx(tempDir));

    expect(result.content[0].text).toMatch(/PLAN/i);
  });

  it("enqueues task when PLAN.md exists", async () => {
    createGoalTreeWithFrontmatter(tempDir, "my-feature", 3);

    const tool = getTool();
    const result = await tool.execute("test-id", { workspacePrefix: "goals/my-feature", stepNumber: 1 }, undefined, undefined, makeCtx(tempDir));

    expect(result.content[0].text).toContain("queued");
  });

  it("enqueues task with correct params (workspacePrefix, sessionName, queueKey, stepNumber, initialMessage)", async () => {
    createGoalTreeWithFrontmatter(tempDir, "my-feature", 3);

    const tool = getTool();
    await tool.execute("test-id", { workspacePrefix: "goals/my-feature", stepNumber: 1 }, undefined, undefined, makeCtx(tempDir));

    const task = readPendingTask(tempDir, "my-feature");
    expect(task).toBeDefined();
    expect(task!.capability).toBe("evolve-plan");
    expect(task!.params).toHaveProperty("workspacePrefix", "goals/my-feature");
    expect(task!.params).toHaveProperty("sessionName");
    expect(task!.params!.sessionName).toContain("evolve-plan");
    expect(task!.params).toHaveProperty("queueKey", "my-feature");
    expect(task!.params).toHaveProperty("stepNumber");
    expect(task!.params).toHaveProperty("initialMessage");
  });
});
