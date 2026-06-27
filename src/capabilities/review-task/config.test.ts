import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Value from "typebox/value";
import { vi } from "vitest";
import { stepFolderName } from "../../fs-utils";
import { readPendingTask } from "../../queues";
import { applyReviewDecision, postExecuteReview } from "./callbacks";
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

  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("deletes stale APPROVED marker (workspaceDir is already step directory)", () => {
    // Arrange: stepDir/APPROVED present — pass stepDir directly as workspaceDir
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");

    // Act: workspaceDir is already the resolved step directory
    config.prepareSession?.(stepDir, { stepNumber: 1 });

    // Assert
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
  });

  it("deletes stale REJECTED marker", () => {
    // Arrange: stepDir/REJECTED present
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 2 });
    fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");

    // Act
    config.prepareSession?.(stepDir, { stepNumber: 2 });

    // Assert
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("deletes both APPROVED and REJECTED when both exist", () => {
    // Arrange: stepDir/ with both markers
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");

    // Act
    config.prepareSession?.(stepDir, { stepNumber: 1 });

    // Assert
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("does not delete COMPLETED marker", () => {
    // Arrange: stepDir/ with APPROVED and COMPLETED
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");

    // Act
    config.prepareSession?.(stepDir, { stepNumber: 1 });

    // Assert: COMPLETED still exists; APPROVED is gone
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
  });

  it("does not delete REVIEW.md", () => {
    // Arrange: stepDir/ with APPROVED and REVIEW.md
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(
      path.join(stepDir, "REVIEW.md"),
      "some review content",
      "utf-8",
    );

    // Act
    config.prepareSession?.(stepDir, { stepNumber: 1 });

    // Assert: REVIEW.md still exists; APPROVED is gone
    expect(fs.existsSync(path.join(stepDir, "REVIEW.md"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
  });

  it("handles missing markers gracefully (no error)", () => {
    // Arrange: clean step folder with no APPROVED or REJECTED
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });

    // Act & Assert: should not throw
    expect(() => {
      config.prepareSession?.(stepDir, { stepNumber: 1 });
    }).not.toThrow();
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

  it("decision field is anyOf (union) of APPROVED and REJECTED", () => {
    // Act
    const decisionProp = REVIEW_OUTPUT_SCHEMA.properties.decision;

    // Assert
    expect(decisionProp.anyOf).toBeDefined();
    const options = decisionProp.anyOf;
    expect(options).toHaveLength(2);

    const values = options.map((o) => o.const as string).sort();
    expect(values).toEqual(["APPROVED", "REJECTED"]);
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
});

// ---------------------------------------------------------------------------
// applyReviewDecision (moved from validation.ts)
// ---------------------------------------------------------------------------

describe("applyReviewDecision", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("creates APPROVED marker on APPROVED decision (workspaceDir is already step directory)", () => {
    // Arrange: S01 with COMPLETED and REVIEW.md
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "REVIEW.md"), "# Review", "utf-8");

    const outputs: ReviewOutputs = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act: workspaceDir is already the resolved step directory
    applyReviewDecision(stepDir, outputs);

    // Assert
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(true);
  });

  it("creates REJECTED marker and deletes COMPLETED on REJECTED decision", () => {
    // Arrange: S01 with COMPLETED and REVIEW.md
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "REVIEW.md"), "# Review", "utf-8");

    const outputs: ReviewOutputs = {
      decision: "REJECTED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    applyReviewDecision(stepDir, outputs);

    // Assert
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(false);
  });

  it("creates directory if missing (workspaceDir is step directory)", () => {
    // Arrange: workspaceDir doesn't exist yet
    const workspaceDir = path.join(tempDir, "nonexistent");

    const outputs: ReviewOutputs = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act — should not throw even though workspaceDir doesn't exist
    expect(() => {
      applyReviewDecision(workspaceDir, outputs);
    }).not.toThrow();

    // Assert
    expect(fs.existsSync(path.join(workspaceDir, "APPROVED"))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Stale marker cleanup (idempotency)
  // -----------------------------------------------------------------------

  it("APPROVED then REJECTED leaves only REJECTED on disk", () => {
    // Arrange: S01 with no pre-existing markers
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });

    const approved: ReviewOutputs = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };
    const rejected: ReviewOutputs = {
      decision: "REJECTED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act: apply APPROVED first, then REJECTED
    applyReviewDecision(stepDir, approved);
    applyReviewDecision(stepDir, rejected);

    // Assert: only REJECTED exists, no stale APPROVED
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
  });

  it("REJECTED then APPROVED leaves only APPROVED on disk", () => {
    // Arrange: S01 with COMPLETED so REJECTED branch can delete it
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");

    const rejected: ReviewOutputs = {
      decision: "REJECTED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };
    const approved: ReviewOutputs = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act: apply REJECTED first, then APPROVED
    applyReviewDecision(stepDir, rejected);
    applyReviewDecision(stepDir, approved);

    // Assert: only APPROVED exists, no stale REJECTED
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("multiple calls with the same decision are idempotent", () => {
    // Arrange: S01 with no pre-existing markers
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });

    const approved: ReviewOutputs = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act: call twice with APPROVED — should not throw
    expect(() => {
      applyReviewDecision(stepDir, approved);
      applyReviewDecision(stepDir, approved);
    }).not.toThrow();

    // Assert: APPROVED exists exactly once
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("removes both markers when both already coexist", () => {
    // Arrange: S01 with both APPROVED and REJECTED (simulating a prior bug state)
    const { stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");

    const approved: ReviewOutputs = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act: apply APPROVED — should clean up both, then write APPROVED
    applyReviewDecision(stepDir, approved);

    // Assert: only APPROVED exists
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
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
// review-task postExecute — marker creation
// ---------------------------------------------------------------------------

describe("review-task postExecute — marker creation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("valid APPROVED creates APPROVED marker (workspaceDir is step directory)", () => {
    // Arrange: temp goal dir with S01/REVIEW.md containing valid APPROVED frontmatter
    const { stepDir } = createGoalTree(tempDir, "pe-approved", {
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
    config.postExecute?.(stepDir, { stepNumber: 1 });

    // Assert: S01/APPROVED exists, no S01/REJECTED
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("valid REJECTED creates REJECTED marker and deletes COMPLETED", () => {
    // Arrange: temp goal dir with S02/REVIEW.md (REJECTED) and S02/COMPLETED
    const { stepDir } = createGoalTree(tempDir, "pe-rejected", {
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
    config.postExecute?.(stepDir, { stepNumber: 2 });

    // Assert: S02/REJECTED exists, S02/COMPLETED removed
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(false);
  });

  it("handles missing REVIEW.md gracefully (logs warning, no crash)", () => {
    // Arrange: temp goal dir with no REVIEW.md
    const { stepDir } = createGoalTree(tempDir, "pe-missing", {
      stepNumber: 3,
    });

    // Act & Assert: should not throw
    expect(() => {
      postExecuteReview(stepDir, { stepNumber: 3 });
    }).not.toThrow();
  });

  it("handles invalid frontmatter gracefully (logs warning, no crash)", () => {
    // Arrange: REVIEW.md with invalid frontmatter
    const { stepDir } = createGoalTree(tempDir, "pe-invalid", {
      stepNumber: 4,
    });
    fs.writeFileSync(
      path.join(stepDir, "REVIEW.md"),
      "# Review\n\nNo frontmatter.",
      "utf-8",
    );

    // Act & Assert: should not throw
    expect(() => {
      postExecuteReview(stepDir, { stepNumber: 4 });
    }).not.toThrow();
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
