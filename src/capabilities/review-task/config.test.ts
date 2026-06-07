import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Value from "typebox/value";
import config from "./config";
import { isStepReviewable, findMostRecentCompletedStep, applyReviewDecision, validateStepForReview, validateAndFindReviewStep } from "./callbacks";
import { REVIEW_OUTPUT_SCHEMA, type ReviewOutputs } from "./schemas";
import { stepFolderName } from "../../fs-utils";

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
  options?: { steps?: { number: number; files: string[] }[]; stepNumber?: number },
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
        fs.writeFileSync(path.join(currentStepDir, file), `content of ${file}`, "utf-8");
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
    : options?.stepNumber ?? 1;
  const stepsYaml = Array.from({ length: totalSteps }, (_, i) =>
    `  - name: step-${i + 1}\n    complexity: task`,
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
  it("given stepNumber 1, includes DECISIONS.md in readOnlyFiles", () => {
    // Act
    const readOnlyFiles = (config.readOnlyFiles as Function)(
      "/some/workingDir",
      { stepNumber: 1 },
    );

    // Assert
    expect(readOnlyFiles).toContain("S01/DECISIONS.md");
  });

  it("given stepNumber 2, includes DECISIONS.md in readOnlyFiles", () => {
    // Act
    const readOnlyFiles = (config.readOnlyFiles as Function)(
      "/some/workingDir",
      { stepNumber: 2 },
    );

    // Assert
    expect(readOnlyFiles).toContain("S02/DECISIONS.md");
  });

  it("given stepNumber 5, includes DECISIONS.md with zero-padded folder name S05", () => {
    // Act
    const readOnlyFiles = (config.readOnlyFiles as Function)(
      "/some/workingDir",
      { stepNumber: 5 },
    );

    // Assert
    expect(readOnlyFiles).toContain("S05/DECISIONS.md");
    // Verify no under-padded path exists
    expect(readOnlyFiles).not.toContain("S5/DECISIONS.md");
  });
});

// ---------------------------------------------------------------------------
// resolveReviewWriteAllowlist (via config.writeAllowlist)
// ---------------------------------------------------------------------------

describe("resolveReviewWriteAllowlist", () => {
  it("given a step number, should return array containing only REVIEW.md path", () => {
    // Act
    const allowlist = (config.writeAllowlist as Function)(
      "/some/workingDir",
      { stepNumber: 1 },
    );

    // Assert
    expect(allowlist).toHaveLength(1);
    expect(allowlist[0]).toBe("S01/REVIEW.md");
  });

  it("excludes APPROVED from the write allowlist", () => {
    // Act
    const allowlist = (config.writeAllowlist as Function)(
      "/some/workingDir",
      { stepNumber: 3 },
    );

    // Assert
    const hasApproved = allowlist.some((p: string) => p.endsWith("APPROVED"));
    expect(hasApproved).toBe(false);
  });

  it("throws when stepNumber is missing", () => {
    // Act & Assert
    expect(() => {
      (config.writeAllowlist as Function)("/some/workingDir", {});
    }).toThrow(/stepNumber/i);
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

  it("deletes stale APPROVED marker", () => {
    // Arrange: S01/APPROVED present
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");

    // Act
    (config.prepareSession!)(goalDir, { stepNumber: 1 });

    // Assert
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
  });

  it("deletes stale REJECTED marker", () => {
    // Arrange: S02/REJECTED present
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 2 });
    fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");

    // Act
    (config.prepareSession!)(goalDir, { stepNumber: 2 });

    // Assert
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("deletes both APPROVED and REJECTED when both exist", () => {
    // Arrange: S01/ with both markers
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");

    // Act
    (config.prepareSession!)(goalDir, { stepNumber: 1 });

    // Assert
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("does not delete COMPLETED marker", () => {
    // Arrange: S01/ with APPROVED and COMPLETED
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");

    // Act
    (config.prepareSession!)(goalDir, { stepNumber: 1 });

    // Assert: COMPLETED still exists; APPROVED is gone
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
  });

  it("does not delete REVIEW.md", () => {
    // Arrange: S01/ with APPROVED and REVIEW.md
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "REVIEW.md"), "some review content", "utf-8");

    // Act
    (config.prepareSession!)(goalDir, { stepNumber: 1 });

    // Assert: REVIEW.md still exists; APPROVED is gone
    expect(fs.existsSync(path.join(stepDir, "REVIEW.md"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
  });

  it("handles missing markers gracefully (no error)", () => {
    // Arrange: clean step folder with no APPROVED or REJECTED
    const { goalDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });

    // Act & Assert: should not throw
    expect(() => {
      (config.prepareSession!)(goalDir, { stepNumber: 1 });
    }).not.toThrow();
  });

  it("throws when stepNumber is missing from params", () => {
    // Arrange
    const { goalDir } = createGoalTree(tempDir, "test-goal");

    // Act & Assert
    expect(() => {
      (config.prepareSession!)(goalDir, {});
    }).toThrow(/stepNumber/i);
  });

  it("uses zero-padded step folder names", () => {
    // Arrange: S05/ with APPROVED
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 5 });
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");

    // Act
    (config.prepareSession!)(goalDir, { stepNumber: 5 });

    // Assert: S05/APPROVED should be deleted (stepFolderName(5) = "S05")
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);

    // The folder name is S05, not S5 — confirm by checking the path
    const s05Path = path.join(goalDir, "S05");
    expect(s05Path === stepDir).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isStepReviewable — review-readiness gate
// ---------------------------------------------------------------------------

describe("isStepReviewable(goalDir, stepNumber)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("COMPLETED + SUMMARY.md, no BLOCKED → true", () => {
    // Arrange: S01 with COMPLETED and SUMMARY.md, no BLOCKED
    const { goalDir } = createGoalTree(tempDir, "reviewable-goal", {
      steps: [{ number: 1, files: ["COMPLETED", "SUMMARY.md"] }],
    });

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(true);
  });

  it("missing COMPLETED → false", () => {
    // Arrange: S01 with only SUMMARY.md (no COMPLETED marker)
    const { goalDir } = createGoalTree(tempDir, "no-completed-goal", {
      steps: [{ number: 1, files: ["SUMMARY.md"] }],
    });

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("missing SUMMARY.md → false", () => {
    // Arrange: S01 with only COMPLETED (no SUMMARY.md)
    const { goalDir } = createGoalTree(tempDir, "no-summary-goal", {
      steps: [{ number: 1, files: ["COMPLETED"] }],
    });

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("has BLOCKED → false even with COMPLETED + SUMMARY.md", () => {
    // Arrange: S01 with COMPLETED, SUMMARY.md, and BLOCKED
    const { goalDir } = createGoalTree(tempDir, "blocked-review-goal", {
      steps: [{ number: 1, files: ["COMPLETED", "SUMMARY.md", "BLOCKED"] }],
    });

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });

  it("folder does not exist → false", () => {
    // Arrange: goal dir exists but no S01/ subdirectory
    const { goalDir } = createGoalTree(tempDir, "empty-review-goal");

    // Act
    const result = isStepReviewable(goalDir, 1);

    // Assert
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findMostRecentCompletedStep — reverse-scan discovery
// ---------------------------------------------------------------------------

describe("findMostRecentCompletedStep(goalDir)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("no step folders → undefined", () => {
    // Arrange: empty goal directory (no S01/, S02/, etc.)
    const { goalDir } = createGoalTree(tempDir, "empty-goal");

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBeUndefined();
  });

  it("one completed step (S01) → 1", () => {
    // Arrange: S01 with COMPLETED and SUMMARY.md
    const { goalDir } = createGoalTree(tempDir, "single-complete", {
      steps: [{ number: 1, files: ["COMPLETED", "SUMMARY.md"] }],
    });

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(1);
  });

  it("multiple sequential completed steps → returns highest", () => {
    // Arrange: S01 and S02 both reviewable
    const { goalDir } = createGoalTree(tempDir, "multi-complete", {
      steps: [
        { number: 1, files: ["COMPLETED", "SUMMARY.md"] },
        { number: 2, files: ["COMPLETED", "SUMMARY.md"] },
      ],
    });

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(2);
  });

  it("gap in middle — S01 complete, S02 not reviewable → returns 1", () => {
    // Arrange: S01 reviewable, S02 exists but has only specs (no COMPLETED)
    const { goalDir } = createGoalTree(tempDir, "gap-middle", {
      steps: [
        { number: 1, files: ["COMPLETED", "SUMMARY.md"] },
        { number: 2, files: ["TASK.md", "TEST.md"] },
      ],
    });

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(1);
  });

  it("S01 blocked, S02 completed → returns 2", () => {
    // Arrange: S01 has BLOCKED (not reviewable), S02 is reviewable
    const { goalDir } = createGoalTree(tempDir, "blocked-s01", {
      steps: [
        { number: 1, files: ["COMPLETED", "SUMMARY.md", "BLOCKED"] },
        { number: 2, files: ["COMPLETED", "SUMMARY.md"] },
      ],
    });

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(2);
  });

  it("S01 has specs but no COMPLETED, S02 reviewable → returns 2", () => {
    // Arrange: S01 only has specs, S02 is reviewable
    const { goalDir } = createGoalTree(tempDir, "specs-only-s01", {
      steps: [
        { number: 1, files: ["TASK.md", "TEST.md"] },
        { number: 2, files: ["COMPLETED", "SUMMARY.md"] },
      ],
    });

    // Act
    const result = findMostRecentCompletedStep(goalDir);

    // Assert
    expect(result).toBe(2);
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

  it("creates APPROVED marker on APPROVED decision", () => {
    // Arrange: S01 with COMPLETED and REVIEW.md
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "REVIEW.md"), "# Review", "utf-8");

    const outputs: ReviewOutputs = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    applyReviewDecision(goalDir, 1, outputs);

    // Assert
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(true);
  });

  it("creates REJECTED marker and deletes COMPLETED on REJECTED decision", () => {
    // Arrange: S01 with COMPLETED and REVIEW.md
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
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
    applyReviewDecision(goalDir, 1, outputs);

    // Assert
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(false);
  });

  it("handles zero-padded step folder names (step 5 → S05)", () => {
    // Arrange: S05 with COMPLETED
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 5 });
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");

    const outputs: ReviewOutputs = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    applyReviewDecision(goalDir, 5, outputs);

    // Assert: S05/APPROVED exists (not S5/APPROVED)
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    // Verify it's S05, not S5
    const s05Path = path.join(goalDir, "S05", "APPROVED");
    expect(fs.existsSync(s05Path)).toBe(true);
    const s5Path = path.join(goalDir, "S5", "APPROVED");
    expect(fs.existsSync(s5Path)).toBe(false);
  });

  it("creates step directory if missing", () => {
    // Arrange: goal dir exists but no S03/ folder
    const { goalDir } = createGoalTree(tempDir, "test-goal");

    const outputs: ReviewOutputs = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act — should not throw even though S03/ doesn't exist
    expect(() => {
      applyReviewDecision(goalDir, 3, outputs);
    }).not.toThrow();

    // Assert
    expect(fs.existsSync(path.join(goalDir, "S03", "APPROVED"))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Stale marker cleanup (idempotency)
  // -----------------------------------------------------------------------

  it("APPROVED then REJECTED leaves only REJECTED on disk", () => {
    // Arrange: S01 with no pre-existing markers
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });

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
    applyReviewDecision(goalDir, 1, approved);
    applyReviewDecision(goalDir, 1, rejected);

    // Assert: only REJECTED exists, no stale APPROVED
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
  });

  it("REJECTED then APPROVED leaves only APPROVED on disk", () => {
    // Arrange: S01 with COMPLETED so REJECTED branch can delete it
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
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
    applyReviewDecision(goalDir, 1, rejected);
    applyReviewDecision(goalDir, 1, approved);

    // Assert: only APPROVED exists, no stale REJECTED
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("multiple calls with the same decision are idempotent", () => {
    // Arrange: S01 with no pre-existing markers
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });

    const approved: ReviewOutputs = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act: call twice with APPROVED — should not throw
    expect(() => {
      applyReviewDecision(goalDir, 1, approved);
      applyReviewDecision(goalDir, 1, approved);
    }).not.toThrow();

    // Assert: APPROVED exists exactly once
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("removes both markers when both already coexist", () => {
    // Arrange: S01 with both APPROVED and REJECTED (simulating a prior bug state)
    const { goalDir, stepDir } = createGoalTree(tempDir, "test-goal", { stepNumber: 1 });
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
    applyReviewDecision(goalDir, 1, approved);

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

  it("valid APPROVED creates marker and returns success", () => {
    // Arrange: temp goal dir with S01/REVIEW.md containing valid APPROVED frontmatter
    const { goalDir, stepDir } = createGoalTree(tempDir, "pv-approved", { stepNumber: 1 });
    writeReviewMd(stepDir, {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    // Act
    const result = config.postValidate!(goalDir, { stepNumber: 1 });

    // Assert: returns success, S01/APPROVED exists, no S01/REJECTED
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("valid REJECTED creates marker and deletes COMPLETED", () => {
    // Arrange: temp goal dir with S02/REVIEW.md (REJECTED) and S02/COMPLETED
    const { goalDir, stepDir } = createGoalTree(tempDir, "pv-rejected", { stepNumber: 2 });
    writeReviewMd(stepDir, {
      decision: "REJECTED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");

    // Act
    const result = config.postValidate!(goalDir, { stepNumber: 2 });

    // Assert: returns success, S02/REJECTED exists, S02/COMPLETED removed
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(false);
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
    const { goalDir } = createGoalTree(tempDir, "pv-missing", { stepNumber: 3 });

    // Act
    const result = config.postValidate!(goalDir, { stepNumber: 3 });

    // Assert: success is false, message is non-empty
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
    expect(result.message!.length).toBeGreaterThan(0);
  });

  it("REVIEW.md with no frontmatter delimiters returns failure", () => {
    // Arrange: REVIEW.md as plain text without YAML frontmatter
    const { goalDir, stepDir } = createGoalTree(tempDir, "pv-no-delimiters", { stepNumber: 4 });
    fs.writeFileSync(path.join(stepDir, "REVIEW.md"), "# Review\n\nSome review content.", "utf-8");

    // Act
    const result = config.postValidate!(goalDir, { stepNumber: 4 });

    // Assert: success is false, message is defined
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
  });

  it("invalid decision value returns failure with detailed error", () => {
    // Arrange: REVIEW.md with decision: UNKNOWN and valid counts
    const { goalDir, stepDir } = createGoalTree(tempDir, "pv-invalid-decision", { stepNumber: 5 });
    writeReviewMd(stepDir, {
      decision: "UNKNOWN",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    // Act
    const result = config.postValidate!(goalDir, { stepNumber: 5 });

    // Assert: success is false, message contains "decision"
    expect(result.success).toBe(false);
    expect(result.message).toContain("decision");
  });

  it("negative issue count returns failure with detailed error", () => {
    // Arrange: REVIEW.md with criticalIssues: -1
    const { goalDir, stepDir } = createGoalTree(tempDir, "pv-negative-count", { stepNumber: 6 });
    writeReviewMd(stepDir, {
      decision: "APPROVED",
      criticalIssues: -1,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    });

    // Act
    const result = config.postValidate!(goalDir, { stepNumber: 6 });

    // Assert: success is false, message contains "criticalIssues"
    expect(result.success).toBe(false);
    expect(result.message).toContain("criticalIssues");
  });
});

// ---------------------------------------------------------------------------
// review-task postValidate — missing stepNumber
// ---------------------------------------------------------------------------

describe("review-task postValidate — missing stepNumber", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("throws when stepNumber is missing", () => {
    // Arrange: call with empty params {}
    const { goalDir } = createGoalTree(tempDir, "pv-no-step");

    // Act & Assert: throws an error mentioning "stepNumber"
    expect(() => {
      config.postValidate!(goalDir, {});
    }).toThrow(/stepNumber/i);
  });
});

// ---------------------------------------------------------------------------
// validateStepForReview — pre-launch validation
// ---------------------------------------------------------------------------

describe("validateStepForReview — pre-launch validation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns ready: true when GOAL.md, PLAN.md, S01/COMPLETED, and S01/SUMMARY.md exist", async () => {
    const { goalDir } = createGoalTree(tempDir, "reviewable-goal", {
      steps: [{ number: 1, files: ["TASK.md", "COMPLETED", "SUMMARY.md"] }],
    });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");

    // Act
    const result = await validateStepForReview("reviewable-goal", tempDir, 1);

    // Assert
    expect(result.ready).toBe(true);
    if (result.ready) {
      expect(result.stepNumber).toBe(1);
    }
  });

  it("returns error when GOAL.md is missing", async () => {
    // Arrange: goal dir with PLAN.md but no GOAL.md
    const goalDir = path.join(tempDir, ".pio", "goals", "no-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan\n", "utf-8");
    const s01Dir = path.join(goalDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(path.join(s01Dir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(s01Dir, "SUMMARY.md"), "# Summary\n", "utf-8");

    // Act
    const result = await validateStepForReview("no-goal", tempDir, 1);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/GOAL\.md/i);
    }
  });

  it("returns error when S01/COMPLETED is missing", async () => {
    // Arrange: goal dir with GOAL.md, PLAN.md, S01/SUMMARY.md but no S01/COMPLETED
    const goalDir = path.join(tempDir, ".pio", "goals", "no-completed");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan\n", "utf-8");
    const s01Dir = path.join(goalDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(path.join(s01Dir, "SUMMARY.md"), "# Summary\n", "utf-8");

    // Act
    const result = await validateStepForReview("no-completed", tempDir, 1);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/COMPLETED/i);
    }
  });

  it("returns error when S01/SUMMARY.md is missing", async () => {
    // Arrange: goal dir with GOAL.md, PLAN.md, S01/COMPLETED but no S01/SUMMARY.md
    const goalDir = path.join(tempDir, ".pio", "goals", "no-summary");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan\n", "utf-8");
    const s01Dir = path.join(goalDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(path.join(s01Dir, "COMPLETED"), "", "utf-8");

    // Act
    const result = await validateStepForReview("no-summary", tempDir, 1);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/SUMMARY\.md/i);
    }
  });
});

// ---------------------------------------------------------------------------
// validateAndFindReviewStep — pre-launch validation
// ---------------------------------------------------------------------------

describe("validateAndFindReviewStep — pre-launch validation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns ready: true when GOAL.md, PLAN.md, S01/COMPLETED, and S01/SUMMARY.md exist", async () => {
    const { goalDir } = createGoalTree(tempDir, "reviewable-goal", {
      steps: [{ number: 1, files: ["TASK.md", "COMPLETED", "SUMMARY.md"] }],
    });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");

    // Act
    const result = await validateAndFindReviewStep("reviewable-goal", tempDir);

    // Assert
    expect(result.ready).toBe(true);
    if (result.ready) {
      expect(result.stepNumber).toBe(1);
    }
  });

  it("returns error when GOAL.md is missing", async () => {
    // Arrange: goal dir with PLAN.md but no GOAL.md
    const goalDir = path.join(tempDir, ".pio", "goals", "no-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan\n", "utf-8");
    const s01Dir = path.join(goalDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(path.join(s01Dir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(s01Dir, "SUMMARY.md"), "# Summary\n", "utf-8");

    // Act
    const result = await validateAndFindReviewStep("no-goal", tempDir);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/GOAL\.md/i);
    }
  });

  it("returns error when goal workspace does not exist", async () => {
    // Act
    const result = await validateAndFindReviewStep("nonexistent", tempDir);

    // Assert
    expect(result.ready).toBe(false);
    if (!result.ready) {
      expect(result.error).toMatch(/does not exist/i);
    }
  });
});
