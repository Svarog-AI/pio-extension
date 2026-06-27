import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  enqueueTask,
  listPendingTasks,
  queueDir,
  readPendingTask,
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

describe("enqueueTask(cwd, queueKey, task)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("creates correct file path", () => {
    const task: SessionQueueTask = {
      capability: "create-plan",
      params: { goalName: "my-goal" },
    };
    enqueueTask(tempDir, "my-goal", task);
    const filePath = path.join(
      tempDir,
      ".pio",
      "session-queue",
      "task-my-goal.json",
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("writes valid JSON with correct fields", () => {
    const task: SessionQueueTask = {
      capability: "create-plan",
      params: { goalName: "my-goal" },
    };
    enqueueTask(tempDir, "my-goal", task);
    const filePath = path.join(
      tempDir,
      ".pio",
      "session-queue",
      "task-my-goal.json",
    );
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.capability).toBe("create-plan");
    expect(parsed.params.goalName).toBe("my-goal");
  });

  it("overwrites existing task for the same key", () => {
    const task1: SessionQueueTask = { capability: "create-plan" };
    const task2: SessionQueueTask = { capability: "evolve-plan" };
    enqueueTask(tempDir, "my-goal", task1);
    enqueueTask(tempDir, "my-goal", task2);

    const filePath = path.join(
      tempDir,
      ".pio",
      "session-queue",
      "task-my-goal.json",
    );
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(parsed.capability).toBe("evolve-plan");
  });

  it("uses 2-space indentation", () => {
    const task: SessionQueueTask = {
      capability: "create-plan",
      params: { goalName: "my-goal" },
    };
    enqueueTask(tempDir, "my-goal", task);
    const filePath = path.join(
      tempDir,
      ".pio",
      "session-queue",
      "task-my-goal.json",
    );
    const raw = fs.readFileSync(filePath, "utf-8");
    expect(raw).toBe(JSON.stringify(task, null, 2));
  });

  it("accepts arbitrary queue keys (not just goal names)", () => {
    const task: SessionQueueTask = { capability: "research" };
    enqueueTask(tempDir, "research__project-alpha", task);
    const filePath = path.join(
      tempDir,
      ".pio",
      "session-queue",
      "task-research__project-alpha.json",
    );
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// readPendingTask
// ---------------------------------------------------------------------------

describe("readPendingTask(cwd, queueKey)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns parsed object for existing task", () => {
    const task: SessionQueueTask = {
      capability: "create-plan",
      params: { goalName: "my-goal" },
    };
    enqueueTask(tempDir, "my-goal", task);
    const result = readPendingTask(tempDir, "my-goal");
    expect(result).toEqual(task);
  });

  it("returns undefined for missing task", () => {
    expect(readPendingTask(tempDir, "no-such-goal")).toBeUndefined();
  });

  it("round-trip preserves data", () => {
    const original: SessionQueueTask = {
      capability: "create-goal",
      params: { goalName: "x" },
    };
    enqueueTask(tempDir, "x", original);
    const result = readPendingTask(tempDir, "x");
    expect(result).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// listPendingTasks
// ---------------------------------------------------------------------------

describe("listPendingTasks(cwd)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns empty array when no queue dir exists", () => {
    expect(listPendingTasks(tempDir)).toEqual([]);
  });

  it("returns empty array for empty queue dir", () => {
    // Create the queue dir but no files
    queueDir(tempDir);
    expect(listPendingTasks(tempDir)).toEqual([]);
  });

  it("extracts queue keys correctly from multiple tasks", () => {
    enqueueTask(tempDir, "feat-a", { capability: "create-plan" });
    enqueueTask(tempDir, "feat-b", { capability: "evolve-plan" });

    const tasks = listPendingTasks(tempDir);
    expect(tasks).toContain("feat-a");
    expect(tasks).toContain("feat-b");
  });

  it("ignores non-task files", () => {
    enqueueTask(tempDir, "my-goal", { capability: "create-plan" });
    // Add a non-task file
    const otherFile = path.join(tempDir, ".pio", "session-queue", "readme.txt");
    fs.writeFileSync(otherFile, "not a task", "utf-8");
    const otherFile2 = path.join(
      tempDir,
      ".pio",
      "session-queue",
      "other.json",
    );
    fs.writeFileSync(otherFile2, "{}", "utf-8");

    const tasks = listPendingTasks(tempDir);
    expect(tasks).toEqual(["my-goal"]);
  });

  it("handles hierarchical keys with __ delimiter", () => {
    enqueueTask(tempDir, "parent__S03__nested", { capability: "create-plan" });

    const tasks = listPendingTasks(tempDir);
    expect(tasks).toContain("parent__S03__nested");
  });
});
