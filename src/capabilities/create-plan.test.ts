import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CAPABILITY_CONFIG } from "./create-plan";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-create-plan-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

/**
 * Create a minimal goal workspace tree with GOAL.md and PLAN.md.
 * PLAN.md content is customizable via the planContent parameter.
 */
function createGoalTree(
  tempDir: string,
  goalName: string,
  planContent: string,
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  // GOAL.md is required for goal workspace validity
  fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n\nTest goal.", "utf-8");

  // Write PLAN.md with the provided content
  fs.writeFileSync(path.join(goalDir, "PLAN.md"), planContent, "utf-8");

  return goalDir;
}

/**
 * Helper to generate PLAN.md content with frontmatter and step headings.
 */
function makePlanContent(totalSteps: number, headingCount: number): string {
  const frontmatter = `---\ntotalSteps: ${totalSteps}\n---`;
  const title = "# Plan: Test Goal";
  const headings = Array.from({ length: headingCount }, (_, i) => `## Step ${i + 1}: Step description`).join("\n");
  return `${frontmatter}\n${title}\n\n${headings}`;
}

// ---------------------------------------------------------------------------
// postValidateCreatePlan — valid frontmatter and matching headings
// ---------------------------------------------------------------------------

describe("postValidateCreatePlan — valid frontmatter and matching headings", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns success when totalSteps matches heading count (3 steps)", () => {
    // Arrange: PLAN.md with totalSteps: 3 and exactly 3 headings
    const goalDir = createGoalTree(tempDir, "valid-3", makePlanContent(3, 3));

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result).toEqual({ success: true });
  });

  it("returns success when totalSteps matches heading count (1 step)", () => {
    // Arrange: PLAN.md with totalSteps: 1 and exactly 1 heading
    const goalDir = createGoalTree(tempDir, "valid-1", makePlanContent(1, 1));

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result).toEqual({ success: true });
  });

  it("returns success with large step numbers (e.g. 12 steps)", () => {
    // Arrange: PLAN.md with totalSteps: 12 and exactly 12 headings
    const goalDir = createGoalTree(tempDir, "valid-12", makePlanContent(12, 12));

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// postValidateCreatePlan — missing or malformed frontmatter
// ---------------------------------------------------------------------------

describe("postValidateCreatePlan — missing or malformed frontmatter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns failure when PLAN.md has no frontmatter", () => {
    // Arrange: PLAN.md starts directly with title (no --- delimiters)
    const planContent = "# Plan: Test Goal\n\n## Step 1: Description";
    const goalDir = createGoalTree(tempDir, "no-frontmatter", planContent);

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/frontmatter/i);
  });

  it("returns failure when frontmatter YAML is malformed", () => {
    // Arrange: Invalid YAML (no colon — not valid YAML)
    const planContent = "---\ntotalSteps\n---\n# Plan: Test Goal";
    const goalDir = createGoalTree(tempDir, "malformed-yaml", planContent);

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result.success).toBe(false);
    expect(result.message).toBeDefined();
    expect(result.message!).toMatch(/frontmatter|pars/i);
  });

  it("returns failure when frontmatter block has no closing delimiter", () => {
    // Arrange: Opening --- but no closing ---
    const planContent = "---\ntotalSteps: 3\n# Plan: Test Goal";
    const goalDir = createGoalTree(tempDir, "no-closing", planContent);

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// postValidateCreatePlan — invalid totalSteps value
// ---------------------------------------------------------------------------

describe("postValidateCreatePlan — invalid totalSteps value", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns failure when totalSteps is missing", () => {
    // Arrange: Frontmatter with otherField but no totalSteps
    const planContent = "---\notherField: value\n---\n# Plan: Test Goal";
    const goalDir = createGoalTree(tempDir, "missing-totalSteps", planContent);

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result.success).toBe(false);
    expect(result.message).toContain("totalSteps");
  });

  it("returns failure when totalSteps is zero", () => {
    // Arrange: totalSteps: 0 (below minimum of 1)
    const planContent = "---\ntotalSteps: 0\n---\n# Plan: Test Goal";
    const goalDir = createGoalTree(tempDir, "zero-totalSteps", planContent);

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result.success).toBe(false);
  });

  it("returns failure when totalSteps is negative", () => {
    // Arrange: totalSteps: -1
    const planContent = "---\ntotalSteps: -1\n---\n# Plan: Test Goal";
    const goalDir = createGoalTree(tempDir, "negative-totalSteps", planContent);

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result.success).toBe(false);
  });

  it("returns failure when totalSteps is a float", () => {
    // Arrange: totalSteps: 3.5 (not an integer)
    const planContent = "---\ntotalSteps: 3.5\n---\n# Plan: Test Goal";
    const goalDir = createGoalTree(tempDir, "float-totalSteps", planContent);

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result.success).toBe(false);
  });

  it("returns failure when totalSteps is a string", () => {
    // Arrange: totalSteps: "three" (string instead of integer)
    const planContent = '---\ntotalSteps: "three"\n---\n# Plan: Test Goal';
    const goalDir = createGoalTree(tempDir, "string-totalSteps", planContent);

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// postValidateCreatePlan — totalSteps vs heading count mismatch
// ---------------------------------------------------------------------------

describe("postValidateCreatePlan — totalSteps vs heading count mismatch", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns failure when totalSteps > actual heading count", () => {
    // Arrange: totalSteps: 5 but only 2 headings
    const goalDir = createGoalTree(tempDir, "too-many", makePlanContent(5, 2));

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result.success).toBe(false);
    expect(result.message).toContain("5");
    expect(result.message).toContain("2");
  });

  it("returns failure when totalSteps < actual heading count", () => {
    // Arrange: totalSteps: 2 but 5 headings
    const goalDir = createGoalTree(tempDir, "too-few", makePlanContent(2, 5));

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result.success).toBe(false);
    expect(result.message).toContain("2");
    expect(result.message).toContain("5");
  });

  it("returns failure when there are zero headings but totalSteps is positive", () => {
    // Arrange: totalSteps: 3 and no ## Step N: headings at all
    const planContent = "---\ntotalSteps: 3\n---\n# Plan: Test Goal\n\nNo step headings here.";
    const goalDir = createGoalTree(tempDir, "zero-headings", planContent);

    // Act
    const result = CAPABILITY_CONFIG.postValidate!(goalDir);

    // Assert
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// postValidateCreatePlan — CAPABILITY_CONFIG wiring
// ---------------------------------------------------------------------------

describe("postValidateCreatePlan — CAPABILITY_CONFIG wiring", () => {
  it("postValidate is defined on CAPABILITY_CONFIG", () => {
    // Act & Assert
    expect(typeof CAPABILITY_CONFIG.postValidate).toBe("function");
  });
});
