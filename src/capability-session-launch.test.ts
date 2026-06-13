import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-launch-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// launchCapability — input validation
// ---------------------------------------------------------------------------

describe("launchCapability — input validation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  // Build a mock context for launchCapability
  function makeLaunchCtx() {
    const notifyMock = vi.fn();
    return {
      cwd: tempDir,
      ui: { notify: notifyMock },
      sessionManager: {
        getSessionFile: () => "parent-session.json",
      },
      newSession: vi.fn().mockResolvedValue({ cancelled: false }),
    } as any;
  }

  it("validates inputs from config.contract before creating a session", async () => {
    // Arrange: create goal dir with GOAL.md
    const goalDir = path.join(tempDir, ".pio", "goals", "my-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "# Goal\n", "utf-8");

    const mod = await import("./capability-session");
    const ctx = makeLaunchCtx();

    const config = {
      capability: "create-plan",
      workingDir: goalDir,
      contract: { inputs: [{ file: "GOAL.md" }], outputs: [] },
      sessionParams: { goalName: "my-goal" },
    };

    // Act & Assert: should not throw — GOAL.md exists
    await expect(mod.launchCapability(ctx, config as any)).resolves.toBeUndefined();
    expect(ctx.newSession).toHaveBeenCalledTimes(1);
  });

  it("throws descriptive error when required file is missing", async () => {
    // Arrange: create goal dir without GOAL.md
    const goalDir = path.join(tempDir, ".pio", "goals", "my-goal");
    fs.mkdirSync(goalDir, { recursive: true });

    const mod = await import("./capability-session");
    const ctx = makeLaunchCtx();

    const config = {
      capability: "create-plan",
      workingDir: goalDir,
      contract: { inputs: [{ file: "GOAL.md" }], outputs: [] },
      sessionParams: { goalName: "my-goal" },
    };

    // Act & Assert: should throw with capability name and file name
    await expect(mod.launchCapability(ctx, config as any)).rejects.toThrow(
      /Input validation failed for "create-plan".*GOAL\.md/,
    );
    // newSession should NOT be called
    expect(ctx.newSession).not.toHaveBeenCalled();
  });

  it("handles placeholder resolution via sessionParams", async () => {
    // Arrange: create goal dir with S03/TASK.md
    const goalDir = path.join(tempDir, ".pio", "goals", "my-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.mkdirSync(path.join(goalDir, "S03"), { recursive: true });
    fs.writeFileSync(path.join(goalDir, "S03", "TASK.md"), "# Task\n", "utf-8");

    const mod = await import("./capability-session");
    const ctx = makeLaunchCtx();

    const config = {
      capability: "execute-task",
      workingDir: goalDir,
      contract: {
        inputs: [{ file: "S{stepNumber:02d}/TASK.md" }],
        outputs: [],
      },
      sessionParams: { goalName: "my-goal", stepNumber: 3 },
    };

    // Act & Assert: should not throw — S03/TASK.md exists after resolution
    await expect(mod.launchCapability(ctx, config as any)).resolves.toBeUndefined();
    expect(ctx.newSession).toHaveBeenCalledTimes(1);
  });

  it("throws descriptive error when placeholder key is missing from params", async () => {
    // Arrange: create goal dir
    const goalDir = path.join(tempDir, ".pio", "goals", "my-goal");
    fs.mkdirSync(goalDir, { recursive: true });

    const mod = await import("./capability-session");
    const ctx = makeLaunchCtx();

    const config = {
      capability: "execute-task",
      workingDir: goalDir,
      contract: {
        inputs: [{ file: "S{stepNumber:02d}/TASK.md" }],
        outputs: [],
      },
      sessionParams: { goalName: "my-goal" }, // missing stepNumber
    };

    // Act & Assert: should throw with unresolved placeholder info
    await expect(mod.launchCapability(ctx, config as any)).rejects.toThrow(
      /Input validation failed for "execute-task".*Unresolved placeholder/,
    );
    expect(ctx.newSession).not.toHaveBeenCalled();
  });

  it("skips validation when contract is absent", async () => {
    const mod = await import("./capability-session");
    const ctx = makeLaunchCtx();

    const config = {
      capability: "test-cap",
      workingDir: tempDir,
      // no contract field
    };

    // Act & Assert: should not throw, newSession called
    await expect(mod.launchCapability(ctx, config as any)).resolves.toBeUndefined();
    expect(ctx.newSession).toHaveBeenCalledTimes(1);
  });

  it("skips validation when workingDir is absent", async () => {
    const mod = await import("./capability-session");
    const ctx = makeLaunchCtx();

    const config = {
      capability: "test-cap",
      contract: { inputs: [{ file: "GOAL.md" }], outputs: [] },
      // no workingDir
    };

    // Act & Assert: should not throw, newSession called
    await expect(mod.launchCapability(ctx, config as any)).resolves.toBeUndefined();
    expect(ctx.newSession).toHaveBeenCalledTimes(1);
  });
});
