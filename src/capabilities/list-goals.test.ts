import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { findSubgoals, inferPhase, readLastTask } from "../direct-tools";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-list-goals-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

/**
 * Create a minimal goal workspace with GOAL.md.
 */
function createGoalWorkspace(baseDir: string, goalName: string): string {
  const goalDir = path.join(baseDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });
  fs.writeFileSync(
    path.join(goalDir, "GOAL.md"),
    "# Goal\n\nTest goal.",
    "utf-8",
  );
  return goalDir;
}

/**
 * Create a subgoal workspace under S{NN}/subgoals/<name>/ with GOAL.md.
 */
function createSubgoalWorkspace(
  goalDir: string,
  stepFolder: string,
  subgoalName: string,
): string {
  const subgoalDir = path.join(goalDir, stepFolder, "subgoals", subgoalName);
  fs.mkdirSync(subgoalDir, { recursive: true });
  fs.writeFileSync(
    path.join(subgoalDir, "GOAL.md"),
    "# Subgoal\n\nNested subgoal.",
    "utf-8",
  );
  return subgoalDir;
}

// ---------------------------------------------------------------------------
// inferPhase
// ---------------------------------------------------------------------------

describe("inferPhase", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it('returns "empty" when GOAL.md is missing', () => {
    // Arrange: directory with no GOAL.md
    const goalDir = path.join(tempDir, ".pio", "goals", "empty");
    fs.mkdirSync(goalDir, { recursive: true });

    // Act & Assert
    expect(inferPhase(goalDir)).toBe("empty");
  });

  it('returns "defined" when only GOAL.md exists', () => {
    // Arrange
    const goalDir = createGoalWorkspace(tempDir, "defined-only");

    // Act & Assert
    expect(inferPhase(goalDir)).toBe("defined");
  });

  it('returns "planned" when GOAL.md and PLAN.md exist but no step folders', () => {
    // Arrange
    const goalDir = createGoalWorkspace(tempDir, "planned");
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      "# Plan\n\nSome plan.",
      "utf-8",
    );

    // Act & Assert
    expect(inferPhase(goalDir)).toBe("planned");
  });

  it('returns "in progress" when a step folder has TASK.md', () => {
    // Arrange
    const goalDir = createGoalWorkspace(tempDir, "in-progress");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "# Plan", "utf-8");
    const stepDir = path.join(goalDir, "S01");
    fs.mkdirSync(stepDir, { recursive: true });
    fs.writeFileSync(path.join(stepDir, "TASK.md"), "# Task", "utf-8");

    // Act & Assert
    expect(inferPhase(goalDir)).toBe("in progress");
  });
});

// ---------------------------------------------------------------------------
// findSubgoals — recursive subgoal discovery
// ---------------------------------------------------------------------------

describe("findSubgoals", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns an empty array when goal has no subgoals", () => {
    // Arrange: goal with no step folders
    const goalDir = createGoalWorkspace(tempDir, "no-subgoals");

    // Act
    const result = findSubgoals(goalDir, "no-subgoals");

    // Assert
    expect(result).toEqual([]);
  });

  it("returns one entry for a single subgoal in S03/subgoals/nested-feature/", () => {
    // Arrange
    const goalDir = createGoalWorkspace(tempDir, "parent-goal");
    createSubgoalWorkspace(goalDir, "S03", "nested-feature");

    // Act
    const result = findSubgoals(goalDir, "parent-goal");

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("parent-goal/S03/nested-feature");
    expect(result[0].dir).toBe(
      path.join(goalDir, "S03", "subgoals", "nested-feature"),
    );
  });

  it("returns entries for subgoals in multiple step folders", () => {
    // Arrange: subgoals in S01 and S03
    const goalDir = createGoalWorkspace(tempDir, "multi-parent");
    createSubgoalWorkspace(goalDir, "S01", "auth-service");
    createSubgoalWorkspace(goalDir, "S03", "data-layer");

    // Act
    const result = findSubgoals(goalDir, "multi-parent");

    // Assert
    expect(result).toHaveLength(2);
    const names = result.map((r) => r.displayName).sort();
    expect(names).toContain("multi-parent/S01/auth-service");
    expect(names).toContain("multi-parent/S03/data-layer");
  });

  it("discovers deeply nested subgoals (subgoal within a subgoal)", () => {
    // Arrange: parent-goal/S03/subgoals/nested/ -> nested has its own S01/subgoals/deep-feature/
    const goalDir = createGoalWorkspace(tempDir, "deep-parent");
    const nestedDir = createSubgoalWorkspace(goalDir, "S03", "nested");
    // Create a step folder inside the nested subgoal, with its own subgoal
    createSubgoalWorkspace(nestedDir, "S01", "deep-feature");

    // Act
    const result = findSubgoals(goalDir, "deep-parent");

    // Assert
    expect(result).toHaveLength(2);
    const names = result.map((r) => r.displayName).sort();
    expect(names).toContain("deep-parent/S03/nested");
    expect(names).toContain("deep-parent/S03/nested/S01/deep-feature");
  });

  it("does not list subgoals directories without GOAL.md", () => {
    // Arrange: subgoals directory exists but has no GOAL.md
    const goalDir = createGoalWorkspace(tempDir, "partial-subgoal");
    const subgoalDir = path.join(goalDir, "S02", "subgoals", "incomplete");
    fs.mkdirSync(subgoalDir, { recursive: true });
    // No GOAL.md written

    // Act
    const result = findSubgoals(goalDir, "partial-subgoal");

    // Assert
    expect(result).toEqual([]);
  });

  it("returns no entries for an empty subgoals directory", () => {
    // Arrange: S01/subgoals/ exists but is empty
    const goalDir = createGoalWorkspace(tempDir, "empty-subgoals-dir");
    const subgoalsDir = path.join(goalDir, "S01", "subgoals");
    fs.mkdirSync(subgoalsDir, { recursive: true });

    // Act
    const result = findSubgoals(goalDir, "empty-subgoals-dir");

    // Assert
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// readLastTask
// ---------------------------------------------------------------------------

describe("readLastTask", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns undefined when LAST_TASK.json does not exist", () => {
    // Arrange
    const goalDir = createGoalWorkspace(tempDir, "no-last-task");

    // Act & Assert
    expect(readLastTask(goalDir)).toBeUndefined();
  });

  it("returns the capability name from LAST_TASK.json", () => {
    // Arrange
    const goalDir = createGoalWorkspace(tempDir, "with-last-task");
    const taskFile = path.join(goalDir, "LAST_TASK.json");
    fs.writeFileSync(
      taskFile,
      JSON.stringify({ capability: "execute-task", params: {} }),
      "utf-8",
    );

    // Act & Assert
    expect(readLastTask(goalDir)).toBe("execute-task");
  });
});
