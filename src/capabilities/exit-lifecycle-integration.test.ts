import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCapabilityConfig } from "../capability-config";
import type { ExitResult } from "../runtime/exit-lifecycle";
import type { CapabilityConfig } from "../types";

// Mock prompt-compiler so it doesn't interfere with integration tests
vi.mock("../prompt-compiler", () => ({
  compilePrompt: vi.fn().mockResolvedValue({
    role: "## Role\n\nTest role.",
    workflow: "## Workflow\n\n1. Test step",
    guidelines: "## Guidelines\n\nTest guidelines.",
    mergedSkills: { mandatory: ["pio", "ask-user"] },
  }),
}));

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), "pio-exit-lifecycle-integration-"),
  );
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Integration tests — real postValidate, real frontmatter parsing, real markers
// ---------------------------------------------------------------------------

describe("exit lifecycle integration — review-task with real frontmatter", () => {
  let tempCwd: string;
  let _goalDir: string;
  let stepDir: string;
  let runExitLifecycle: (config: CapabilityConfig) => Promise<ExitResult>;
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

    // Import and explicitly register goalDrivenDevelopment before importing the exit lifecycle.
    const { setupPioWorkflowMachine } = await import(
      "../state-machines/pio-workflow-machine"
    );
    setupPioWorkflowMachine();

    // Import the exit lifecycle fresh (after resetModules) so its state-machine
    // imports reference the freshly registered machine registry.
    const exitMod = await import("../runtime/exit-lifecycle");
    runExitLifecycle = exitMod.runExitLifecycle;

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

    // Act
    const result = await runExitLifecycle(config!);

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

    // Assert: exit result reports success and names the enqueued capability
    expect(result.success).toBe(true);
    expect(result.message).toContain("Validation passed");
    expect(result.notification).toContain("evolve-plan");
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

    // Act
    const result = await runExitLifecycle(config!);

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

    // Assert: exit result reports success and names the enqueued capability
    expect(result.success).toBe(true);
    expect(result.message).toContain("Validation passed");
    expect(result.notification).toContain("execute-task");
  });

  it("invalid frontmatter (missing decision) fails, no markers created", async () => {
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

    // Act
    const result = await runExitLifecycle(config!);

    // Assert: raw failure message names the missing field
    expect(result.success).toBe(false);
    expect(result.message).toContain("decision");

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

  it("invalid frontmatter (invalid decision value) fails", async () => {
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

    // Act
    const result = await runExitLifecycle(config!);

    // Assert: raw failure message names the invalid field value
    expect(result.success).toBe(false);
    expect(result.message).toContain("decision");

    // Assert: no markers created
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("missing REVIEW.md file fails validation", async () => {
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

    // Act
    const result = await runExitLifecycle(config!);

    // Assert: validation failed (missing REVIEW.md) — raw message, no tool prefix
    expect(result.success).toBe(false);
    expect(result.message).toContain("REVIEW.md");
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

    // Act
    const result = await runExitLifecycle(config!);

    // Assert: exit result reports success
    expect(result.success).toBe(true);
    expect(result.message).toContain("Validation passed");

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
