import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildPioWorkflowContext, type PioWorkflowContext } from "./pio-workflow-machine";
import type { SimpleStepStatus } from "./utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mktmp(prefix: string = "pio-pwc-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Create a goal workspace at <tmp>/.pio/goals/<name>/ with the given files.
 * Returns { goalDir, cwd, ctx }.
 */
function setupGoal(
  tmp: string,
  goalName: string,
  files: Record<string, string> = {},
): { goalDir: string; cwd: string; ctx: PioWorkflowContext } {
  const cwd = path.join(tmp, "project");
  const goalDir = path.join(cwd, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(goalDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }

  const ctx = buildPioWorkflowContext(goalDir);
  return { goalDir, cwd, ctx };
}

function writePlanFrontmatter(
  totalSteps: number,
  steps: { name: string; complexity?: "task" | "subgoal" }[],
): string {
  const yamlSteps = steps
    .map((s) => `- name: ${s.name}${s.complexity ? `\n  complexity: ${s.complexity}` : ""}`)
    .join("\n");
  return `---
totalSteps: ${totalSteps}
steps:
${yamlSteps}
---
# Plan content
`;
}

function writeTaskFrontmatter(skills?: { mandatory?: string[]; recommended?: { name: string; condition: string }[] }): string {
  const yaml = skills ? `\nskills:\n${skills.mandatory ? `  mandatory: [${skills.mandatory.join(", ")}]` : ""}${skills.recommended ? `\n  recommended:\n${skills.recommended.map(r => `    - name: ${r.name}\n      condition: ${r.condition}`).join("\n")}` : ""}` : "";
  return `---${yaml}
---
# Task content
`;
}

function writeReviewFrontmatter(decision: "APPROVED" | "REJECTED"): string {
  return `---
decision: ${decision}
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---
# Review content
`;
}

// ---------------------------------------------------------------------------
// goalName
// ---------------------------------------------------------------------------

describe("PioWorkflowContext — goalName", () => {
  it("derives goalName from baseDir basename", () => {
    const { ctx } = setupGoal(mktmp(), "my-feature");
    expect(ctx.goalName).toBe("my-feature");
  });

  it("derives goalName with hyphens and numbers", () => {
    const { ctx } = setupGoal(mktmp(), "fix-type-error-42");
    expect(ctx.goalName).toBe("fix-type-error-42");
  });
});

// ---------------------------------------------------------------------------
// hasGoal / hasPlan
// ---------------------------------------------------------------------------

describe("PioWorkflowContext — hasGoal / hasPlan", () => {
  it("hasGoal returns true when GOAL.md exists", () => {
    const { ctx } = setupGoal(mktmp(), "test", { "GOAL.md": "# Goal" });
    expect(ctx.hasGoal()).toBe(true);
  });

  it("hasGoal returns false when GOAL.md missing", () => {
    const { ctx } = setupGoal(mktmp(), "test");
    expect(ctx.hasGoal()).toBe(false);
  });

  it("hasPlan returns true when PLAN.md exists", () => {
    const { ctx } = setupGoal(mktmp(), "test", { "PLAN.md": writePlanFrontmatter(1, [{ name: "s1" }]) });
    expect(ctx.hasPlan()).toBe(true);
  });

  it("hasPlan returns false when PLAN.md missing", () => {
    const { ctx } = setupGoal(mktmp(), "test");
    expect(ctx.hasPlan()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// planMetadata
// ---------------------------------------------------------------------------

describe("PioWorkflowContext — planMetadata()", () => {
  it("returns parsed PlanFrontmatter when PLAN.md exists with valid frontmatter", () => {
    const planContent = writePlanFrontmatter(3, [
      { name: "step-one" },
      { name: "step-two", complexity: "task" },
      { name: "step-three" },
    ]);
    const { ctx } = setupGoal(mktmp(), "test", { "PLAN.md": planContent });

    const result = ctx.planMetadata();
    expect(result).not.toBeNull();
    const data = result as Exclude<typeof result, null | { data?: unknown; error?: string }>;
    expect(data.totalSteps).toBe(3);
    expect(data.steps).toHaveLength(3);
    expect(data.steps[0].name).toBe("step-one");
    expect(data.steps[1].complexity).toBe("task");
  });

  it("returns null when PLAN.md is missing", () => {
    const { ctx } = setupGoal(mktmp(), "test");
    expect(ctx.planMetadata()).toBeNull();
  });

  it("returns null when PLAN.md has no frontmatter", () => {
    const { ctx } = setupGoal(mktmp(), "test", { "PLAN.md": "# No frontmatter" });
    expect(ctx.planMetadata()).toBeNull();
  });

  it("returns error object when { errors: true } and PLAN.md missing", () => {
    const { ctx } = setupGoal(mktmp(), "test");
    const result = ctx.planMetadata({ errors: true });
    expect(result).toEqual({ error: "PLAN.md not found" });
  });

  it("returns error object when { errors: true } and frontmatter invalid", () => {
    const { ctx } = setupGoal(mktmp(), "test", { "PLAN.md": "# No frontmatter" });
    const result = ctx.planMetadata({ errors: true });
    expect(result).toHaveProperty("error");
  });

  it("returns { data } when { errors: true } and frontmatter valid", () => {
    const planContent = writePlanFrontmatter(1, [{ name: "only-step" }]);
    const { ctx } = setupGoal(mktmp(), "test", { "PLAN.md": planContent });

    const result = ctx.planMetadata({ errors: true });
    expect(result).toHaveProperty("data");
    const typed = result as { data?: { totalSteps: number }; error?: string };
    expect(typed.data?.totalSteps).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// totalPlanSteps
// ---------------------------------------------------------------------------

describe("PioWorkflowContext — totalPlanSteps()", () => {
  it("reads totalSteps from PLAN.md frontmatter", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(5, [{ name: "s1" }, { name: "s2" }, { name: "s3" }, { name: "s4" }, { name: "s5" }]),
    });
    expect(ctx.totalPlanSteps()).toBe(5);
  });

  it("returns undefined when PLAN.md missing", () => {
    const { ctx } = setupGoal(mktmp(), "test");
    expect(ctx.totalPlanSteps()).toBeUndefined();
  });

  it("returns undefined when PLAN.md has invalid frontmatter", () => {
    const { ctx } = setupGoal(mktmp(), "test", { "PLAN.md": "# no frontmatter" });
    expect(ctx.totalPlanSteps()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// steps()
// ---------------------------------------------------------------------------

describe("PioWorkflowContext — steps()", () => {
  it("returns array of SimpleStepStatus objects matching PLAN.md steps array length", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(3, [
        { name: "add-types" },
        { name: "refactor-validation" },
        { name: "migrate-configs" },
      ]),
    });

    const steps = ctx.steps();
    expect(steps).toHaveLength(3);
    expect(steps[0].stepNumber).toBe(1);
    expect(steps[0].folderName).toBe("S01");
    expect(steps[1].stepNumber).toBe(2);
    expect(steps[2].stepNumber).toBe(3);
  });

  it("returns empty array when PLAN.md has no steps", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(0, []),
    });
    expect(ctx.steps()).toHaveLength(0);
  });

  it("returns empty array when PLAN.md is missing", () => {
    const { ctx } = setupGoal(mktmp(), "test");
    expect(ctx.steps()).toHaveLength(0);
  });

  it("SimpleStepStatus objects have correct stepNumber and folderName", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(2, [{ name: "first" }, { name: "second" }]),
    });

    const steps = ctx.steps();
    expect(steps[0].stepNumber).toBe(1);
    expect(steps[0].folderName).toBe("S01");
    expect(steps[1].stepNumber).toBe(2);
    expect(steps[1].folderName).toBe("S02");
  });

  it("SimpleStepStatus.getMetadata() returns StepMetadata with name and complexity", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(2, [
        { name: "add-types", complexity: "task" },
        { name: "nested-feature", complexity: "subgoal" },
      ]),
    });

    const steps = ctx.steps();
    const meta1 = steps[0].getMetadata();
    expect(meta1).toEqual({ name: "add-types", complexity: "task" });

    const meta2 = steps[1].getMetadata();
    expect(meta2).toEqual({ name: "nested-feature", complexity: "subgoal" });
  });

  it("SimpleStepStatus.hasTest() returns true when TEST.md exists", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(1, [{ name: "test-step" }]),
      "S01/TEST.md": "# Tests",
    });

    expect(ctx.steps()[0].hasTest()).toBe(true);
  });

  it("SimpleStepStatus.hasTest() returns false when TEST.md missing", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(1, [{ name: "test-step" }]),
    });

    expect(ctx.steps()[0].hasTest()).toBe(false);
  });

  it("SimpleStepStatus.status() — marker-based: returns 'approved' when APPROVED marker exists", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(1, [{ name: "test-step" }]),
      "S01/APPROVED": "",
    });

    expect(ctx.steps()[0].status()).toBe("approved");
  });

  it("SimpleStepStatus.status() — marker-based: returns 'rejected' when REJECTED marker exists", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(1, [{ name: "test-step" }]),
      "S01/REJECTED": "",
    });

    expect(ctx.steps()[0].status()).toBe("rejected");
  });

  it("SimpleStepStatus.status() — marker-based: returns 'pending' for empty folder", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(1, [{ name: "test-step" }]),
      "S01/.gitkeep": "",
    });

    expect(ctx.steps()[0].status()).toBe("pending");
  });

  it("SimpleStepStatus.status() — marker-based: returns 'defined' when only TASK.md exists", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(1, [{ name: "test-step" }]),
      "S01/TASK.md": "# Task",
    });

    expect(ctx.steps()[0].status()).toBe("defined");
  });

  it("SimpleStepStatus.status() — marker-based: returns 'implemented' when COMPLETED marker exists", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(1, [{ name: "test-step" }]),
      "S01/COMPLETED": "",
    });

    expect(ctx.steps()[0].status()).toBe("implemented");
  });

  it("SimpleStepStatus.status() — marker-based: respects priority approved > rejected", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(1, [{ name: "test-step" }]),
      "S01/APPROVED": "",
      "S01/REJECTED": "",
    });

    expect(ctx.steps()[0].status()).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// getTaskSkills (on PioWorkflowContext)
// ---------------------------------------------------------------------------

describe("PioWorkflowContext — getTaskSkills()", () => {
  it("reads TASK.md frontmatter and returns skills object", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "S01/TASK.md": writeTaskFrontmatter({
        mandatory: ["tdd", "pio-git"],
        recommended: [{ name: "source-research", condition: "when researching" }],
      }),
    });

    const skills = ctx.getTaskSkills(1);
    expect(skills).not.toBeNull();
    expect(skills?.mandatory).toEqual(["tdd", "pio-git"]);
    expect(skills?.recommended).toHaveLength(1);
  });

  it("returns null when TASK.md is missing", () => {
    const { ctx } = setupGoal(mktmp(), "test");
    expect(ctx.getTaskSkills(1)).toBeNull();
  });

  it("returns null when TASK.md has no skills frontmatter", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "S01/TASK.md": "---\n---\n# No skills",
    });

    expect(ctx.getTaskSkills(1)).toBeNull();
  });

  it("returns null when TASK.md has no frontmatter", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "S01/TASK.md": "# Task without frontmatter",
    });

    expect(ctx.getTaskSkills(1)).toBeNull();
  });

  it("returns skills with only mandatory (no recommended)", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "S01/TASK.md": writeTaskFrontmatter({ mandatory: ["tdd"] }),
    });

    const skills = ctx.getTaskSkills(1);
    expect(skills).not.toBeNull();
    expect(skills?.mandatory).toEqual(["tdd"]);
    expect(skills?.recommended).toBeUndefined();
  });

  it("uses correct step number (S03)", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "S03/TASK.md": writeTaskFrontmatter({ mandatory: ["pio-git"] }),
    });

    const skills = ctx.getTaskSkills(3);
    expect(skills).not.toBeNull();
    expect(skills?.mandatory).toEqual(["pio-git"]);
  });
});

// ---------------------------------------------------------------------------
// currentStepNumber
// ---------------------------------------------------------------------------

describe("PioWorkflowContext — currentStepNumber()", () => {
  it("returns 1 for empty goal directory (no step folders)", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(3, [{ name: "s1" }, { name: "s2" }, { name: "s3" }]),
    });
    expect(ctx.currentStepNumber()).toBe(1);
  });

  it("returns 2 when S01 is APPROVED and S02 has no APPROVED", () => {
    const { goalDir, ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(2, [{ name: "s1" }, { name: "s2" }]),
      "S01/APPROVED": "",
    });
    fs.mkdirSync(path.join(goalDir, "S02"), { recursive: true });
    expect(ctx.currentStepNumber()).toBe(2);
  });

  it("delegates to findCurrentStepNumber (sequential scan behavior)", () => {
    const { goalDir, ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(3, [{ name: "s1" }, { name: "s2" }, { name: "s3" }]),
      "S01/APPROVED": "",
      "S02/APPROVED": "",
    });
    fs.mkdirSync(path.join(goalDir, "S03"), { recursive: true });
    expect(ctx.currentStepNumber()).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// goalCompleted
// ---------------------------------------------------------------------------

describe("PioWorkflowContext — goalCompleted()", () => {
  it("returns true when COMPLETED marker exists at goal root", () => {
    const { ctx } = setupGoal(mktmp(), "test", { "COMPLETED": "" });
    expect(ctx.goalCompleted()).toBe(true);
  });

  it("returns false when COMPLETED marker does not exist", () => {
    const { ctx } = setupGoal(mktmp(), "test");
    expect(ctx.goalCompleted()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getReviewOutputs
// ---------------------------------------------------------------------------

describe("PioWorkflowContext — getReviewOutputs()", () => {
  it("reads REVIEW.md frontmatter for a given step number", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "S03/REVIEW.md": writeReviewFrontmatter("APPROVED"),
    });

    const result = ctx.getReviewOutputs(3);
    expect(result).not.toBeNull();
    const data = result as Exclude<typeof result, null | { data?: unknown; error?: string }>;
    expect(data.decision).toBe("APPROVED");
    expect(data.criticalIssues).toBe(0);
  });

  it("returns null when REVIEW.md is missing", () => {
    const { ctx } = setupGoal(mktmp(), "test");
    expect(ctx.getReviewOutputs(1)).toBeNull();
  });

  it("returns error object when { errors: true } and REVIEW.md missing", () => {
    const { ctx } = setupGoal(mktmp(), "test");
    const result = ctx.getReviewOutputs(1, { errors: true });
    expect(result).toEqual({ error: "REVIEW.md not found" });
  });

  it("returns { data } when { errors: true } and REVIEW.md valid", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "S02/REVIEW.md": writeReviewFrontmatter("REJECTED"),
    });

    const result = ctx.getReviewOutputs(2, { errors: true });
    expect(result).toHaveProperty("data");
    const typed = result as { data?: { decision: string }; error?: string };
    expect(typed.data?.decision).toBe("REJECTED");
  });

  it("returns error object when { errors: true } and frontmatter invalid", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "S01/REVIEW.md": "# No frontmatter",
    });

    const result = ctx.getReviewOutputs(1, { errors: true });
    expect(result).toHaveProperty("error");
  });

  it("uses CapState placeholder resolution for step path", () => {
    // Verify that getReviewOutputs uses "S{stepNumber:02d}/REVIEW.md"
    // so CapState handles the placeholder resolution.
    // If stepNumber is 1, it resolves to S01/REVIEW.md.
    const { ctx } = setupGoal(mktmp(), "test", {
      "S01/REVIEW.md": writeReviewFrontmatter("APPROVED"),
    });

    const result = ctx.getReviewOutputs(1);
    expect(result).not.toBeNull();
    const data = result as Exclude<typeof result, null | { data?: unknown; error?: string }>;
    expect(data.decision).toBe("APPROVED");
  });
});

// ---------------------------------------------------------------------------
// pendingTask
// ---------------------------------------------------------------------------

describe("PioWorkflowContext — pendingTask()", () => {
  it("reads pending task from session queue", () => {
    const tmp = mktmp();
    const { goalDir, cwd, ctx } = setupGoal(tmp, "my-feature", {});

    // Create session queue
    const queueDir = path.join(cwd, ".pio", "session-queue");
    fs.mkdirSync(queueDir, { recursive: true });
    fs.writeFileSync(
      path.join(queueDir, "task-my-feature.json"),
      JSON.stringify({ capability: "execute-task", params: { goalName: "my-feature", stepNumber: 3 } }),
      "utf-8",
    );

    const task = ctx.pendingTask();
    expect(task).not.toBeUndefined();
    expect(task?.capability).toBe("execute-task");
    expect(task?.params).toEqual({ goalName: "my-feature", stepNumber: 3 });
  });

  it("returns undefined when no pending task file exists", () => {
    const { ctx } = setupGoal(mktmp(), "test");
    expect(ctx.pendingTask()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// lastCompleted
// ---------------------------------------------------------------------------

describe("PioWorkflowContext — lastCompleted()", () => {
  it("reads LAST_TASK.json from goal directory", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "LAST_TASK.json": JSON.stringify({
        capability: "review-task",
        params: { goalName: "test", stepNumber: 2 },
        timestamp: "2024-01-01T00:00:00Z",
      }),
    });

    const result = ctx.lastCompleted();
    expect(result).not.toBeUndefined();
    expect(result?.capability).toBe("review-task");
    expect(result?.params).toEqual({ goalName: "test", stepNumber: 2 });
    expect(result?.timestamp).toBe("2024-01-01T00:00:00Z");
  });

  it("returns undefined when LAST_TASK.json does not exist", () => {
    const { ctx } = setupGoal(mktmp(), "test");
    expect(ctx.lastCompleted()).toBeUndefined();
  });

  it("returns undefined when LAST_TASK.json has invalid JSON", () => {
    const { ctx } = setupGoal(mktmp(), "test", { "LAST_TASK.json": "not json" });
    expect(ctx.lastCompleted()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PioWorkflowContext interface compatibility with GoalState
// ---------------------------------------------------------------------------

describe("PioWorkflowContext — interface compatibility", () => {
  it("provides all GoalState methods", () => {
    const { ctx } = setupGoal(mktmp(), "test");

    // Verify all methods exist and are callable
    expect(typeof ctx.goalName).toBe("string");
    expect(typeof ctx.hasGoal).toBe("function");
    expect(typeof ctx.hasPlan).toBe("function");
    expect(typeof ctx.totalPlanSteps).toBe("function");
    expect(typeof ctx.steps).toBe("function");
    expect(typeof ctx.currentStepNumber).toBe("function");
    expect(typeof ctx.pendingTask).toBe("function");
    expect(typeof ctx.lastCompleted).toBe("function");
    expect(typeof ctx.getReviewOutputs).toBe("function");
    expect(typeof ctx.planMetadata).toBe("function");
    expect(typeof ctx.goalCompleted).toBe("function");
    expect(typeof ctx.getTaskSkills).toBe("function");
  });

  it("steps() returns objects with all SimpleStepStatus methods", () => {
    const { ctx } = setupGoal(mktmp(), "test", {
      "PLAN.md": writePlanFrontmatter(1, [{ name: "test-step" }]),
    });

    const step = ctx.steps()[0];

    // SimpleStepStatus methods
    expect(typeof step.stepNumber).toBe("number");
    expect(typeof step.folderName).toBe("string");
    expect(typeof step.metadata).toBeDefined();
    expect(typeof step.hasTask).toBe("function");
    expect(typeof step.hasTest).toBe("function");
    expect(typeof step.hasSummary).toBe("function");
    expect(typeof step.revisionNeeded).toBe("function");
    expect(typeof step.getMetadata).toBe("function");
    expect(typeof step.status).toBe("function");
  });
});
