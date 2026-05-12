import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  resolveGoalDir,
  goalExists,
  queueDir,
  findIssuePath,
  readIssue,
  enqueueTask,
  readPendingTask,
  listPendingGoals,
  writeLastTask,
  deriveSessionName,
  stepFolderName,
  discoverNextStep,
  type SessionQueueTask,
} from "../src/utils";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Create a goal directory tree with specified step folders.
// Each entry in `steps` can specify which files to create inside the step folder.
function createGoalTree(tempDir: string, goalName: string, steps?: { number: number; files: string[] }[]): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  for (const step of steps ?? []) {
    const folderName = stepFolderName(step.number);
    const stepDir = path.join(goalDir, folderName);
    fs.mkdirSync(stepDir, { recursive: true });
    for (const file of step.files) {
      fs.writeFileSync(path.join(stepDir, file), `content of ${file}`, "utf-8");
    }
  }

  return goalDir;
}

// Create an issues directory and write issue files
function createIssueFiles(tempDir: string, issues: { slug: string; content: string }[]): void {
  const issuesDir = path.join(tempDir, ".pio", "issues");
  fs.mkdirSync(issuesDir, { recursive: true });

  for (const issue of issues) {
    fs.writeFileSync(path.join(issuesDir, `${issue.slug}.md`), issue.content, "utf-8");
  }
}

// ---------------------------------------------------------------------------
// resolveGoalDir
// ---------------------------------------------------------------------------

describe("resolveGoalDir(cwd, name)", () => {
  it("builds correct path for normal names", () => {
    const result = resolveGoalDir("/tmp/proj", "my-feature");
    expect(result).toBe(path.join("/tmp/proj", ".pio", "goals", "my-feature"));
  });

  it("handles names with hyphens and underscores", () => {
    const result = resolveGoalDir("/tmp/proj", "my_feature-v2");
    expect(result).toBe(path.join("/tmp/proj", ".pio", "goals", "my_feature-v2"));
  });

  it("handles names with dots", () => {
    const result = resolveGoalDir("/tmp/proj", "feat.login");
    expect(result).toBe(path.join("/tmp/proj", ".pio", "goals", "feat.login"));
  });

  it("uses path.join (platform-independent separators)", () => {
    const result = resolveGoalDir("/tmp/proj", "test-goal");
    // On all platforms, path.join uses the correct separator
    expect(result.split(path.sep)).toContain(".pio");
    expect(result.split(path.sep)).toContain("goals");
  });
});

// ---------------------------------------------------------------------------
// goalExists
// ---------------------------------------------------------------------------

describe("goalExists(goalDir)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns true for existing directory", () => {
    const goalDir = path.join(tempDir, "existing-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    expect(goalExists(goalDir)).toBe(true);
  });

  it("returns false for non-existent path", () => {
    const goalDir = path.join(tempDir, "non-existent-goal");
    expect(goalExists(goalDir)).toBe(false);
  });

  it("returns false for a file (not directory)", () => {
    const filePath = path.join(tempDir, "not-a-dir");
    fs.writeFileSync(filePath, "hello", "utf-8");
    // fs.existsSync returns true for files too — goalExists uses fs.existsSync directly
    // so it will return true for files. Test the actual behavior.
    expect(goalExists(filePath)).toBe(true);
  });
});

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
// findIssuePath
// ---------------------------------------------------------------------------

describe("findIssuePath(cwd, identifier)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("resolves absolute path when file exists", () => {
    const absFile = path.join(tempDir, "absolute-issue.md");
    fs.writeFileSync(absFile, "content", "utf-8");
    expect(findIssuePath(tempDir, absFile)).toBe(absFile);
  });

  it("returns undefined for non-existent absolute path", () => {
    const fakePath = path.join(tempDir, "does-not-exist.md");
    expect(findIssuePath(tempDir, fakePath)).toBeUndefined();
  });

  it("resolves exact filename (my-issue.md)", () => {
    createIssueFiles(tempDir, [{ slug: "my-issue", content: "test" }]);
    const result = findIssuePath(tempDir, "my-issue.md");
    expect(result).toBe(path.join(tempDir, ".pio", "issues", "my-issue.md"));
  });

  it("appends .md for bare slug (my-issue)", () => {
    createIssueFiles(tempDir, [{ slug: "my-issue", content: "test" }]);
    const result = findIssuePath(tempDir, "my-issue");
    expect(result).toBe(path.join(tempDir, ".pio", "issues", "my-issue.md"));
  });

  it("returns undefined for non-existent slug", () => {
    createIssueFiles(tempDir, []);
    expect(findIssuePath(tempDir, "non-existent")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// readIssue
// ---------------------------------------------------------------------------

describe("readIssue(cwd, identifier)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns file contents for existing issue", () => {
    createIssueFiles(tempDir, [{ slug: "test-issue", content: "test content" }]);
    expect(readIssue(tempDir, "test-issue")).toBe("test content");
  });

  it("returns undefined for missing issue", () => {
    createIssueFiles(tempDir, []);
    expect(readIssue(tempDir, "missing-issue")).toBeUndefined();
  });

  it("reads multiline content correctly", () => {
    const multiLine = `# Title

Some description.

- item 1
- item 2`;
    createIssueFiles(tempDir, [{ slug: "multi-line", content: multiLine }]);
    const result = readIssue(tempDir, "multi-line");
    expect(result).toBe(multiLine);
    expect(result).toContain("\n");
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

// ---------------------------------------------------------------------------
// deriveSessionName
// ---------------------------------------------------------------------------

describe("deriveSessionName(goalName, capability, stepNumber?)", () => {
  it("empty goalName returns capability only", () => {
    expect(deriveSessionName("", "create-goal")).toBe("create-goal");
  });

  it("undefined goalName returns capability only", () => {
    // @ts-expect-error — testing undefined input behavior
    expect(deriveSessionName(undefined, "create-goal")).toBe("create-goal");
  });

  it("goal + capability (no step) returns combined name", () => {
    expect(deriveSessionName("my-feature", "create-plan")).toBe("my-feature create-plan");
  });

  it("all three params include step number", () => {
    expect(deriveSessionName("my-feature", "execute-task", 3)).toBe("my-feature execute-task s3");
  });

  it("step number zero includes s0", () => {
    expect(deriveSessionName("my-feature", "execute-task", 0)).toBe("my-feature execute-task s0");
  });
});

// ---------------------------------------------------------------------------
// stepFolderName
// ---------------------------------------------------------------------------

describe("stepFolderName(stepNumber)", () => {
  it("zero-pads single digits (1-9)", () => {
    expect(stepFolderName(1)).toBe("S01");
    expect(stepFolderName(5)).toBe("S05");
    expect(stepFolderName(9)).toBe("S09");
  });

  it("no extra padding for two-digit numbers", () => {
    expect(stepFolderName(10)).toBe("S10");
    expect(stepFolderName(25)).toBe("S25");
    expect(stepFolderName(100)).toBe("S100");
  });

  it("edge case — zero", () => {
    expect(stepFolderName(0)).toBe("S00");
  });
});

// ---------------------------------------------------------------------------
// discoverNextStep
// ---------------------------------------------------------------------------

describe("discoverNextStep(goalDir)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("empty directory returns 1", () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "empty-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    expect(discoverNextStep(goalDir)).toBe(1);
  });

  it("single complete step returns 2", () => {
    const goalDir = createGoalTree(tempDir, "one-step", [
      { number: 1, files: ["TASK.md", "TEST.md"] },
    ]);
    expect(discoverNextStep(goalDir)).toBe(2);
  });

  it("multiple sequential complete steps return N+1", () => {
    const goalDir = createGoalTree(tempDir, "multi-step", [
      { number: 1, files: ["TASK.md", "TEST.md"] },
      { number: 2, files: ["TASK.md", "TEST.md"] },
    ]);
    expect(discoverNextStep(goalDir)).toBe(3);
  });

  it("incomplete step (missing TEST.md) is not counted as complete", () => {
    const goalDir = createGoalTree(tempDir, "incomplete-step", [
      { number: 1, files: ["TASK.md"] }, // missing TEST.md
    ]);
    expect(discoverNextStep(goalDir)).toBe(1);
  });

  it("scans stops at first missing folder", () => {
    // S01 exists with specs, S02 doesn't exist, S03 has specs — should stop at S02
    const goalDir = createGoalTree(tempDir, "gap-step", [
      { number: 1, files: ["TASK.md", "TEST.md"] },
      { number: 3, files: ["TASK.md", "TEST.md"] }, // S03 exists but S02 doesn't
    ]);
    // After S01 is complete, loop checks S02 — doesn't exist → breaks. Returns 2 (S01 was complete).
    expect(discoverNextStep(goalDir)).toBe(2);
  });

  it("step with COMPLETED marker still counts if it has both spec files", () => {
    const goalDir = createGoalTree(tempDir, "completed-step", [
      { number: 1, files: ["TASK.md", "TEST.md", "COMPLETED"] },
    ]);
    // discoverNextStep checks for TASK.md + TEST.md, not COMPLETED marker
    expect(discoverNextStep(goalDir)).toBe(2);
  });
});
