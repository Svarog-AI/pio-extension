import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Value from "typebox/value";
import { vi } from "vitest";
import { stepFolderName } from "../../fs-utils";
import { readPendingTask } from "../../queues";
import config, { register } from "./config";
import { REVIEW_OUTPUT_SCHEMA, type ReviewOutputs } from "./schemas";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers (unified across merged sources)
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-review-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Unified helper supporting both patterns:
// - Multi-step with files array (from step-discovery tests)
// - Single step (from review-task-config tests)
function createGoalTree(
  tempDir: string,
  goalName: string,
  options?: {
    steps?: { number: number; files: string[] }[];
    stepNumber?: number;
  },
): { goalDir: string; stepDir: string } {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  let stepDir = "";

  // Multi-step mode (from step-discovery tests)
  if (options?.steps) {
    for (const step of options.steps) {
      const folderName = stepFolderName(step.number);
      const currentStepDir = path.join(goalDir, folderName);
      fs.mkdirSync(currentStepDir, { recursive: true });
      for (const file of step.files) {
        fs.writeFileSync(
          path.join(currentStepDir, file),
          `content of ${file}`,
          "utf-8",
        );
      }
    }
  }

  // Single-step mode (from review-task-config tests)
  if (options?.stepNumber != null) {
    const folderName = stepFolderName(options.stepNumber);
    stepDir = path.join(goalDir, folderName);
    fs.mkdirSync(stepDir, { recursive: true });
  }

  // Write PLAN.md with steps array so GoalState.steps() can derive from frontmatter
  const totalSteps = options?.steps
    ? Math.max(...options.steps.map((s) => s.number))
    : (options?.stepNumber ?? 1);
  const stepsYaml = Array.from(
    { length: totalSteps },
    (_, i) => `  - name: step-${i + 1}\n    complexity: task`,
  ).join("\n");
  fs.writeFileSync(
    path.join(goalDir, "PLAN.md"),
    `---\ntotalSteps: ${totalSteps}\nsteps:\n${stepsYaml}\n---\n# Plan`,
    "utf-8",
  );

  return { goalDir, stepDir };
}

// ---------------------------------------------------------------------------
// resolveReviewReadOnlyFiles (via config.readOnlyFiles)
// ---------------------------------------------------------------------------

describe("resolveReviewReadOnlyFiles", () => {
  it("given stepNumber 1, includes DECISIONS.md in readOnlyFiles (plain name)", () => {
    // Act
    const readOnlyFiles = (config.readOnlyFiles as Function)(
      "/some/workspaceDir",
      { stepNumber: 1 },
    );

    // Assert: plain names — workspacePrefix handles step folder resolution
    expect(readOnlyFiles).toContain("DECISIONS.md");
    expect(readOnlyFiles).toContain("TASK.md");
    expect(readOnlyFiles).toContain("TEST.md");
    expect(readOnlyFiles).toContain("SUMMARY.md");
    // GOAL.md and PLAN.md are no longer inputs (removed in Step 10)
    expect(readOnlyFiles).not.toContain("GOAL.md");
    expect(readOnlyFiles).not.toContain("PLAN.md");
  });
});

// ---------------------------------------------------------------------------
// resolveReviewWriteAllowlist (via config.writeAllowlist)
// ---------------------------------------------------------------------------

describe("resolveReviewWriteAllowlist", () => {
  it("given a step number, should return array containing only REVIEW.md (plain name)", () => {
    // Act
    const allowlist = (config.writeAllowlist as Function)(
      "/some/workspaceDir",
      { stepNumber: 1 },
    );

    // Assert: plain name — workspacePrefix handles step folder resolution
    expect(allowlist).toHaveLength(1);
    expect(allowlist[0]).toBe("REVIEW.md");
  });

  it("excludes APPROVED from the write allowlist", () => {
    // Act
    const allowlist = (config.writeAllowlist as Function)(
      "/some/workspaceDir",
      { stepNumber: 3 },
    );

    // Assert
    const hasApproved = allowlist.some((p: string) => p.endsWith("APPROVED"));
    expect(hasApproved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// prepareSession
// ---------------------------------------------------------------------------

describe("config.prepareSession", () => {
  // Basic existence check — no filesystem needed.
  it("should be defined as a function", () => {
    expect(typeof config.prepareSession).toBe("function");
  });

  it("does not manually delete markers (framework cleanupMarkers handles it)", () => {
    // prepareSession no longer contains fs.rmSync calls for APPROVED/REJECTED.
    // The framework cleanupMarkers() handles marker deletion at session startup.
    expect(config.prepareSession).toBeDefined();
    // Verify prepareSession doesn't reference rmSync by checking the function string
    const fnStr = config.prepareSession?.toString() ?? "";
    expect(fnStr).not.toContain("rmSync");
  });

  it("still merges skills from TASK.md", () => {
    // Arrange: stepDir with TASK.md containing skills
    const tempDir = createTempDir();
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task",
      "utf-8",
    );

    // Act & Assert: should not throw
    expect(() => {
      config.prepareSession?.(stepDir, { stepNumber: 1 });
    }).not.toThrow();

    cleanup(tempDir);
  });
});

// ---------------------------------------------------------------------------
// Schema exports from frontmatter-schemas.ts
// ---------------------------------------------------------------------------

describe("frontmatter-schemas exports", () => {
  it("REVIEW_OUTPUT_SCHEMA is exported from frontmatter-schemas module", () => {
    // This import is from frontmatter-schemas.ts (not review-task.ts)
    // Verifies the extraction is correct and no circular dependency exists
    expect(REVIEW_OUTPUT_SCHEMA).toBeDefined();
    expect(REVIEW_OUTPUT_SCHEMA.type).toBe("object");
  });

  it("ReviewOutputs type is accessible from frontmatter-schemas module", () => {
    // Arrange — a valid object that should satisfy ReviewOutputs at compile time
    const validOutputs: ReviewOutputs = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Assert — if this compiles, the type is correct
    expect(validOutputs.decision).toBe("APPROVED");
  });
});

// ---------------------------------------------------------------------------
// REVIEW_OUTPUT_SCHEMA (typebox-based)
// ---------------------------------------------------------------------------

describe("REVIEW_OUTPUT_SCHEMA", () => {
  it("is a typebox schema object with correct structure", () => {
    // Act & Assert
    expect(REVIEW_OUTPUT_SCHEMA.type).toBe("object");
    expect(REVIEW_OUTPUT_SCHEMA.required).toEqual([
      "decision",
      "criticalIssues",
      "highIssues",
      "mediumIssues",
      "lowIssues",
    ]);
  });

  it("decision field is anyOf (union) of APPROVED, REJECTED, and BLOCKED", () => {
    // Act
    const decisionProp = REVIEW_OUTPUT_SCHEMA.properties.decision;

    // Assert
    expect(decisionProp.anyOf).toBeDefined();
    const options = decisionProp.anyOf;
    expect(options).toHaveLength(3);

    const values = options.map((o) => o.const as string).sort();
    expect(values).toEqual(["APPROVED", "BLOCKED", "REJECTED"]);
  });

  it("count fields are integer type with minimum 0", () => {
    // Arrange
    const props = REVIEW_OUTPUT_SCHEMA.properties;

    // Act & Assert — check each count field individually
    // Cast to access runtime JSON Schema properties (minimum is in schema but not in TInteger type)
    const asSchema = (p: unknown) => p as { type: string; minimum?: number };

    expect(asSchema(props.criticalIssues).type).toBe("integer");
    expect(asSchema(props.criticalIssues).minimum).toBe(0);
    expect(asSchema(props.highIssues).type).toBe("integer");
    expect(asSchema(props.highIssues).minimum).toBe(0);
    expect(asSchema(props.mediumIssues).type).toBe("integer");
    expect(asSchema(props.mediumIssues).minimum).toBe(0);
    expect(asSchema(props.lowIssues).type).toBe("integer");
    expect(asSchema(props.lowIssues).minimum).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ReviewOutputs type derived from schema
// ---------------------------------------------------------------------------

describe("ReviewOutputs", () => {
  it("is exported and matches the schema structure", () => {
    // Arrange — a valid object that should satisfy ReviewOutputs at compile time
    const validOutputs: ReviewOutputs = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Assert — if this compiles, the type is correct
    expect(validOutputs.decision).toBe("APPROVED");
    expect(validOutputs.criticalIssues).toBe(0);
  });

  it("accepts BLOCKED decision at compile time", () => {
    // Arrange — a valid object with BLOCKED decision
    const blockedOutputs: ReviewOutputs = {
      decision: "BLOCKED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Assert — if this compiles, the type accepts BLOCKED
    expect(blockedOutputs.decision).toBe("BLOCKED");
  });
});

// ---------------------------------------------------------------------------
// REVIEW_OUTPUT_SCHEMA runtime validation (typebox/value integration)
// ---------------------------------------------------------------------------

describe("REVIEW_OUTPUT_SCHEMA runtime validation", () => {
  it("Value.Check returns true for valid frontmatter", () => {
    // Arrange
    const validData = {
      decision: "APPROVED" as const,
      criticalIssues: 0,
      highIssues: 1,
      mediumIssues: 2,
      lowIssues: 3,
    };

    // Act
    const result = Value.Check(REVIEW_OUTPUT_SCHEMA, validData);

    // Assert
    expect(result).toBe(true);
  });

  it("Value.Check returns true for BLOCKED decision", () => {
    // Arrange
    const blockedData = {
      decision: "BLOCKED" as const,
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    const result = Value.Check(REVIEW_OUTPUT_SCHEMA, blockedData);

    // Assert
    expect(result).toBe(true);
  });

  it("Value.Check returns false for invalid decision", () => {
    // Arrange
    const invalidData = {
      decision: "PENDING",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    const result = Value.Check(REVIEW_OUTPUT_SCHEMA, invalidData);

    // Assert
    expect(result).toBe(false);
  });

  it("Value.Check returns false for negative count", () => {
    // Arrange
    const invalidData = {
      decision: "APPROVED" as const,
      criticalIssues: -1,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    const result = Value.Check(REVIEW_OUTPUT_SCHEMA, invalidData);

    // Assert — verifies { minimum: 0 } constraint works at runtime
    expect(result).toBe(false);
  });

  it("Value.Errors provides error details on failure", () => {
    // Arrange
    const invalidData = {
      decision: "INVALID",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    const errors = [...Value.Errors(REVIEW_OUTPUT_SCHEMA, invalidData)];

    // Assert
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Helper: write a REVIEW.md with YAML frontmatter
// ---------------------------------------------------------------------------

function writeReviewMd(
  stepDir: string,
  frontmatter: Record<string, unknown>,
  body?: string,
): void {
  const yamlLines = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  const content = `---\n${yamlLines}\n---\n${body ?? "# Review"}`;
  fs.writeFileSync(path.join(stepDir, "REVIEW.md"), content, "utf-8");
}

// ---------------------------------------------------------------------------
// review-task postValidate — valid frontmatter
// ---------------------------------------------------------------------------

describe("review-task postValidate — valid frontmatter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("valid APPROVED returns success without creating markers (workspaceDir is step directory)", () => {
    // Arrange: temp goal dir with S01/REVIEW.md containing valid APPROVED frontmatter
    const { stepDir } = createGoalTree(tempDir, "pv-approved", {
      stepNumber: 1,
    });
    writeReviewMd(stepDir, {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    // Act: workspaceDir is already the resolved step directory
    const result = config.postValidate?.(stepDir, { stepNumber: 1 });

    // Assert: returns success, NO markers created (that's postExecute's job)
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("valid REJECTED returns success without creating markers", () => {
    // Arrange: temp goal dir with S02/REVIEW.md (REJECTED) and S02/COMPLETED
    const { stepDir } = createGoalTree(tempDir, "pv-rejected", {
      stepNumber: 2,
    });
    writeReviewMd(stepDir, {
      decision: "REJECTED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");

    // Act
    const result = config.postValidate?.(stepDir, { stepNumber: 2 });

    // Assert: returns success, NO markers created, COMPLETED still exists
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(true);
  });

  it("valid BLOCKED returns success without creating markers", () => {
    // Arrange: temp goal dir with S03/REVIEW.md (BLOCKED)
    const { stepDir } = createGoalTree(tempDir, "pv-blocked", {
      stepNumber: 3,
    });
    writeReviewMd(stepDir, {
      decision: "BLOCKED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    // Act
    const result = config.postValidate?.(stepDir, { stepNumber: 3 });

    // Assert: returns success, NO markers created (framework handles markers)
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "BLOCKED"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// review-task postValidate — missing or invalid frontmatter
// ---------------------------------------------------------------------------

describe("review-task postValidate — missing or invalid frontmatter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("missing REVIEW.md returns failure with error message", () => {
    // Arrange: temp dir with no REVIEW.md in step folder
    const { stepDir } = createGoalTree(tempDir, "pv-missing", {
      stepNumber: 3,
    });

    // Act
    const result = config.postValidate?.(stepDir, { stepNumber: 3 });

    // Assert: success is false, message is non-empty
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
    expect(result.message?.length).toBeGreaterThan(0);
  });

  it("REVIEW.md with no frontmatter delimiters returns failure", () => {
    // Arrange: REVIEW.md as plain text without YAML frontmatter
    const { stepDir } = createGoalTree(tempDir, "pv-no-delimiters", {
      stepNumber: 4,
    });
    fs.writeFileSync(
      path.join(stepDir, "REVIEW.md"),
      "# Review\n\nSome review content.",
      "utf-8",
    );

    // Act
    const result = config.postValidate?.(stepDir, { stepNumber: 4 });

    // Assert: success is false, message is defined
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  it("invalid decision value returns failure with detailed error", () => {
    // Arrange: REVIEW.md with decision: UNKNOWN and valid counts
    const { stepDir } = createGoalTree(tempDir, "pv-invalid-decision", {
      stepNumber: 5,
    });
    writeReviewMd(stepDir, {
      decision: "UNKNOWN",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    // Act
    const result = config.postValidate?.(stepDir, { stepNumber: 5 });

    // Assert: success is false, message contains "decision"
    expect(result.success).toBe(false);
    expect(result.message).toContain("decision");
  });

  it("negative issue count returns failure with detailed error", () => {
    // Arrange: REVIEW.md with criticalIssues: -1
    const { stepDir } = createGoalTree(tempDir, "pv-negative-count", {
      stepNumber: 6,
    });
    writeReviewMd(stepDir, {
      decision: "APPROVED",
      criticalIssues: -1,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    // Act
    const result = config.postValidate?.(stepDir, { stepNumber: 6 });

    // Assert: success is false, message contains "criticalIssues"
    expect(result.success).toBe(false);
    expect(result.message).toContain("criticalIssues");
  });
});

// ---------------------------------------------------------------------------
// review-task has no postExecute (markers handled by framework)
// ---------------------------------------------------------------------------

describe("review-task declarative markers", () => {
  it("config has no postExecute callback (markers via contract.markers)", () => {
    expect((config as Record<string, unknown>).postExecute).toBeUndefined();
  });

  it("contract has markers declaration with correct values", () => {
    expect(config.contract.markers).toBeDefined();
    expect(config.contract.markers).toHaveLength(1);
    const marker = config.contract.markers![0];
    expect(marker.outputFile).toBe("review");
    expect(marker.field).toBe("decision");
    expect(marker.values).toEqual({
      APPROVED: "APPROVED",
      REJECTED: "REJECTED",
      BLOCKED: "BLOCKED",
    });
  });
});

// ---------------------------------------------------------------------------
// Tool execute — pio_review_task
// ---------------------------------------------------------------------------

describe("reviewTaskTool.execute", () => {
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

  it("enqueues task even when COMPLETED is missing (validation moves to launch time)", async () => {
    // Arrange: goal dir exists but no COMPLETED in S01
    const { goalDir, stepDir } = createGoalTree(tempDir, "no-completed", {
      stepNumber: 1,
    });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal", "utf-8");
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task",
      "utf-8",
    );
    // Don't create COMPLETED

    const tool = getTool();
    const result = await tool.execute(
      "test-id",
      { workspacePrefix: "goals/no-completed/S01" },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    // Tool enqueues successfully — validation happens at /pio-next-task launch time
    expect(result.content[0].text).toContain("Review queued");
  });

  it("enqueues task with correct params (workspacePrefix, sessionName, queueKey, initialMessage)", async () => {
    // Arrange: goal dir with COMPLETED and SUMMARY.md in S01
    const { goalDir, stepDir } = createGoalTree(tempDir, "my-feature", {
      stepNumber: 1,
    });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal", "utf-8");
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "SUMMARY.md"), "# Summary", "utf-8");
    fs.writeFileSync(
      path.join(stepDir, "TASK.md"),
      "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task",
      "utf-8",
    );

    const tool = getTool();
    await tool.execute(
      "test-id",
      {
        workspacePrefix: "goals/my-feature/S01",
        initialMessage: "test message",
      },
      undefined,
      undefined,
      makeCtx(tempDir),
    );

    const task = readPendingTask(tempDir, "S01");
    expect(task).toBeDefined();
    expect(task?.capability).toBe("review-task");
    expect(task?.params).toHaveProperty(
      "workspacePrefix",
      "goals/my-feature/S01",
    );
    expect(task?.params).toHaveProperty("sessionName");
    expect(task?.params?.sessionName).toContain("review-task");
    expect(task?.params).toHaveProperty("queueKey", "S01");
    expect(task?.params).toHaveProperty("initialMessage");
    expect(task?.params?.initialMessage).toBe("test message");
  });
});
