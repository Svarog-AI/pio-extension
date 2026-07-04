import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";
import { resolveCapabilityConfig } from "../../capability-config";
import { CapState } from "../../capability-state";
import { validateOutputs } from "../../guards/validation";
import { readPendingTask } from "../../queues";
import type {
  CapabilityContract,
  MarkdownFileSpec,
  OutputEntry,
} from "../../types";
import {
  isArrayOutput,
  isMarkdownFileSpec,
  isOneOfGroup,
  OneOfGroup,
} from "../../types";
import { PLAN_FRONTMATTER_SCHEMA } from "../create-plan/schemas";
import { CONTRACT, register } from "./config";

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
function _createGoalTree(
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
    fs.writeFileSync(
      path.join(goalDir, "COMPLETION_SUMMARY.md"),
      "---\nstatus: complete\n---\n# Complete\n",
      "utf-8",
    );
  }

  return goalDir;
}

// ---------------------------------------------------------------------------
// Recursive findOutput helper
// ---------------------------------------------------------------------------

/**
 * Recursively search the OutputEntry tree for a MarkdownFileSpec matching a file name pattern.
 * Traverses inside OneOfGroup.files, bare arrays, and top-level entries.
 */
function findOutput(
  outputs: OutputEntry[],
  pattern: string,
): MarkdownFileSpec | undefined {
  for (const entry of outputs) {
    if (isMarkdownFileSpec(entry) && entry.file.includes(pattern)) return entry;
    if (isArrayOutput(entry)) {
      const found = findOutput(entry, pattern);
      if (found) return found;
    }
    if (isOneOfGroup(entry)) {
      const found = findOutput(entry.files, pattern);
      if (found) return found;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// validateOutputs — COMPLETION_SUMMARY.md short-circuit at workspaceDir
// ---------------------------------------------------------------------------

describe("validateOutputs with COMPLETION_SUMMARY.md at workspaceDir", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("fails when COMPLETION_SUMMARY.md exists but is not declared in contract", () => {
    // COMPLETION_SUMMARY.md exists but is NOT declared in the contract
    // Validation should proceed normally — checking only declared outputs
    fs.writeFileSync(
      path.join(tempDir, "COMPLETION_SUMMARY.md"),
      "---\nstatus: complete\n---\n# Complete\n",
      "utf-8",
    );

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "task", file: "TASK.md" },
        { name: "test", file: "TEST.md" },
      ],
    };

    // Act
    const capState = new CapState(contract, tempDir);
    const result = validateOutputs(capState);

    // Assert: fails because TASK.md and TEST.md are missing (no bypass)
    expect(result.success).toBe(false);
    expect(result.message).toContain("TASK.md");
    expect(result.message).toContain("TEST.md");
  });

  it("passes when COMPLETION_SUMMARY.md is the only expected file and it exists", () => {
    // Arrange: temp dir with COMPLETION_SUMMARY.md
    fs.writeFileSync(
      path.join(tempDir, "COMPLETION_SUMMARY.md"),
      "---\nstatus: complete\n---\n# Complete\n",
      "utf-8",
    );

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "completion-summary", file: "COMPLETION_SUMMARY.md" }],
    };

    // Act
    const capState = new CapState(contract, tempDir);
    const result = validateOutputs(capState);

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
    const capState = new CapState(contract, tempDir);
    const result = validateOutputs(capState);

    // Assert
    expect(result.success).toBe(false);
    expect(result.message).toContain("TASK.md");
  });

  it("does not match COMPLETION_SUMMARY.md in a subfolder", () => {
    // Arrange: temp dir with S01/COMPLETION_SUMMARY.md but no COMPLETION_SUMMARY.md at root
    const s01Dir = path.join(tempDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(
      path.join(s01Dir, "COMPLETION_SUMMARY.md"),
      "---\nstatus: complete\n---\n# Complete\n",
      "utf-8",
    );

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S01/TASK.md" }],
    };

    // Act
    const capState = new CapState(contract, tempDir);
    const result = validateOutputs(capState);

    // Assert: fails normally (short-circuit only for workspaceDir/COMPLETION_SUMMARY.md, not subfolder)
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
    const params = {
      capability: "evolve-plan" as string,
      goalName: "my-feature",
      stepNumber: 2,
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: writeAllowlist contains COMPLETION_SUMMARY.md, S02/TASK.md (no TEST.md)
    expect(result?.writeAllowlist).toContain("COMPLETION_SUMMARY.md");
    expect(result?.writeAllowlist).toContain("S02/TASK.md");
    expect(result?.writeAllowlist).not.toContain("S02/TEST.md");
  });
});

// ---------------------------------------------------------------------------
// resolveEvolveWriteAllowlist — REVISE_PLAN_NEEDED.md inclusion (workspace root)
// ---------------------------------------------------------------------------

describe("resolveEvolveWriteAllowlist with REVISE_PLAN_NEEDED.md", () => {
  it("includes REVISE_PLAN_NEEDED.md at workspace root for stepNumber=1", async () => {
    // Arrange: resolve evolve-plan config with stepNumber 1
    const params = {
      capability: "evolve-plan" as string,
      goalName: "test-goal",
      stepNumber: 1,
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: writeAllowlist contains REVISE_PLAN_NEEDED.md at workspace root
    expect(result?.writeAllowlist).toContain("REVISE_PLAN_NEEDED.md");
  });

  it("includes REVISE_PLAN_NEEDED.md at workspace root for stepNumber=3", async () => {
    // Arrange: resolve evolve-plan config with stepNumber 3
    const params = {
      capability: "evolve-plan" as string,
      goalName: "test-goal",
      stepNumber: 3,
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: writeAllowlist contains REVISE_PLAN_NEEDED.md (workspace root)
    expect(result?.writeAllowlist).toContain("REVISE_PLAN_NEEDED.md");
  });

  it("marker path is at workspace root (not inside step folder)", async () => {
    // Arrange: resolve evolve-plan config with stepNumber 3
    const params = {
      capability: "evolve-plan" as string,
      goalName: "test-goal",
      stepNumber: 3,
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: no step-folder-prefixed marker path
    expect(result?.writeAllowlist).not.toContain("S03/REVISE_PLAN_NEEDED.md");
    expect(result?.writeAllowlist).not.toContain("S03/REVISE_PLAN_NEEDED");
    // Only the workspace-root version should exist
    const markerPaths = result?.writeAllowlist?.filter((p) =>
      p.includes("REVISE_PLAN_NEEDED"),
    );
    expect(markerPaths).toEqual(["REVISE_PLAN_NEEDED.md"]);
  });
});

// ---------------------------------------------------------------------------
// REVISE_PLAN_NEEDED.md marker filename consistency
// ---------------------------------------------------------------------------

describe("REVISE_PLAN_NEEDED.md marker filename", () => {
  it("marker filename in evolve-plan writeAllowlist has .md extension", async () => {
    // Arrange: resolve evolve-plan config for step 2
    const params = {
      capability: "evolve-plan" as string,
      goalName: "test-goal",
      stepNumber: 2,
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: extract the marker path from writeAllowlist
    const markerPath = result?.writeAllowlist?.find((p) =>
      p.includes("REVISE_PLAN_NEEDED"),
    );
    expect(markerPath).toBeDefined();
    expect(markerPath).toBe("REVISE_PLAN_NEEDED.md");
  });
});

// ---------------------------------------------------------------------------
// CONTRACT.outputs — OneOfGroup construction and mutual exclusion
// ---------------------------------------------------------------------------

describe("CONTRACT.outputs — Two OneOfGroups", () => {
  it("outputs contain exactly two OneOfGroup instances", () => {
    const oneOfGroups = CONTRACT.outputs.filter(isOneOfGroup);
    expect(oneOfGroups.length).toBe(2);
    expect(oneOfGroups.every((g) => g instanceof OneOfGroup)).toBe(true);
  });

  it("Group 1 (index 0) contains inner AND-group and revise-plan", () => {
    const group1 = CONTRACT.outputs[0] as OneOfGroup;
    expect(group1.files.length).toBe(2);
    // Option A: bare array (AND-group) with task + decisions
    expect(Array.isArray(group1.files[0])).toBe(true);
    expect((group1.files[0] as OutputEntry[]).length).toBe(2);
    // Option B: revise-plan
    expect(isMarkdownFileSpec(group1.files[1])).toBe(true);
    expect((group1.files[1] as MarkdownFileSpec).name).toBe("revise-plan");
    expect((group1.files[1] as MarkdownFileSpec).file).toBe(
      "REVISE_PLAN_NEEDED.md",
    );
  });

  it("Group 2 (index 1) contains completion-summary and revise-plan", () => {
    const group2 = CONTRACT.outputs[1] as OneOfGroup;

    const completionEntry = findOutput(group2.files, "COMPLETION_SUMMARY.md");
    const reviseEntry = findOutput(group2.files, "REVISE_PLAN_NEEDED.md");

    expect(completionEntry).toBeDefined();
    expect(completionEntry?.name).toBe("completion-summary");
    expect(reviseEntry).toBeDefined();
    expect(reviseEntry?.name).toBe("revise-plan");
  });

  it("Group 1 requiredWhen is active only when stepNumber <= totalSteps", () => {
    const group1 = CONTRACT.outputs[0] as OneOfGroup;
    expect(group1.requiredWhen).toBeDefined();

    // Without capState (totalSteps null) → inactive
    expect(group1.requiredWhen?.({ stepNumber: 1 }, undefined)).toBe(false);
  });

  it("Group 2 requiredWhen is active only when stepNumber > totalSteps", () => {
    const group2 = CONTRACT.outputs[1] as OneOfGroup;
    expect(group2.requiredWhen).toBeDefined();

    // Without capState (totalSteps null) → inactive
    expect(group2.requiredWhen?.({ stepNumber: 4 }, undefined)).toBe(false);
  });

  it("TASK.md has no individual requiredWhen (predicate is at group level)", () => {
    const taskEntry = findOutput(CONTRACT.outputs, "TASK.md");
    expect(taskEntry).toBeDefined();
    expect(taskEntry?.requiredWhen).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// contract.outputs — DECISIONS.md requiredWhen for step > 1
// ---------------------------------------------------------------------------

describe("contract.outputs with DECISIONS_FILE requiredWhen", () => {
  it("excludes DECISIONS.md for stepNumber=1", async () => {
    // Arrange: step 1 should produce only TASK.md
    const params = {
      capability: "evolve-plan" as string,
      goalName: "test-goal",
      stepNumber: 1,
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: contract.outputs has requiredWhen predicate for DECISIONS.md
    const decisionsEntry = findOutput(result!.contract.outputs, "DECISIONS.md");
    expect(decisionsEntry).toBeDefined();
    expect(decisionsEntry?.requiredWhen?.(params)).toBe(false);
  });

  it("includes DECISIONS.md for stepNumber=2", async () => {
    // Arrange: step 2 should include DECISIONS.md alongside TASK.md
    const params = {
      capability: "evolve-plan" as string,
      goalName: "test-goal",
      stepNumber: 2,
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: requiredWhen returns true for step > 1
    const decisionsEntry = findOutput(result!.contract.outputs, "DECISIONS.md");
    expect(decisionsEntry).toBeDefined();
    expect(decisionsEntry?.requiredWhen?.(params)).toBe(true);
  });

  it("includes DECISIONS.md for stepNumber=3", async () => {
    // Arrange: step 3+ should also include DECISIONS.md
    const params = {
      capability: "evolve-plan" as string,
      goalName: "test-goal",
      stepNumber: 3,
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: requiredWhen returns true for step > 1
    const decisionsEntry = findOutput(result!.contract.outputs, "DECISIONS.md");
    expect(decisionsEntry).toBeDefined();
    expect(decisionsEntry?.requiredWhen?.(params)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveEvolveWriteAllowlist — DECISIONS.md for step > 1
// ---------------------------------------------------------------------------

describe("resolveEvolveWriteAllowlist with DECISIONS_FILE", () => {
  it("excludes DECISIONS.md from write allowlist for stepNumber=1", async () => {
    // Arrange: step 1 should not include DECISIONS.md in the write allowlist
    const params = {
      capability: "evolve-plan" as string,
      goalName: "test-goal",
      stepNumber: 1,
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: no DECISIONS.md in the allowlist
    expect(
      result?.writeAllowlist?.some((p) => p.includes("DECISIONS.md")),
    ).toBe(false);
  });

  it("includes DECISIONS.md in write allowlist for stepNumber=2", async () => {
    // Arrange: step 2 should include DECISIONS.md alongside existing entries
    const params = {
      capability: "evolve-plan" as string,
      goalName: "test-goal",
      stepNumber: 2,
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: contains all expected files including DECISIONS.md and REVISE_PLAN_NEEDED.md (workspace root, total length is 4, no TEST.md)
    expect(result?.writeAllowlist).toContain("COMPLETION_SUMMARY.md");
    expect(result?.writeAllowlist).toContain("S02/TASK.md");
    expect(result?.writeAllowlist).not.toContain("S02/TEST.md");
    expect(result?.writeAllowlist).toContain("S02/DECISIONS.md");
    expect(result?.writeAllowlist).toContain("REVISE_PLAN_NEEDED.md");
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
  const stepsYaml = Array.from(
    { length: totalSteps },
    (_, i) => `  - name: step-${i + 1}\n    complexity: task`,
  ).join("\n");
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
    fs.writeFileSync(
      path.join(goalDir, "COMPLETION_SUMMARY.md"),
      "---\nstatus: complete\n---\n# Complete\n",
      "utf-8",
    );
  }

  return goalDir;
}

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

  it("returns error when PLAN.md is missing", async () => {
    // Arrange: goal dir exists but no PLAN.md
    const goalDir = path.join(tempDir, ".pio", "goals", "no-plan");
    fs.mkdirSync(goalDir, { recursive: true });

    const tool = getTool();
    const result = await tool.execute(
      "test-id",
      { workspacePrefix: "goals/no-plan", stepNumber: 1 },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    expect(result.content[0].text).toMatch(/PLAN/i);
  });

  it("enqueues task when PLAN.md exists", async () => {
    createGoalTreeWithFrontmatter(tempDir, "my-feature", 3);

    const tool = getTool();
    const result = await tool.execute(
      "test-id",
      { workspacePrefix: "goals/my-feature", stepNumber: 1 },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    expect(result.content[0].text).toContain("queued");
  });

  it("enqueues task with correct params (workspacePrefix, sessionName, queueKey, stepNumber, initialMessage)", async () => {
    createGoalTreeWithFrontmatter(tempDir, "my-feature", 3);

    const tool = getTool();
    await tool.execute(
      "test-id",
      {
        workspacePrefix: "goals/my-feature",
        stepNumber: 1,
        initialMessage: "test message",
      },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "my-feature");
    expect(task).toBeDefined();
    expect(task?.capability).toBe("evolve-plan");
    expect(task?.params).toHaveProperty("workspacePrefix", "goals/my-feature");
    expect(task?.params).toHaveProperty("sessionName");
    expect(task?.params?.sessionName).toContain("evolve-plan");
    expect(task?.params).toHaveProperty("queueKey", "my-feature");
    expect(task?.params).toHaveProperty("stepNumber");
    expect(task?.params).toHaveProperty("initialMessage");
    expect(task?.params?.initialMessage).toBe("test message");
  });
});

// ---------------------------------------------------------------------------
// Helpers (from predicates.test.ts)
// ---------------------------------------------------------------------------

/**
 * Create a CapState with a PLAN.md input (like evolve-plan CONTRACT).
 * Writes PLAN.md with the given totalSteps.
 */
function makeCapStateWithPlan(
  tempDir: string,
  totalSteps: number,
  params?: Record<string, unknown>,
): CapState {
  const contract: CapabilityContract = {
    inputs: [
      { name: "plan", file: "PLAN.md", schema: PLAN_FRONTMATTER_SCHEMA },
    ],
    outputs: [],
  };

  const stepsYaml = Array.from(
    { length: totalSteps },
    (_, i) => `  - name: step-${i + 1}\n    complexity: task`,
  ).join("\n");
  fs.writeFileSync(
    path.join(tempDir, "PLAN.md"),
    `---\ntotalSteps: ${totalSteps}\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
    "utf-8",
  );

  return new CapState(contract, tempDir, params);
}

/** Create a CapState without PLAN.md (simulates missing PLAN.md). */
function makeCapStateWithoutPlan(
  params?: Record<string, unknown>,
  tempDir = createTempDir(),
): { capState: CapState; tempDir: string } {
  const contract: CapabilityContract = {
    inputs: [
      { name: "plan", file: "PLAN.md", schema: PLAN_FRONTMATTER_SCHEMA },
    ],
    outputs: [],
  };
  return {
    capState: new CapState(contract, tempDir, params),
    tempDir,
  };
}

// ---------------------------------------------------------------------------
// Predicate boundary tests — verify requiredWhen logic for all outputs
// (merged from predicates.test.ts, updated for recursive findOutput + OneOfGroup)
// ---------------------------------------------------------------------------

describe("evolve-plan CONTRACT predicates", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  describe("predicate logic table", () => {
    it("step 1 of 3: Group 1 active, Group 2 inactive, DECISIONS.md not required", () => {
      const capState = makeCapStateWithPlan(tempDir, 3, { stepNumber: 1 });

      const decisionsEntry = findOutput(CONTRACT.outputs, "DECISIONS.md");
      const group1 = CONTRACT.outputs[0] as OneOfGroup;
      const group2 = CONTRACT.outputs[1] as OneOfGroup;

      // Group 1: stepNumber <= totalSteps → active
      expect(group1.requiredWhen?.({ stepNumber: 1 }, capState)).toBe(true);
      // Group 2: stepNumber > totalSteps → inactive
      expect(group2.requiredWhen?.({ stepNumber: 1 }, capState)).toBe(false);
      // DECISIONS.md individual requiredWhen: stepNumber > 1 → false for step 1
      expect(decisionsEntry?.requiredWhen?.({ stepNumber: 1 })).toBe(false);
    });

    it("step 2 of 3: Group 1 active, Group 2 inactive, DECISIONS.md required", () => {
      const capState = makeCapStateWithPlan(tempDir, 3, { stepNumber: 2 });

      const decisionsEntry = findOutput(CONTRACT.outputs, "DECISIONS.md");
      const group1 = CONTRACT.outputs[0] as OneOfGroup;
      const group2 = CONTRACT.outputs[1] as OneOfGroup;

      expect(group1.requiredWhen?.({ stepNumber: 2 }, capState)).toBe(true);
      expect(group2.requiredWhen?.({ stepNumber: 2 }, capState)).toBe(false);
      expect(decisionsEntry?.requiredWhen?.({ stepNumber: 2 })).toBe(true);
    });

    it("step 3 of 3 (last step): Group 1 active, Group 2 inactive, DECISIONS.md required", () => {
      const capState = makeCapStateWithPlan(tempDir, 3, { stepNumber: 3 });

      const decisionsEntry = findOutput(CONTRACT.outputs, "DECISIONS.md");
      const group1 = CONTRACT.outputs[0] as OneOfGroup;
      const group2 = CONTRACT.outputs[1] as OneOfGroup;

      expect(group1.requiredWhen?.({ stepNumber: 3 }, capState)).toBe(true);
      expect(group2.requiredWhen?.({ stepNumber: 3 }, capState)).toBe(false);
      expect(decisionsEntry?.requiredWhen?.({ stepNumber: 3 })).toBe(true);
    });

    it("step 4 of 3 (beyond totalSteps): Group 1 inactive, Group 2 active", () => {
      const capState = makeCapStateWithPlan(tempDir, 3, { stepNumber: 4 });

      const group1 = CONTRACT.outputs[0] as OneOfGroup;
      const group2 = CONTRACT.outputs[1] as OneOfGroup;

      // Group 1: stepNumber <= totalSteps → inactive (4 > 3)
      expect(group1.requiredWhen?.({ stepNumber: 4 }, capState)).toBe(false);
      // Group 2: stepNumber > totalSteps → active (4 > 3)
      expect(group2.requiredWhen?.({ stepNumber: 4 }, capState)).toBe(true);
    });

    it("step 5 of 3 (well beyond totalSteps): Group 1 inactive, Group 2 active", () => {
      const capState = makeCapStateWithPlan(tempDir, 3, { stepNumber: 5 });

      const group1 = CONTRACT.outputs[0] as OneOfGroup;
      const group2 = CONTRACT.outputs[1] as OneOfGroup;

      expect(group1.requiredWhen?.({ stepNumber: 5 }, capState)).toBe(false);
      expect(group2.requiredWhen?.({ stepNumber: 5 }, capState)).toBe(true);
    });
  });

  describe("defensive null handling (PLAN.md missing)", () => {
    it("neither Group 1 nor Group 2 active when PLAN.md can't be read", () => {
      const { capState, tempDir: dir } = makeCapStateWithoutPlan({
        stepNumber: 1,
      });

      const group1 = CONTRACT.outputs[0] as OneOfGroup;
      const group2 = CONTRACT.outputs[1] as OneOfGroup;
      try {
        // Both groups return false when totalSteps is null
        expect(group1.requiredWhen?.({ stepNumber: 1 }, capState)).toBe(false);
        expect(group2.requiredWhen?.({ stepNumber: 1 }, capState)).toBe(false);
      } finally {
        cleanup(dir);
      }
    });

    it("DECISIONS.md requiredWhen still works (stepNumber > 1) regardless of PLAN.md", () => {
      const { tempDir: dir } = makeCapStateWithoutPlan({
        stepNumber: 2,
      });

      const decisionsEntry = findOutput(CONTRACT.outputs, "DECISIONS.md");
      try {
        // DECISIONS.md individual requiredWhen doesn't depend on capState
        expect(decisionsEntry?.requiredWhen?.({ stepNumber: 2 })).toBe(true);
      } finally {
        cleanup(dir);
      }
    });

    it("DECISIONS.md not required for step 1 regardless of PLAN.md", () => {
      const { tempDir: dir } = makeCapStateWithoutPlan({
        stepNumber: 1,
      });

      const decisionsEntry = findOutput(CONTRACT.outputs, "DECISIONS.md");
      try {
        expect(decisionsEntry?.requiredWhen?.({ stepNumber: 1 })).toBe(false);
      } finally {
        cleanup(dir);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// validateOutputs — COMPLETION_SUMMARY.md and REVISE_PLAN_NEEDED.md via OneOfGroup
// (merged from predicates.test.ts, updated for OneOfGroup mutual exclusion)
// ---------------------------------------------------------------------------

describe("validateOutputs — COMPLETION_SUMMARY.md and REVISE_PLAN_NEEDED.md via OneOfGroup", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("passes when stepNumber > totalSteps and COMPLETION_SUMMARY.md exists", () => {
    // Create PLAN.md with totalSteps: 2
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );

    // Create COMPLETION_SUMMARY.md
    fs.writeFileSync(
      path.join(tempDir, "COMPLETION_SUMMARY.md"),
      "---\nstatus: complete\n---\n# Complete\n",
      "utf-8",
    );

    // stepNumber: 3 > totalSteps: 2 → OneOfGroup is required, COMPLETION_SUMMARY.md satisfies it
    const capState = new CapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("passes when stepNumber > totalSteps and REVISE_PLAN_NEEDED.md exists", () => {
    // Create PLAN.md with totalSteps: 2
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );

    // Create REVISE_PLAN_NEEDED.md (alternative to COMPLETION_SUMMARY.md)
    fs.writeFileSync(
      path.join(tempDir, "REVISE_PLAN_NEEDED.md"),
      "---\nreason: additional scope discovered\n---\n# Revision needed\n",
      "utf-8",
    );

    // stepNumber: 3 > totalSteps: 2 → OneOfGroup is required, REVISE_PLAN_NEEDED.md satisfies it
    const capState = new CapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("fails when stepNumber > totalSteps and neither COMPLETION_SUMMARY.md nor REVISE_PLAN_NEEDED.md exists", () => {
    // Create PLAN.md with totalSteps: 2
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );
    // Neither COMPLETION_SUMMARY.md nor REVISE_PLAN_NEEDED.md exists

    const capState = new CapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    // Error should mention the OneOfGroup option names
    expect(result.message).toMatch(/completion-summary|revise-plan/);
  });

  it("stepNumber within range requires TASK.md (not OneOfGroup)", () => {
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );

    // step 1: TASK.md required, OneOfGroup not required
    fs.mkdirSync(path.join(tempDir, "S01"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S01", "TASK.md"),
      "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task\n",
      "utf-8",
    );

    const capState = new CapState(CONTRACT, tempDir, { stepNumber: 1 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("step 1 never requires DECISIONS.md (regression)", () => {
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );

    fs.mkdirSync(path.join(tempDir, "S01"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S01", "TASK.md"),
      "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task\n",
      "utf-8",
    );
    // No DECISIONS.md — should still pass for step 1

    const capState = new CapState(CONTRACT, tempDir, { stepNumber: 1 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("step 2 requires both TASK.md and DECISIONS.md", () => {
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );

    fs.mkdirSync(path.join(tempDir, "S02"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S02", "TASK.md"),
      "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tempDir, "S02", "DECISIONS.md"),
      "content",
      "utf-8",
    );

    const capState = new CapState(CONTRACT, tempDir, { stepNumber: 2 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("step 2 missing DECISIONS.md → failure", () => {
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );

    fs.mkdirSync(path.join(tempDir, "S02"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S02", "TASK.md"),
      "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task\n",
      "utf-8",
    );
    // DECISIONS.md is missing — inner AND-group fails, revise-plan also fails

    const capState = new CapState(CONTRACT, tempDir, { stepNumber: 2 });
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    // Error mentions the OneOfGroup option names ("task + decisions" / "revise-plan")
    expect(result.message).toMatch(/task|decisions|revise-plan/);
  });

  it("step beyond totalSteps does NOT require DECISIONS.md", () => {
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );

    // stepNumber: 3 > totalSteps: 2
    // OneOfGroup should be required, not DECISIONS.md
    fs.writeFileSync(
      path.join(tempDir, "COMPLETION_SUMMARY.md"),
      "---\nstatus: complete\n---\n# Complete\n",
      "utf-8",
    );

    const capState = new CapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });
});
