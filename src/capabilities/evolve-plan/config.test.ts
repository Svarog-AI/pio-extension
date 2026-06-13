import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { validateOutputs } from "../../guards/validation";
import { resolveCapabilityConfig } from "../../capability-config";
import { validateEvolveStep } from "./callbacks";
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

// Create a minimal goal directory tree with PLAN.md and optional COMPLETED marker.
function createGoalTree(
  tempDir: string,
  goalName: string,
  options?: { withCompleted?: boolean; planContent?: string },
): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  // Always create PLAN.md
  fs.writeFileSync(
    path.join(goalDir, "PLAN.md"),
    options?.planContent || "# Plan\n\n### Step 1: Test step\n",
    "utf-8",
  );

  // Optionally create COMPLETED marker
  if (options?.withCompleted) {
    fs.writeFileSync(path.join(goalDir, "COMPLETED"), "", "utf-8");
  }

  return goalDir;
}

// ---------------------------------------------------------------------------
// validateOutputs — COMPLETED short-circuit at baseDir
// ---------------------------------------------------------------------------

describe("validateOutputs with COMPLETED at baseDir", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("passes when COMPLETED exists, even if other expected files are missing", () => {
    // Arrange: temp dir with COMPLETED file but no TASK.md/TEST.md
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "TASK.md" }, { file: "TEST.md" }],
    };

    // Act
    const result = validateOutputs(contract, tempDir);

    // Assert
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("passes when COMPLETED is the only expected file and it exists", () => {
    // Arrange: temp dir with COMPLETED
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "COMPLETED" }],
    };

    // Act
    const result = validateOutputs(contract, tempDir);

    // Assert
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("fails normally when COMPLETED does not exist and expected files are missing", () => {
    // Arrange: temp dir with no COMPLETED, no TASK.md
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "TASK.md" }],
    };

    // Act
    const result = validateOutputs(contract, tempDir);

    // Assert
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("TASK.md");
  });

  it("does not match COMPLETED in a subfolder", () => {
    // Arrange: temp dir with S01/COMPLETED but no COMPLETED at root
    const s01Dir = path.join(tempDir, "S01");
    fs.mkdirSync(s01Dir, { recursive: true });
    fs.writeFileSync(path.join(s01Dir, "COMPLETED"), "", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "S01/TASK.md" }],
    };

    // Act
    const result = validateOutputs(contract, tempDir);

    // Assert: fails normally (short-circuit only for baseDir/COMPLETED, not subfolder)
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("S01/TASK.md");
  });
});

// ---------------------------------------------------------------------------
// resolveEvolveWriteAllowlist — always includes COMPLETED
// ---------------------------------------------------------------------------

describe("resolveEvolveWriteAllowlist", () => {
  it("always includes COMPLETED alongside step-folder paths", async () => {
    // Arrange: resolve evolve-plan config with stepNumber 2
    const params = { capability: "evolve-plan" as string, goalName: "my-feature", stepNumber: 2 };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: writeAllowlist contains COMPLETED, S02/TASK.md (no TEST.md)
    expect(result!.writeAllowlist).toContain("COMPLETED");
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
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 1 };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: writeAllowlist contains S01/REVISE_PLAN_NEEDED
    expect(result?.writeAllowlist).toContain("S01/REVISE_PLAN_NEEDED");
  });

  it("includes S03/REVISE_PLAN_NEEDED in write allowlist for stepNumber=3", async () => {
    // Arrange: resolve evolve-plan config with stepNumber 3
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 3 };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: writeAllowlist contains S03/REVISE_PLAN_NEEDED
    expect(result?.writeAllowlist).toContain("S03/REVISE_PLAN_NEEDED");
  });

  it("marker path uses correct step folder naming (zero-padded)", async () => {
    // Arrange: resolve evolve-plan config with stepNumber 12
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 12 };

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
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 2 };

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
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 1 };

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
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 2 };

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
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 3 };

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
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 1 };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: no DECISIONS.md in the allowlist
    expect(result?.writeAllowlist?.some((p) => p.includes("DECISIONS.md"))).toBe(false);
  });

  it("includes DECISIONS.md in write allowlist for stepNumber=2", async () => {
    // Arrange: step 2 should include DECISIONS.md alongside existing entries
    const params = { capability: "evolve-plan" as string, goalName: "test-goal", stepNumber: 2 };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: contains all expected files including DECISIONS.md and REVISE_PLAN_NEEDED (total length is 4, no TEST.md)
    expect(result?.writeAllowlist).toContain("COMPLETED");
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
    withCompleted?: boolean;
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

  // Optionally create COMPLETED marker
  if (options?.withCompleted) {
    fs.writeFileSync(path.join(goalDir, "COMPLETED"), "", "utf-8");
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

  it("resolves goal directory and returns ready with stepNumber", async () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "my-goal");
    fs.mkdirSync(goalDir, { recursive: true });

    const result = await validateEvolveStep("my-goal", tempDir, 3);

    expect(result.ready).toBe(true);
    if (result.ready) {
      expect(result.goalDir).toBe(goalDir);
      expect(result.stepNumber).toBe(3);
    }
  });
});
