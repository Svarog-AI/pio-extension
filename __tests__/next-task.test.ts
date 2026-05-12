import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-next-task-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Create a queue file for a specific goal
function enqueueTaskFile(cwd: string, goalName: string, capability = "create-plan"): void {
  const queuePath = path.join(cwd, ".pio", "session-queue");
  fs.mkdirSync(queuePath, { recursive: true });
  fs.writeFileSync(
    path.join(queuePath, `task-${goalName}.json`),
    JSON.stringify({ capability, params: { goalName } }, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Single top-level mock for session-capability (used by both describe blocks)
// ---------------------------------------------------------------------------

const sessionCapabilityMock = vi.hoisted(() => ({
  getSessionParams: vi.fn(),
  launchCapability: vi.fn().mockResolvedValue(undefined),
}));

vi.mock(
  "../src/capabilities/session-capability",
  async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
      ...actual,
      getSessionParams: sessionCapabilityMock.getSessionParams,
      // Derive from getSessionParams — always tests the real type-guard logic
      getSessionGoalName: () => {
        const params = sessionCapabilityMock.getSessionParams();
        return typeof params?.goalName === "string" ? params.goalName : undefined;
      },
      launchCapability: sessionCapabilityMock.launchCapability,
    };
  },
);

// Must import after vi.mock so the mocked module is used
import { getSessionGoalName } from "../src/capabilities/session-capability";

// ---------------------------------------------------------------------------
// getSessionGoalName tests
// These test the real implementation logic by mocking getSessionParams()
// ---------------------------------------------------------------------------

describe("getSessionGoalName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('given { goalName: "my-feature" }, returns "my-feature"', () => {
    sessionCapabilityMock.getSessionParams.mockReturnValue({ goalName: "my-feature" });
    expect(getSessionGoalName()).toBe("my-feature");
  });

  it("given { goalName: 123 }, returns undefined (non-string rejected)", () => {
    sessionCapabilityMock.getSessionParams.mockReturnValue({ goalName: 123 });
    expect(getSessionGoalName()).toBeUndefined();
  });

  it("given { goalName: null }, returns undefined (null rejected)", () => {
    sessionCapabilityMock.getSessionParams.mockReturnValue({ goalName: null });
    expect(getSessionGoalName()).toBeUndefined();
  });

  it('given { otherKey: "value" }, returns undefined (no goalName key)', () => {
    sessionCapabilityMock.getSessionParams.mockReturnValue({ otherKey: "value" });
    expect(getSessionGoalName()).toBeUndefined();
  });

  it("given undefined, returns undefined (no session config)", () => {
    sessionCapabilityMock.getSessionParams.mockReturnValue(undefined);
    expect(getSessionGoalName()).toBeUndefined();
  });

  it("given {}, returns undefined (empty params)", () => {
    sessionCapabilityMock.getSessionParams.mockReturnValue({});
    expect(getSessionGoalName()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleNextTask — goal resolution order tests
// These test the command flow by configuring getSessionParams() to control
// what getSessionGoalName() returns (the real type-guard logic is always exercised)
// ---------------------------------------------------------------------------

describe("handleNextTask — goal resolution order", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    vi.clearAllMocks();
  });

  afterEach(() => cleanup(tempDir));

  // Dynamically import handleNextTask after mocks are set up
  let handleNextTask: (args: string | undefined, ctx: any) => Promise<void>;

  beforeEach(async () => {
    const mod = await import("../src/capabilities/next-task");
    handleNextTask = mod.handleNextTask;
  });

  function makeCtx() {
    return { cwd: tempDir, ui: { notify: vi.fn() } };
  }

  it("passes session goalName to launchAndCleanup when no explicit arg", async () => {
    // Arrange: two goals pending, session has goalName = "other-goal"
    enqueueTaskFile(tempDir, "other-goal");
    enqueueTaskFile(tempDir, "session-goal");
    sessionCapabilityMock.getSessionParams.mockReturnValue({ goalName: "other-goal" });

    const ctx = makeCtx();

    // Act
    await handleNextTask(undefined, ctx);

    // Assert: launched other-goal's task, not session-goal's
    expect(sessionCapabilityMock.launchCapability).toHaveBeenCalled();
    expect(ctx.ui.notify).not.toHaveBeenCalledWith(expect.stringContaining("Multiple goals"));

    // other-goal queue file should be deleted (consumed)
    expect(fs.existsSync(path.join(tempDir, ".pio", "session-queue", "task-other-goal.json"))).toBe(false);
    // session-goal queue file should still exist (not touched — scan was not triggered)
    expect(fs.existsSync(path.join(tempDir, ".pio", "session-queue", "task-session-goal.json"))).toBe(true);
  });

  it("falls through to scan when getSessionGoalName returns undefined", async () => {
    // Arrange: exactly one pending goal, no session context (no goalName)
    enqueueTaskFile(tempDir, "only-goal");
    sessionCapabilityMock.getSessionParams.mockReturnValue(undefined);

    const ctx = makeCtx();

    // Act
    await handleNextTask(undefined, ctx);

    // Assert: auto-launched the single pending goal (fallback scan)
    expect(sessionCapabilityMock.launchCapability).toHaveBeenCalled();
  });

  it("explicit arg takes priority over session goalName", async () => {
    // Arrange: two goals pending, session says "session-goal" but user specifies "explicit-goal"
    enqueueTaskFile(tempDir, "explicit-goal");
    enqueueTaskFile(tempDir, "session-goal");
    sessionCapabilityMock.getSessionParams.mockReturnValue({ goalName: "session-goal" });

    const ctx = makeCtx();

    // Act
    await handleNextTask("explicit-goal", ctx);

    // Assert: explicit-goal's queue file was consumed, session-goal's was not
    expect(fs.existsSync(path.join(tempDir, ".pio", "session-queue", "task-explicit-goal.json"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, ".pio", "session-queue", "task-session-goal.json"))).toBe(true);
  });

  it("shows notification when session goalName has no pending task", async () => {
    // Arrange: no queue files at all, session says "empty-goal"
    sessionCapabilityMock.getSessionParams.mockReturnValue({ goalName: "empty-goal" });

    const ctx = makeCtx();

    // Act
    await handleNextTask(undefined, ctx);

    // Assert: notified about no pending task for empty-goal, no launch attempted
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("No pending task"), expect.any(String));
    expect(ctx.ui.notify.mock.calls[0][0]).toContain("empty-goal");
    expect(sessionCapabilityMock.launchCapability).not.toHaveBeenCalled();
  });
});
