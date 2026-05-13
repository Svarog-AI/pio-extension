import type { PrepareSessionCallback, StaticCapabilityConfig, CapabilityConfig } from "../src/types";
import { resolveCapabilityConfig } from "../src/utils";

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
