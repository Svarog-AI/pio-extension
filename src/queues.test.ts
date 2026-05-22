import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  queueDir,
  enqueueTask,
  readPendingTask,
  listPendingGoals,
  writeLastTask,
  deriveQueueKey,
  type SessionQueueTask,
} from "./queues";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// queueDir
// ---------------------------------------------------------------------------

describe("queueDir(cwd)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns correct path", () => {
    const result = queueDir(tempDir);
    expect(result).toBe(path.join(tempDir, ".pio", "session-queue"));
  });

  it("creates directory if missing", () => {
    const queuePath = path.join(tempDir, ".pio", "session-queue");
    expect(fs.existsSync(queuePath)).toBe(false);
    const result = queueDir(tempDir);
    expect(result).toBe(queuePath);
    expect(fs.existsSync(queuePath)).toBe(true);
  });

  it("is idempotent — no error on repeated calls", () => {
    const firstCall = queueDir(tempDir);
    const secondCall = queueDir(tempDir);
    expect(firstCall).toBe(secondCall);
  });
});

// ---------------------------------------------------------------------------
// enqueueTask
// ---------------------------------------------------------------------------

describe("enqueueTask(cwd, goalName, task)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("creates correct file path", () => {
    const task: SessionQueueTask = { capability: "create-plan", params: { goalName: "my-goal" } };
    enqueueTask(tempDir, "my-goal", task);
    const filePath = path.join(tempDir, ".pio", "session-queue", "task-my-goal.json");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("writes valid JSON with correct fields", () => {
    const task: SessionQueueTask = { capability: "create-plan", params: { goalName: "my-goal" } };
    enqueueTask(tempDir, "my-goal", task);
    const filePath = path.join(tempDir, ".pio", "session-queue", "task-my-goal.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.capability).toBe("create-plan");
    expect(parsed.params.goalName).toBe("my-goal");
  });

  it("overwrites existing task for the same goal", () => {
    const task1: SessionQueueTask = { capability: "create-plan" };
    const task2: SessionQueueTask = { capability: "evolve-plan" };
    enqueueTask(tempDir, "my-goal", task1);
    enqueueTask(tempDir, "my-goal", task2);

    const filePath = path.join(tempDir, ".pio", "session-queue", "task-my-goal.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(parsed.capability).toBe("evolve-plan");
  });

  it("uses 2-space indentation", () => {
    const task: SessionQueueTask = { capability: "create-plan", params: { goalName: "my-goal" } };
    enqueueTask(tempDir, "my-goal", task);
    const filePath = path.join(tempDir, ".pio", "session-queue", "task-my-goal.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    expect(raw).toBe(JSON.stringify(task, null, 2));
  });
});

// ---------------------------------------------------------------------------
// readPendingTask
// ---------------------------------------------------------------------------

describe("readPendingTask(cwd, goalName)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns parsed object for existing task", () => {
    const task: SessionQueueTask = { capability: "create-plan", params: { goalName: "my-goal" } };
    enqueueTask(tempDir, "my-goal", task);
    const result = readPendingTask(tempDir, "my-goal");
    expect(result).toEqual(task);
  });

  it("returns undefined for missing task", () => {
    expect(readPendingTask(tempDir, "no-such-goal")).toBeUndefined();
  });

  it("round-trip preserves data", () => {
    const original: SessionQueueTask = { capability: "create-goal", params: { goalName: "x" } };
    enqueueTask(tempDir, "x", original);
    const result = readPendingTask(tempDir, "x");
    expect(result).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// listPendingGoals
// ---------------------------------------------------------------------------

describe("listPendingGoals(cwd)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns empty array when no queue dir exists", () => {
    expect(listPendingGoals(tempDir)).toEqual([]);
  });

  it("returns empty array for empty queue dir", () => {
    // Create the queue dir but no files
    queueDir(tempDir);
    expect(listPendingGoals(tempDir)).toEqual([]);
  });

  it("extracts goal names correctly from multiple tasks", () => {
    enqueueTask(tempDir, "feat-a", { capability: "create-plan" });
    enqueueTask(tempDir, "feat-b", { capability: "evolve-plan" });

    const goals = listPendingGoals(tempDir);
    expect(goals).toContain("feat-a");
    expect(goals).toContain("feat-b");
  });

  it("ignores non-task files", () => {
    enqueueTask(tempDir, "my-goal", { capability: "create-plan" });
    // Add a non-task file
    const otherFile = path.join(tempDir, ".pio", "session-queue", "readme.txt");
    fs.writeFileSync(otherFile, "not a task", "utf-8");
    const otherFile2 = path.join(tempDir, ".pio", "session-queue", "other.json");
    fs.writeFileSync(otherFile2, "{}", "utf-8");

    const goals = listPendingGoals(tempDir);
    expect(goals).toEqual(["my-goal"]);
  });
});

// ---------------------------------------------------------------------------
// deriveQueueKey
// ---------------------------------------------------------------------------

describe("deriveQueueKey(goalDir, cwd)", () => {
  it("given a flat goal path, it returns the goal basename unchanged", () => {
    const result = deriveQueueKey("/repo/.pio/goals/my-feature", "/repo");
    expect(result).toBe("my-feature");
  });

  it("given a nested subgoal path, it filters out `subgoals` and joins with `__`", () => {
    const result = deriveQueueKey("/repo/.pio/goals/parent/S03/subgoals/nested", "/repo");
    expect(result).toBe("parent__S03__nested");
  });

  it("given a deeply nested path (multiple levels), it filters all `subgoals` markers", () => {
    const result = deriveQueueKey("/repo/.pio/goals/a/S01/subgoals/b/S02/subgoals/c", "/repo");
    expect(result).toBe("a__S01__b__S02__c");
  });

  it("given a goal path with a single-segment name after goals/, it handles gracefully", () => {
    const result = deriveQueueKey("/repo/.pio/goals/x", "/repo");
    expect(result).toBe("x");
  });

  it("given a goalDir that doesn't contain `.pio/goals/`, it throws", () => {
    expect(() => deriveQueueKey("/some/random/path", "/repo")).toThrow(
      /does not contain the expected prefix/,
    );
  });

  it("given a goalDir where all segments filter to empty, it throws", () => {
    // Edge case: path is exactly the prefix (no segments after goals/)
    expect(() => deriveQueueKey("/repo/.pio/goals/", "/repo")).toThrow(
      /no path segments remain after filtering/,
    );
  });
});

// ---------------------------------------------------------------------------
// enqueueTask with qualifiedName
// ---------------------------------------------------------------------------

describe("enqueueTask with qualifiedName", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("when qualifiedName is omitted, it writes to task-{goalName}.json (backward compatible)", () => {
    enqueueTask(tempDir, "my-goal", { capability: "create-plan" });
    const filePath = path.join(tempDir, ".pio", "session-queue", "task-my-goal.json");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("when qualifiedName is provided, it writes to task-{qualifiedName}.json", () => {
    enqueueTask(tempDir, "nested", { capability: "create-plan" }, "parent__S03__nested");
    const filePath = path.join(tempDir, ".pio", "session-queue", "task-parent__S03__nested.json");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("qualifiedName and goalName can differ — both produce separate files", () => {
    enqueueTask(tempDir, "a", { capability: "create-plan" });
    enqueueTask(tempDir, "b", { capability: "evolve-plan" }, "parent__S03__b");

    const fileA = path.join(tempDir, ".pio", "session-queue", "task-a.json");
    const fileB = path.join(tempDir, ".pio", "session-queue", "task-parent__S03__b.json");

    expect(fs.existsSync(fileA)).toBe(true);
    expect(fs.existsSync(fileB)).toBe(true);
  });

  it("empty-string qualifiedName is treated as a valid name (!== undefined check)", () => {
    enqueueTask(tempDir, "x", { capability: "create-plan" }, "");
    const filePath = path.join(tempDir, ".pio", "session-queue", "task-.json");
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// readPendingTask with qualifiedName
// ---------------------------------------------------------------------------

describe("readPendingTask with qualifiedName", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("when qualifiedName is omitted, it reads task-{goalName}.json (backward compatible)", () => {
    const task: SessionQueueTask = { capability: "create-plan", params: { goalName: "my-goal" } };
    enqueueTask(tempDir, "my-goal", task);
    const result = readPendingTask(tempDir, "my-goal");
    expect(result).toEqual(task);
  });

  it("when qualifiedName is provided, it reads task-{qualifiedName}.json", () => {
    const task: SessionQueueTask = { capability: "create-plan", params: { goalName: "nested" } };
    enqueueTask(tempDir, "nested", task, "parent__S03__nested");
    const result = readPendingTask(tempDir, "nested", "parent__S03__nested");
    expect(result).toEqual(task);
  });

  it("returns undefined when no file matches the qualifiedName", () => {
    const result = readPendingTask(tempDir, "x", "nonexistent__key");
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// writeLastTask
// ---------------------------------------------------------------------------

describe("writeLastTask(goalDir, task)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("creates LAST_TASK.json in goal dir", () => {
    const goalDir = path.join(tempDir, "my-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    const task: SessionQueueTask = { capability: "execute-task" };
    writeLastTask(goalDir, task);

    expect(fs.existsSync(path.join(goalDir, "LAST_TASK.json"))).toBe(true);
  });

  it("writes valid JSON content matching input", () => {
    const goalDir = path.join(tempDir, "my-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    const task: SessionQueueTask = { capability: "execute-task", params: { stepNumber: 3 } };
    writeLastTask(goalDir, task);

    const filePath = path.join(goalDir, "LAST_TASK.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(parsed).toEqual(task);
  });
});
