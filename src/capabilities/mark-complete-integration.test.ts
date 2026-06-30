import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCapabilityConfig } from "../capability-config";

// Mock prompt-compiler and step-nudging so they don't interfere with integration tests
vi.mock("../prompt-compiler", () => ({
  compilePrompt: vi.fn().mockResolvedValue({
    role: "## Role\n\nTest role.",
    workflow: "## Workflow\n\n1. Test step",
    guidelines: "## Guidelines\n\nTest guidelines.",
    mergedSkills: { mandatory: ["pio", "ask-user"] },
  }),
}));

vi.mock("../guards/step-nudging", () => ({
  setupStepNudging: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), "pio-mark-complete-integration-"),
  );
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock ExtensionAPI that captures the registered tool.
 */
function makeMockPi(): {
  mockPi: ExtensionAPI;
  getRegisteredTool: () =>
    | { name: string; label: string; execute: Function }
    | undefined;
} {
  let tool: { name: string; label: string; execute: Function } | undefined;

  const mockPi = {
    registerTool: (t: { name: string; label: string; execute: Function }) => {
      tool = t;
    },
    on: vi.fn(),
    setSessionName: vi.fn(),
  } as unknown as ExtensionAPI;

  return { mockPi, getRegisteredTool: () => tool };
}

/**
 * Set up the goal workspace structure for review-task integration tests.
 */
function setupGoalWorkspace(
  tempCwd: string,
  reviewContent: string,
): { goalDir: string; stepDir: string } {
  const goalDir = path.join(tempCwd, ".pio", "goals", "test-goal");
  const stepDir = path.join(goalDir, "S01");
  fs.mkdirSync(stepDir, { recursive: true });

  fs.writeFileSync(
    path.join(goalDir, "GOAL.md"),
    "# Test Goal\n\n## Description\n\nTest goal.",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(goalDir, "PLAN.md"),
    "---\ntotalSteps: 1\nsteps:\n  - name: test-step\n    complexity: task\n---\n# Plan\n\n## Step 1: Test Step\n\nDescription.",
    "utf-8",
  );
  fs.writeFileSync(path.join(stepDir, "REVIEW.md"), reviewContent, "utf-8");
  fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");
  fs.writeFileSync(
    path.join(stepDir, "SUMMARY.md"),
    "# Summary\n\n## Status\n\nCOMPLETED",
    "utf-8",
  );
  fs.mkdirSync(path.join(tempCwd, ".pio", "session-queue"), {
    recursive: true,
  });

  return { goalDir, stepDir };
}

/**
 * Create a mock context with the given config data.
 * getSessionConfig() now stores only { capability, sessionParams } in the entry
 * and reconstructs the full config via resolveCapabilityConfig().
 */
function makeMockCtx(configData: Record<string, unknown>, cwd: string) {
  return {
    sessionManager: {
      getEntries: () => [
        {
          type: "custom" as const,
          customType: "pio-config" as const,
          data: {
            capability: configData.capability,
            workspaceDir: configData.workspaceDir,
            sessionParams: configData.sessionParams,
          },
        },
      ],
    },
    cwd,
  };
}

// ---------------------------------------------------------------------------
// Integration tests — real postValidate, real frontmatter parsing, real markers
// ---------------------------------------------------------------------------

describe("pio_mark_complete integration — review-task with real frontmatter", () => {
  let tempCwd: string;
  let _goalDir: string;
  let stepDir: string;
  let getRegisteredTool: () =>
    | { name: string; label: string; execute: Function }
    | undefined;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    tempCwd = createTempDir();

    // Populate contract cache FIRST — before any module that uses getCapState is imported.
    // This ensures the _discoveredContracts variable in utils.ts is set before
    // pio-workflow-machine.ts captures its reference to getCapState.
    const { CONTRACT: createPlanContract } = await import(
      "./create-plan/config"
    );
    const { CONTRACT: evolvePlanContract } = await import(
      "./evolve-plan/config"
    );
    const { CONTRACT: reviewTaskContract } = await import(
      "./review-task/config"
    );
    const { CONTRACT: executeTaskContract } = await import(
      "./execute-task/config"
    );
    const utilsMod = await import("../state-machines/utils");
    utilsMod.setDiscoveredContracts({
      "create-plan": createPlanContract,
      "evolve-plan": evolvePlanContract,
      "review-task": reviewTaskContract,
      "execute-task": executeTaskContract,
    });

    // Import and explicitly register goalDrivenDevelopment before importing mark-complete.
    const { setupPioWorkflowMachine } = await import(
      "../state-machines/pio-workflow-machine"
    );
    setupPioWorkflowMachine();

    // Import mark-complete fresh (no mocks in this file)
    const mod = await import("../guards/mark-complete");

    // Capture registered tool via mockPi
    const { mockPi, getRegisteredTool: getTool } = makeMockPi();
    mod.setupMarkComplete(mockPi);
    getRegisteredTool = getTool;

    // Mock process.cwd() so enqueueTask writes to our temp directory
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempCwd);
  });

  afterEach(() => {
    cwdSpy?.mockRestore();
    cleanup(tempCwd);
  });

  it("valid APPROVED frontmatter creates APPROVED marker and enqueues evolve-plan", async () => {
    // Arrange: create REVIEW.md with valid APPROVED frontmatter
    const reviewContent = `---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 1
lowIssues: 2
---

# Code Review: Test Step

## Decision
APPROVED
`;
    ({ goalDir: _goalDir, stepDir } = setupGoalWorkspace(
      tempCwd,
      reviewContent,
    ));

    // Resolve the real capability config (includes real postValidate)
    const config = await resolveCapabilityConfig(tempCwd, {
      capability: "review-task",
      goalName: "test-goal",
      stepNumber: 1,
      sessionName: "test-goal review-task s1",
      workspacePrefix: "goals/test-goal/S01",
      queueKey: "test-goal",
    });

    const mockCtx = makeMockCtx(
      config! as unknown as Record<string, unknown>,
      tempCwd,
    );

    // Act
    const result = await getRegisteredTool()?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // Assert: APPROVED marker exists
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(true);

    // Assert: queue file was created with evolve-plan capability
    const queuePath = path.join(
      tempCwd,
      ".pio",
      "session-queue",
      "task-test-goal.json",
    );
    expect(fs.existsSync(queuePath)).toBe(true);
    const queueData = JSON.parse(fs.readFileSync(queuePath, "utf-8"));
    expect(queueData.capability).toBe("evolve-plan");
    expect(queueData.params.stepNumber).toBe(2);

    // Assert: session terminated
    expect(result.terminate).toBe(true);
  });

  it("valid REJECTED frontmatter creates REJECTED marker, enqueues execute-task", async () => {
    // Arrange: create REVIEW.md with valid REJECTED frontmatter
    const reviewContent = `---
decision: REJECTED
criticalIssues: 1
highIssues: 2
mediumIssues: 0
lowIssues: 0
---

# Code Review: Test Step

## Decision
REJECTED
`;
    ({ goalDir: _goalDir, stepDir } = setupGoalWorkspace(
      tempCwd,
      reviewContent,
    ));

    const config = await resolveCapabilityConfig(tempCwd, {
      capability: "review-task",
      goalName: "test-goal",
      stepNumber: 1,
      sessionName: "test-goal review-task s1",
      workspacePrefix: "goals/test-goal/S01",
      queueKey: "test-goal",
    });

    const mockCtx = makeMockCtx(
      config! as unknown as Record<string, unknown>,
      tempCwd,
    );

    // Act
    const result = await getRegisteredTool()?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // Assert: REJECTED marker exists, APPROVED doesn't
    // COMPLETED is NOT deleted — framework auto-cleanup handles it when execute-task re-runs
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(true);

    // Assert: queue file was created with execute-task capability (re-execute same step)
    const queuePath = path.join(
      tempCwd,
      ".pio",
      "session-queue",
      "task-test-goal.json",
    );
    expect(fs.existsSync(queuePath)).toBe(true);
    const queueData = JSON.parse(fs.readFileSync(queuePath, "utf-8"));
    expect(queueData.capability).toBe("execute-task");
    expect(queueData.params.stepNumber).toBe(1);

    expect(result.terminate).toBe(true);
  });

  it("invalid frontmatter (missing decision) returns error, no markers created", async () => {
    // Arrange: create REVIEW.md with invalid frontmatter (missing decision field)
    const reviewContent = `---
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---

# Code Review

Missing decision field.
`;
    ({ goalDir: _goalDir, stepDir } = setupGoalWorkspace(
      tempCwd,
      reviewContent,
    ));

    const config = await resolveCapabilityConfig(tempCwd, {
      capability: "review-task",
      goalName: "test-goal",
      stepNumber: 1,
      sessionName: "test-goal review-task s1",
      workspacePrefix: "goals/test-goal/S01",
      queueKey: "test-goal",
    });

    const mockCtx = makeMockCtx(
      config! as unknown as Record<string, unknown>,
      tempCwd,
    );

    // Act
    const result = await getRegisteredTool()?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // Assert: error message mentions the missing field
    expect(result.content[0].text).toContain("decision");
    expect(result.terminate).toBeFalsy();

    // Assert: no markers created
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);

    // Assert: no queue file created
    const queuePath = path.join(
      tempCwd,
      ".pio",
      "session-queue",
      "task-test-goal.json",
    );
    expect(fs.existsSync(queuePath)).toBe(false);
  });

  it("invalid frontmatter (invalid decision value) returns error", async () => {
    // Arrange: create REVIEW.md with invalid decision value
    const reviewContent = `---
decision: PENDING
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---

# Code Review

Invalid decision value.
`;
    ({ goalDir: _goalDir, stepDir } = setupGoalWorkspace(
      tempCwd,
      reviewContent,
    ));

    const config = await resolveCapabilityConfig(tempCwd, {
      capability: "review-task",
      goalName: "test-goal",
      stepNumber: 1,
      sessionName: "test-goal review-task s1",
      workspacePrefix: "goals/test-goal/S01",
      queueKey: "test-goal",
    });

    const mockCtx = makeMockCtx(
      config! as unknown as Record<string, unknown>,
      tempCwd,
    );

    // Act
    const result = await getRegisteredTool()?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // Assert: error message mentions the invalid value
    expect(result.content[0].text).toContain("decision");
    expect(result.terminate).toBeFalsy();

    // Assert: no markers created
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("missing REVIEW.md file returns error", async () => {
    // Arrange: set up workspace but DON'T create REVIEW.md
    const goalDir = path.join(tempCwd, ".pio", "goals", "test-goal");
    const stepDir = path.join(goalDir, "S01");
    fs.mkdirSync(stepDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Test Goal", "utf-8");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "# Plan\n\n## Step 1: Test",
      "utf-8",
    );
    fs.mkdirSync(path.join(tempCwd, ".pio", "session-queue"), {
      recursive: true,
    });

    const config = await resolveCapabilityConfig(tempCwd, {
      capability: "review-task",
      goalName: "test-goal",
      stepNumber: 1,
      sessionName: "test-goal review-task s1",
      workspacePrefix: "goals/test-goal/S01",
      queueKey: "test-goal",
    });

    const mockCtx = makeMockCtx(
      config! as unknown as Record<string, unknown>,
      tempCwd,
    );

    // Act
    const result = await getRegisteredTool()?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // Assert: validation failed (missing REVIEW.md)
    expect(result.content[0].text).toContain("Validation failed");
    expect(result.content[0].text).toContain("REVIEW.md");
    expect(result.terminate).toBeFalsy();
  });

  it("non-review capability passes without postValidate/postExecute", async () => {
    // Arrange: set up workspace for execute-task (no postValidate)
    // After Step 10, execute-task CONTRACT uses plain file names with step-level workspacePrefix
    const goalDir = path.join(tempCwd, ".pio", "goals", "test-goal");
    const stepDir = path.join(goalDir, "S01");
    fs.mkdirSync(stepDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Test Goal", "utf-8");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "# Plan\n\n## Step 1: Test",
      "utf-8",
    );
    // CONTRACT uses plain file names — files resolve in the step directory (workspacePrefix includes step folder)
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\nskills:\n  mandatory: []\n---\n# Task",
      "utf-8",
    );
    fs.writeFileSync(path.join(stepDir, "TEST.md"), "# Tests", "utf-8");
    fs.writeFileSync(
      path.join(stepDir, "SUMMARY.md"),
      "---\nstatus: completed\n---\n# Summary\n\n## Status\n\nCOMPLETED",
      "utf-8",
    );
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");
    fs.mkdirSync(path.join(tempCwd, ".pio", "session-queue"), {
      recursive: true,
    });

    const config = await resolveCapabilityConfig(tempCwd, {
      capability: "execute-task",
      goalName: "test-goal",
      stepNumber: 1,
      sessionName: "test-goal execute-task s1",
      workspacePrefix: "goals/test-goal/S01",
      queueKey: "test-goal",
    });

    const mockCtx = makeMockCtx(
      config! as unknown as Record<string, unknown>,
      tempCwd,
    );

    // Act
    const result = await getRegisteredTool()?.execute(
      "test-id",
      {},
      new AbortController(),
      () => {},
      mockCtx,
    );

    // Assert: validation passed, session terminated
    expect(result.content[0].text).toContain("Validation passed");
    expect(result.terminate).toBe(true);

    // Assert: next task enqueued (review-task)
    const queuePath = path.join(
      tempCwd,
      ".pio",
      "session-queue",
      "task-test-goal.json",
    );
    expect(fs.existsSync(queuePath)).toBe(true);
    const queueData = JSON.parse(fs.readFileSync(queuePath, "utf-8"));
    expect(queueData.capability).toBe("review-task");
  });
});
