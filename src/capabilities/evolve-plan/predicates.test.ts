import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach } from "vitest";
import { CapState } from "../../capability-state";
import { validateOutputs } from "../../guards/validation";
import type { CapabilityContract, MarkdownFileSpec } from "../../types";
import { PLAN_FRONTMATTER_SCHEMA } from "../create-plan/schemas";
import { CONTRACT } from "./config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find a MarkdownFileSpec by file name pattern in CONTRACT.outputs. */
function findOutput(pattern: string): MarkdownFileSpec | undefined {
  return CONTRACT.outputs.find(
    (e): e is MarkdownFileSpec => "file" in e && e.file.includes(pattern),
  );
}

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-pred-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

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
// Predicate boundary tests — verify requiredWhen logic for all three outputs
// ---------------------------------------------------------------------------

describe("evolve-plan CONTRACT predicates", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  describe("predicate logic table", () => {
    it("step 1 of 3: TASK.md required, DECISIONS.md not required, COMPLETION_SUMMARY.md not required", () => {
      const capState = makeCapStateWithPlan(tempDir, 3, { stepNumber: 1 });

      const taskEntry = findOutput("TASK.md");
      const decisionsEntry = findOutput("DECISIONS.md");
      const summaryEntry = findOutput("COMPLETION_SUMMARY.md");

      expect(taskEntry?.requiredWhen?.({ stepNumber: 1 }, capState)).toBe(true);
      expect(decisionsEntry?.requiredWhen?.({ stepNumber: 1 }, capState)).toBe(
        false,
      );
      expect(summaryEntry?.requiredWhen?.({ stepNumber: 1 }, capState)).toBe(
        false,
      );
    });

    it("step 2 of 3: TASK.md required, DECISIONS.md required, COMPLETION_SUMMARY.md not required", () => {
      const capState = makeCapStateWithPlan(tempDir, 3, { stepNumber: 2 });

      const taskEntry = findOutput("TASK.md");
      const decisionsEntry = findOutput("DECISIONS.md");
      const summaryEntry = findOutput("COMPLETION_SUMMARY.md");

      expect(taskEntry?.requiredWhen?.({ stepNumber: 2 }, capState)).toBe(true);
      expect(decisionsEntry?.requiredWhen?.({ stepNumber: 2 }, capState)).toBe(
        true,
      );
      expect(summaryEntry?.requiredWhen?.({ stepNumber: 2 }, capState)).toBe(
        false,
      );
    });

    it("step 3 of 3 (last step): TASK.md required, DECISIONS.md required, COMPLETION_SUMMARY.md not required", () => {
      const capState = makeCapStateWithPlan(tempDir, 3, { stepNumber: 3 });

      const taskEntry = findOutput("TASK.md");
      const decisionsEntry = findOutput("DECISIONS.md");
      const summaryEntry = findOutput("COMPLETION_SUMMARY.md");

      expect(taskEntry?.requiredWhen?.({ stepNumber: 3 }, capState)).toBe(true);
      expect(decisionsEntry?.requiredWhen?.({ stepNumber: 3 }, capState)).toBe(
        true,
      );
      expect(summaryEntry?.requiredWhen?.({ stepNumber: 3 }, capState)).toBe(
        false,
      );
    });

    it("step 4 of 3 (beyond totalSteps): TASK.md not required, DECISIONS.md not required, COMPLETION_SUMMARY.md required", () => {
      const capState = makeCapStateWithPlan(tempDir, 3, { stepNumber: 4 });

      const taskEntry = findOutput("TASK.md");
      const decisionsEntry = findOutput("DECISIONS.md");
      const summaryEntry = findOutput("COMPLETION_SUMMARY.md");

      expect(taskEntry?.requiredWhen?.({ stepNumber: 4 }, capState)).toBe(
        false,
      );
      expect(decisionsEntry?.requiredWhen?.({ stepNumber: 4 }, capState)).toBe(
        false,
      );
      expect(summaryEntry?.requiredWhen?.({ stepNumber: 4 }, capState)).toBe(
        true,
      );
    });

    it("step 5 of 3 (well beyond totalSteps): only COMPLETION_SUMMARY.md required", () => {
      const capState = makeCapStateWithPlan(tempDir, 3, { stepNumber: 5 });

      const taskEntry = findOutput("TASK.md");
      const decisionsEntry = findOutput("DECISIONS.md");
      const summaryEntry = findOutput("COMPLETION_SUMMARY.md");

      expect(taskEntry?.requiredWhen?.({ stepNumber: 5 }, capState)).toBe(
        false,
      );
      expect(decisionsEntry?.requiredWhen?.({ stepNumber: 5 }, capState)).toBe(
        false,
      );
      expect(summaryEntry?.requiredWhen?.({ stepNumber: 5 }, capState)).toBe(
        true,
      );
    });
  });

  describe("defensive null handling (PLAN.md missing)", () => {
    it("TASK.md required by default when PLAN.md can't be read", () => {
      const { capState, tempDir: dir } = makeCapStateWithoutPlan({
        stepNumber: 1,
      });

      const taskEntry = findOutput("TASK.md");
      try {
        expect(taskEntry?.requiredWhen?.({ stepNumber: 1 }, capState)).toBe(
          true,
        );
      } finally {
        cleanup(dir);
      }
    });

    it("DECISIONS.md falls back to old behavior (stepNumber > 1) when PLAN.md can't be read", () => {
      const { capState, tempDir: dir } = makeCapStateWithoutPlan({
        stepNumber: 2,
      });

      const decisionsEntry = findOutput("DECISIONS.md");
      try {
        expect(
          decisionsEntry?.requiredWhen?.({ stepNumber: 2 }, capState),
        ).toBe(true);
      } finally {
        cleanup(dir);
      }
    });

    it("DECISIONS.md not required for step 1 when PLAN.md can't be read", () => {
      const { capState, tempDir: dir } = makeCapStateWithoutPlan({
        stepNumber: 1,
      });

      const decisionsEntry = findOutput("DECISIONS.md");
      try {
        expect(
          decisionsEntry?.requiredWhen?.({ stepNumber: 1 }, capState),
        ).toBe(false);
      } finally {
        cleanup(dir);
      }
    });

    it("COMPLETION_SUMMARY.md never required when PLAN.md can't be read", () => {
      const { capState, tempDir: dir } = makeCapStateWithoutPlan({
        stepNumber: 99,
      });

      const summaryEntry = findOutput("COMPLETION_SUMMARY.md");
      try {
        expect(summaryEntry?.requiredWhen?.({ stepNumber: 99 }, capState)).toBe(
          false,
        );
      } finally {
        cleanup(dir);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// validateOutputs — contract-based COMPLETION_SUMMARY.md validation
// (replaces bypass tests)
// ---------------------------------------------------------------------------

describe("validateOutputs — COMPLETION_SUMMARY.md via contract", () => {
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

    // stepNumber: 3 > totalSteps: 2 → only COMPLETION_SUMMARY.md is required
    const capState = new CapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("fails when stepNumber > totalSteps and COMPLETION_SUMMARY.md is missing", () => {
    // Create PLAN.md with totalSteps: 2
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );
    // COMPLETION_SUMMARY.md is missing

    const capState = new CapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("COMPLETION_SUMMARY.md");
  });

  it("stepNumber within range requires TASK.md (not COMPLETION_SUMMARY.md)", () => {
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );

    // step 1: TASK.md required, COMPLETION_SUMMARY.md not required
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
    // DECISIONS.md is missing

    const capState = new CapState(CONTRACT, tempDir, { stepNumber: 2 });
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("DECISIONS.md");
  });

  it("step beyond totalSteps does NOT require DECISIONS.md", () => {
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );

    // stepNumber: 3 > totalSteps: 2
    // Only COMPLETION_SUMMARY.md should be required, not DECISIONS.md
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
