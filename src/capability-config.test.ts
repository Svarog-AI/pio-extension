import * as path from "node:path";
import type { PrepareSessionCallback, StaticCapabilityConfig, CapabilityConfig } from "./types";
import { resolveCapabilityConfig } from "./capability-config";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeCwd(): string {
  return "/tmp/pio-test-proj";
}

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — happy path with static config
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — happy path with static config", () => {
  it("resolves create-goal config with correct capability name and prompt", async () => {
    const cwd = makeCwd();
    const params = { capability: "create-goal" as string, goalName: "my-feature" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result).toBeDefined();
    expect(result!.capability).toBe("create-goal");
    expect(result!.prompt).toBe("create-goal.md");
  });

  it("resolves create-plan config with correct prompt and validation", async () => {
    const cwd = makeCwd();
    const params = { capability: "create-plan" as string, goalName: "my-feature" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result).toBeDefined();
    expect(result!.prompt).toBe("create-plan.md");
    expect(result!.validation?.files).toContain("PLAN.md");
  });

  it("derives workingDir from goalName (goal-scoped)", async () => {
    const cwd = "/tmp/test-proj";
    const params = { capability: "create-goal" as string, goalName: "my-feature" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result!.workingDir).toBe(path.join("/tmp/test-proj", ".pio", "goals", "my-feature"));
  });

  it("falls back to cwd when no goalName (project-scoped)", async () => {
    const cwd = "/tmp/test-proj";
    const params = { capability: "create-goal" as string };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result!.workingDir).toBe("/tmp/test-proj");
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — session name derivation
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — session name derivation", () => {
  it("derives session name with goal + capability (no step)", async () => {
    const params = { capability: "create-plan" as string, goalName: "my-feature" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.sessionName).toBe("my-feature create-plan");
  });

  it("derives session name with step number", async () => {
    const params = { capability: "execute-task" as string, goalName: "my-feature", stepNumber: 3 };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.sessionName).toBe("my-feature execute-task s3");
  });

  it("derives session name without goalName (capability only)", async () => {
    const params = { capability: "create-goal" as string };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.sessionName).toBe("create-goal");
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — initial message derivation
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — initial message derivation", () => {
  it("uses defaultInitialMessage when no params.initialMessage", async () => {
    const cwd = "/tmp/proj";
    const params = { capability: "create-goal" as string, goalName: "my-feature" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(typeof result!.initialMessage).toBe("string");
    expect(result!.initialMessage!.length).toBeGreaterThan(0);
    expect(result!.initialMessage!).toContain(".pio");
  });

  it("uses explicit params.initialMessage over defaultInitialMessage", async () => {
    const cwd = "/tmp/proj";
    const params = {
      capability: "create-goal" as string,
      goalName: "my-feature",
      initialMessage: "custom message",
    };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result!.initialMessage).toBe("custom message");
  });

  it("defaultInitialMessage contains workingDir path info", async () => {
    const cwd = "/tmp/proj";
    const params = { capability: "create-plan" as string, goalName: "my-feature" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result!.initialMessage!).toContain("my-feature");
    expect(result!.initialMessage!).toContain(".pio");
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — step-dependent callback resolution
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — step-dependent callback resolution", () => {
  it("invokes evolve-plan validation callback with correct stepNumber", async () => {
    const params = { capability: "evolve-plan" as string, goalName: "my-feature", stepNumber: 3 };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.validation?.files).toContain("S03/TASK.md");
    expect(result!.validation?.files).toContain("S03/TEST.md");
  });

  it("invokes evolve-plan writeAllowlist callback with correct stepNumber", async () => {
    const params = { capability: "evolve-plan" as string, goalName: "my-feature", stepNumber: 5 };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.writeAllowlist).toContain("S05/TASK.md");
    expect(result!.writeAllowlist).toContain("S05/TEST.md");
  });

  it("invokes execute-task validation callback (checks for SUMMARY.md)", async () => {
    const params = { capability: "execute-task" as string, goalName: "my-feature", stepNumber: 2 };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.validation?.files).toContain("S02/SUMMARY.md");
  });

  it("invokes execute-task readOnlyFiles callback", async () => {
    const params = { capability: "execute-task" as string, goalName: "my-feature", stepNumber: 1 };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.readOnlyFiles).toContain("S01/TASK.md");
    expect(result!.readOnlyFiles).toContain("S01/TEST.md");
  });

  it("invokes review-code writeAllowlist callback (REVIEW.md only)", async () => {
    const params = { capability: "review-code" as string, goalName: "my-feature", stepNumber: 4 };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.writeAllowlist).toContain("S04/REVIEW.md");
    expect(result!.writeAllowlist).not.toContain("S04/APPROVED");
    expect(result!.writeAllowlist).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — graceful error handling
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — graceful error handling", () => {
  it("returns undefined when capability param is missing", async () => {
    const params = { goalName: "my-feature" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeUndefined();
  });

  it("returns undefined when params is undefined", async () => {
    const result = await resolveCapabilityConfig("/tmp/proj");

    expect(result).toBeUndefined();
  });

  it("returns undefined for unknown capability name", async () => {
    // Suppress console.warn from the failed dynamic import
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const params = { capability: "nonexistent-capability" as string, goalName: "my-feature" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeUndefined();

    warnSpy.mockRestore();
  });

  it("preserves sessionParams in result", async () => {
    const params = { capability: "create-goal" as string, goalName: "my-feature", customField: "value" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.sessionParams?.customField).toBe("value");
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — static config passthrough
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — static config passthrough", () => {
  it("passes through static validation (create-goal has files: [\"GOAL.md\"])", async () => {
    const params = { capability: "create-goal" as string, goalName: "my-feature" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(JSON.stringify(result!.validation)).toBe(JSON.stringify({ files: ["GOAL.md"] }));
  });

  it("passes through static writeAllowlist (create-goal has [\"GOAL.md\"])", async () => {
    const params = { capability: "create-goal" as string, goalName: "my-feature" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(JSON.stringify(result!.writeAllowlist)).toBe(JSON.stringify(["GOAL.md"]));
  });
});

// ---------------------------------------------------------------------------
// PrepareSessionCallback — compile-time type verification
// ---------------------------------------------------------------------------

describe("PrepareSessionCallback", () => {
  it("sync callback with correct signature satisfies the type", () => {
    // Arrange + Act: A sync callback matching the expected signature should satisfy PrepareSessionCallback
    const cb: PrepareSessionCallback = (workingDir: string, params?: Record<string, unknown>) => {
      // Perform side effects (e.g., file cleanup)
      if (workingDir.length > 0 && params?.stepNumber) {
        // noop — type check is the assertion
      }
    };

    // Assert: if this compiles, the type is correct
    expect(typeof cb).toBe("function");
  });

  it("async callback returning Promise<void> satisfies the type", async () => {
    // Arrange + Act: An async callback should also satisfy PrepareSessionCallback
    const cb: PrepareSessionCallback = async (workingDir: string, params?: Record<string, unknown>) => {
      // Simulate async file deletion
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    // Assert: calling it should resolve without error
    await cb("/tmp/test");
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// StaticCapabilityConfig.prepareSession — compile-time type verification
// ---------------------------------------------------------------------------

describe("StaticCapabilityConfig.prepareSession", () => {
  it("prepareSession is optional — config without it is valid", () => {
    // Arrange + Act: A StaticCapabilityConfig without prepareSession should be valid
    const config: StaticCapabilityConfig = {
      prompt: "review-code.md",
      defaultInitialMessage: () => "Review this code",
    };

    // Assert: verify the field is absent
    expect(config.prepareSession).toBeUndefined();
  });

  it("prepareSession accepts a matching callback", () => {
    // Arrange: define a prepare callback
    const prepareCb: PrepareSessionCallback = (workingDir, params) => {
      // cleanup logic would go here
    };

    // Act: config with prepareSession should be valid
    const config: StaticCapabilityConfig = {
      prompt: "review-code.md",
      defaultInitialMessage: () => "Review this code",
      prepareSession: prepareCb,
    };

    // Assert: verify the callback is present and callable
    expect(config.prepareSession).toBe(prepareCb);
    expect(typeof config.prepareSession).toBe("function");
  });

  it("prepareSession can be defined inline as an arrow function", () => {
    // Arrange + Act
    const config: StaticCapabilityConfig = {
      prompt: "test.md",
      defaultInitialMessage: () => "Hello",
      prepareSession: (workingDir: string, params?: Record<string, unknown>) => {
        if (workingDir) { /* cleanup */ }
      },
    };

    // Assert
    expect(typeof config.prepareSession).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// CapabilityConfig.prepareSession — compile-time type verification
// ---------------------------------------------------------------------------

describe("CapabilityConfig.prepareSession", () => {
  it("prepareSession is optional on resolved CapabilityConfig", () => {
    // Arrange + Act: A CapabilityConfig without prepareSession should be valid
    const config: CapabilityConfig = {
      capability: "create-goal",
    };

    // Assert
    expect(config.prepareSession).toBeUndefined();
  });

  it("prepareSession accepts a callback on resolved CapabilityConfig", () => {
    // Arrange
    const cb: PrepareSessionCallback = (workingDir) => {};

    // Act
    const config: CapabilityConfig = {
      capability: "review-code",
      prepareSession: cb,
    };

    // Assert
    expect(config.prepareSession).toBe(cb);
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — prepareSession resolution
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — prepareSession", () => {
  it("prepareSession is undefined when capability does not define it", async () => {
    // Arrange: create-goal does not define prepareSession
    const params = { capability: "create-goal" as string, goalName: "my-feature" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert
    expect(result).toBeDefined();
    expect(result!.prepareSession).toBeUndefined();
  });

  it("prepareSession is defined for review-code but undefined for other capabilities", async () => {
    // Arrange: list of all current capabilities
    const capabilities = [
      { name: "create-goal", goalName: "test-goal" },
      { name: "create-plan", goalName: "test-goal" },
      { name: "evolve-plan", goalName: "test-goal", stepNumber: 1 },
      { name: "execute-task", goalName: "test-goal", stepNumber: 1 },
      { name: "review-code", goalName: "test-goal", stepNumber: 1 },
      { name: "delete-goal", goalName: "test-goal" },
      { name: "project-context" },
    ];

    for (const cap of capabilities) {
      const params = { capability: cap.name as string, goalName: cap.goalName as string, stepNumber: cap.stepNumber };
      const result = await resolveCapabilityConfig("/tmp/proj", params);
      if (result === undefined) continue;

      if (cap.name === "review-code") {
        // review-code defines prepareSession
        expect(typeof result.prepareSession).toBe("function");
      } else {
        // No other capability defines prepareSession yet
        expect(result.prepareSession).toBeUndefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility — capabilities without prepareSession still work
// ---------------------------------------------------------------------------

describe("backward compatibility — capabilities without prepareSession", () => {
  it("resolving create-goal (no prepareSession) produces valid config with undefined prepareSession", async () => {
    const params = { capability: "create-goal" as string, goalName: "my-feature" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeDefined();
    expect(result!.capability).toBe("create-goal");
    expect(result!.prepareSession).toBeUndefined();
  });

  it("resolving create-plan (no prepareSession) produces valid config with undefined prepareSession", async () => {
    const params = { capability: "create-plan" as string, goalName: "my-feature" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeDefined();
    expect(result!.capability).toBe("create-plan");
    expect(result!.prepareSession).toBeUndefined();
  });

  it("resolving execute-task (no prepareSession yet) produces valid config with undefined prepareSession", async () => {
    const params = { capability: "execute-task" as string, goalName: "my-feature", stepNumber: 1 };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeDefined();
    expect(result!.capability).toBe("execute-task");
    expect(result!.prepareSession).toBeUndefined();
  });

  it("resolving review-code produces valid config with prepareSession defined", async () => {
    const params = { capability: "review-code" as string, goalName: "my-feature", stepNumber: 2 };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeDefined();
    expect(result!.capability).toBe("review-code");
    expect(typeof result!.prepareSession).toBe("function");
  });
});
