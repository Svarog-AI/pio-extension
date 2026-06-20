import * as fs from "node:fs";
import * as path from "node:path";
import type { PrepareSessionCallback, PostValidateCallback, PostExecuteCallback, CapabilityConfig, CapabilitySkills } from "./types";
import { resolveCapabilityConfig, resolvePaths, resolveContractPath } from "./capability-config";
import { enqueueTask, readPendingTask } from "./queues";

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
  it("resolves create-goal config with correct capability name", async () => {
    const cwd = makeCwd();
    const params = { capability: "create-goal" as string, goalName: "my-feature", sessionName: "test" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result).toBeDefined();
    expect(result!.capability).toBe("create-goal");
  });

  it("resolves create-plan config with correct contract outputs", async () => {
    const cwd = makeCwd();
    const params = { capability: "create-plan" as string, goalName: "my-feature", sessionName: "test" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result).toBeDefined();
    expect(result!.contract.outputs).toContainEqual(expect.objectContaining({ file: "PLAN.md" }));
  });

  it("returns .pio/ as default workingDir regardless of goalName", async () => {
    const cwd = "/tmp/test-proj";
    const params = { capability: "create-goal" as string, goalName: "my-feature", sessionName: "test" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result!.workingDir).toBe(path.join("/tmp/test-proj", ".pio"));
  });

  it("returns .pio/ as default workingDir when no goalName", async () => {
    const cwd = "/tmp/test-proj";
    const params = { capability: "create-goal" as string, sessionName: "test" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result!.workingDir).toBe(path.join("/tmp/test-proj", ".pio"));
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — explicit workingDir override
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — explicit workingDir override", () => {
  it("explicit workingDir overrides goalName-based derivation", async () => {
    const cwd = "/tmp/proj";
    const params = {
      capability: "finalize-goal" as string,
      goalName: "my-feature",
      workingDir: "/explicit/path",
      sessionName: "test",
    };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result!.workingDir).toBe("/explicit/path");
  });

  it("returns .pio/ as default when workingDir is absent", async () => {
    const cwd = "/tmp/proj";
    const params = { capability: "create-plan" as string, goalName: "my-feature", sessionName: "test" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result!.workingDir).toBe(path.join("/tmp/proj", ".pio"));
  });

  it("returns .pio/ as default when neither workingDir nor goalName is present", async () => {
    const cwd = "/tmp/proj";
    const params = { capability: "project-context" as string, sessionName: "test" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result!.workingDir).toBe(path.join("/tmp/proj", ".pio"));
  });

  it("empty string workingDir falls back to .pio/ default", async () => {
    const cwd = "/tmp/proj";
    const params = {
      capability: "finalize-goal" as string,
      goalName: "my-feature",
      workingDir: "",
      sessionName: "test",
    };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result!.workingDir).toBe(path.join("/tmp/proj", ".pio"));
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — session name passthrough
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — session name passthrough", () => {
  it("passes through params.sessionName as-is", async () => {
    const params = { capability: "create-plan" as string, sessionName: "my-feature create-plan" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.sessionName).toBe("my-feature create-plan");
  });

  it("passes through sessionName with step number", async () => {
    const params = { capability: "execute-task" as string, sessionName: "my-feature execute-task s3", stepNumber: 3 };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.sessionName).toBe("my-feature execute-task s3");
  });

  it("passes through sessionName without goalName", async () => {
    const params = { capability: "create-goal" as string, sessionName: "create-goal" };

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
    const params = { capability: "create-goal" as string, goalName: "my-feature", sessionName: "test" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(typeof result!.initialMessage).toBe("string");
    expect(result!.initialMessage).toBe("Ready.");
  });

  it("uses explicit params.initialMessage over defaultInitialMessage", async () => {
    const cwd = "/tmp/proj";
    const params = {
      capability: "create-goal" as string,
      goalName: "my-feature",
      initialMessage: "custom message",
      sessionName: "test",
    };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result!.initialMessage).toBe("custom message");
  });

  it("defaultInitialMessage is a generic message (no path assumptions)", async () => {
    const cwd = "/tmp/proj";
    const params = { capability: "create-plan" as string, goalName: "my-feature", sessionName: "test" };

    const result = await resolveCapabilityConfig(cwd, params);

    expect(result!.initialMessage).toBe("Ready.");
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — step-dependent callback resolution
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — step-dependent callback resolution", () => {
  it("invokes evolve-plan contract with correct outputs", async () => {
    const params = { capability: "evolve-plan" as string, goalName: "my-feature", stepNumber: 3, sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.contract.outputs).toContainEqual(expect.objectContaining({ file: "S{stepNumber:02d}/TASK.md" }));
    const hasTest = result!.contract.outputs.some((e: any) => "file" in e && e.file.includes("TEST.md"));
    expect(hasTest).toBe(false);
  });

  it("invokes evolve-plan writeAllowlist callback with correct stepNumber", async () => {
    const params = { capability: "evolve-plan" as string, goalName: "my-feature", stepNumber: 5, sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.writeAllowlist).toContain("S05/TASK.md");
    expect(result!.writeAllowlist).not.toContain("S05/TEST.md");
  });

  it("invokes execute-task contract with correct outputs", async () => {
    const params = { capability: "execute-task" as string, goalName: "my-feature", stepNumber: 2, sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.contract.outputs).toContainEqual(expect.objectContaining({ file: "S{stepNumber:02d}/TEST.md" }));
    expect(result!.contract.outputs).toContainEqual(expect.objectContaining({ file: "S{stepNumber:02d}/SUMMARY.md" }));
  });

  it("invokes execute-task readOnlyFiles callback", async () => {
    const params = { capability: "execute-task" as string, goalName: "my-feature", stepNumber: 1, sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.readOnlyFiles).toContain("S01/TASK.md");
    expect(result!.readOnlyFiles).not.toContain("S01/TEST.md");
  });

  it("invokes review-task writeAllowlist callback (REVIEW.md only)", async () => {
    const params = { capability: "review-task" as string, goalName: "my-feature", stepNumber: 4, sessionName: "test" };

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

    const params = { capability: "nonexistent-capability" as string, goalName: "my-feature", sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeUndefined();

    warnSpy.mockRestore();
  });

  it("preserves sessionParams in result", async () => {
    const params = { capability: "create-goal" as string, goalName: "my-feature", customField: "value", sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.sessionParams?.customField).toBe("value");
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — static config passthrough
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — static config passthrough", () => {
  it("passes through static contract outputs (create-goal has GOAL.md)", async () => {
    const params = { capability: "create-goal" as string, goalName: "my-feature", sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.contract.outputs).toContainEqual(expect.objectContaining({ file: "GOAL.md" }));
  });

  it("passes through static writeAllowlist (create-goal has [\"GOAL.md\"])", async () => {
    const params = { capability: "create-goal" as string, goalName: "my-feature", sessionName: "test" };

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
// CapabilityConfig.prepareSession — compile-time type verification
// ---------------------------------------------------------------------------

describe("CapabilityConfig.prepareSession", () => {
  it("prepareSession is optional on resolved CapabilityConfig", () => {
    // Arrange + Act: A CapabilityConfig without prepareSession should be valid
    const config: CapabilityConfig = {
      capability: "create-goal",
      contract: { inputs: [], outputs: [] },
    };

    // Assert
    expect(config.prepareSession).toBeUndefined();
  });

  it("prepareSession accepts a callback on resolved CapabilityConfig", () => {
    // Arrange
    const cb: PrepareSessionCallback = (workingDir) => {};

    // Act
    const config: CapabilityConfig = {
      capability: "review-task",
      contract: { inputs: [], outputs: [] },
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
    const params = { capability: "create-goal" as string, goalName: "my-feature", sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert
    expect(result).toBeDefined();
    expect(result!.prepareSession).toBeUndefined();
  });

  it("prepareSession is defined for review-task but undefined for other capabilities", async () => {
    // Arrange: list of all current capabilities
    const capabilities = [
      { name: "create-goal", goalName: "test-goal" },
      { name: "create-plan", goalName: "test-goal" },
      { name: "evolve-plan", goalName: "test-goal", stepNumber: 1 },
      { name: "execute-task", goalName: "test-goal", stepNumber: 1 },
      { name: "review-task", goalName: "test-goal", stepNumber: 1 },
      { name: "delete-goal", goalName: "test-goal" },
      { name: "project-context" },
    ];

    for (const cap of capabilities) {
      const params = { capability: cap.name as string, goalName: cap.goalName as string, stepNumber: cap.stepNumber, sessionName: "test" };
      const result = await resolveCapabilityConfig("/tmp/proj", params);
      if (result === undefined) continue;

      if (cap.name === "review-task" || cap.name === "execute-task") {
        // review-task and execute-task define prepareSession
        expect(typeof result.prepareSession).toBe("function");
      } else {
        // Other capabilities without prepareSession
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
    const params = { capability: "create-goal" as string, goalName: "my-feature", sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeDefined();
    expect(result!.capability).toBe("create-goal");
    expect(result!.prepareSession).toBeUndefined();
  });

  it("resolving create-plan (no prepareSession) produces valid config with undefined prepareSession", async () => {
    const params = { capability: "create-plan" as string, goalName: "my-feature", sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeDefined();
    expect(result!.capability).toBe("create-plan");
    expect(result!.prepareSession).toBeUndefined();
  });

  it("resolving execute-task produces valid config with prepareSession defined", async () => {
    const params = { capability: "execute-task" as string, goalName: "my-feature", stepNumber: 1, sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeDefined();
    expect(result!.capability).toBe("execute-task");
    expect(typeof result!.prepareSession).toBe("function");
  });

  it("resolving review-task produces valid config with prepareSession defined", async () => {
    const params = { capability: "review-task" as string, goalName: "my-feature", stepNumber: 2, sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeDefined();
    expect(result!.capability).toBe("review-task");
    expect(typeof result!.prepareSession).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — project-context writeAllowlist
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — project-context writeAllowlist", () => {
  it("resolves project-context with 7-file writeAllowlist", async () => {
    const params = { capability: "project-context" as string, sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeDefined();
    expect(result!.writeAllowlist).toHaveLength(7);
    expect(result!.writeAllowlist).toContain(".pio/PROJECT/OVERVIEW.md");
    expect(result!.writeAllowlist).toContain(".pio/PROJECT/DEVELOPMENT.md");
    expect(result!.writeAllowlist).toContain(".pio/PROJECT/CONVENTIONS.md");
    expect(result!.writeAllowlist).toContain(".pio/PROJECT/GIT.md");
    expect(result!.writeAllowlist).toContain(".pio/PROJECT/ARCHITECTURE.md");
    expect(result!.writeAllowlist).toContain(".pio/PROJECT/DEPENDENCIES.md");
    expect(result!.writeAllowlist).toContain(".pio/PROJECT/GLOSSARY.md");
  });

  it("project-context workingDir defaults to .pio/", async () => {
    const params = { capability: "project-context" as string, sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result!.workingDir).toBe(path.join("/tmp/proj", ".pio"));
  });
});

// ---------------------------------------------------------------------------
// PostValidateCallback — compile-time type verification
// ---------------------------------------------------------------------------

describe("PostValidateCallback", () => {
  it("sync callback with correct signature satisfies the type", () => {
    // Arrange + Act: A sync callback matching the expected signature should satisfy PostValidateCallback
    const cb: PostValidateCallback = (goalDir: string, params?: Record<string, unknown>) => {
      // Validation logic would go here
      if (goalDir.length > 0 && params?.stepNumber) {
        // noop — type check is the assertion
      }
      return { success: true };
    };

    // Assert: if this compiles, the type is correct
    expect(typeof cb).toBe("function");
  });

  it("callback returning success false with message satisfies the type", () => {
    // Arrange + Act
    const cb: PostValidateCallback = () => ({ success: false, message: "validation failed" });

    // Assert
    const result = cb("/tmp/test");
    expect(result.success).toBe(false);
    expect(result.message).toBe("validation failed");
  });

  it("callback returning success true without message satisfies the type", () => {
    // Arrange + Act
    const cb: PostValidateCallback = () => ({ success: true });

    // Assert
    const result = cb("/tmp/test");
    expect(result.success).toBe(true);
    expect(result.message).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PostExecuteCallback — compile-time type verification
// ---------------------------------------------------------------------------

describe("PostExecuteCallback", () => {
  it("sync callback with correct signature satisfies the type", () => {
    // Arrange + Act: A sync callback matching the expected signature should satisfy PostExecuteCallback
    const cb: PostExecuteCallback = (goalDir: string, params?: Record<string, unknown>) => {
      // Side effect logic would go here
      if (goalDir.length > 0 && params?.stepNumber) {
        // noop — type check is the assertion
      }
    };

    // Assert: if this compiles, the type is correct
    expect(typeof cb).toBe("function");
  });

  it("async callback returning Promise<void> satisfies the type", async () => {
    // Arrange + Act: An async callback should also satisfy PostExecuteCallback
    const cb: PostExecuteCallback = async (goalDir: string, params?: Record<string, unknown>) => {
      // Simulate async I/O
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    // Assert: calling it should resolve without error
    await cb("/tmp/test");
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CapabilityConfig.postValidate and postExecute — compile-time type verification
// ---------------------------------------------------------------------------

describe("CapabilityConfig.postValidate and postExecute", () => {
  it("postValidate and postExecute are optional on resolved CapabilityConfig", () => {
    // Arrange + Act: A CapabilityConfig without postValidate/postExecute should be valid
    const config: CapabilityConfig = {
      capability: "create-goal",
      contract: { inputs: [], outputs: [] },
    };

    // Assert
    expect(config.postValidate).toBeUndefined();
    expect(config.postExecute).toBeUndefined();
  });

  it("postValidate accepts a callback on resolved CapabilityConfig", () => {
    // Arrange
    const cb: PostValidateCallback = () => ({ success: true });

    // Act
    const config: CapabilityConfig = {
      capability: "review-task",
      contract: { inputs: [], outputs: [] },
      postValidate: cb,
    };

    // Assert
    expect(config.postValidate).toBe(cb);
  });

  it("postExecute accepts a callback on resolved CapabilityConfig", () => {
    // Arrange
    const cb: PostExecuteCallback = () => {};

    // Act
    const config: CapabilityConfig = {
      capability: "review-task",
      contract: { inputs: [], outputs: [] },
      postExecute: cb,
    };

    // Assert
    expect(config.postExecute).toBe(cb);
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — postValidate/postExecute passthrough
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — postValidate/postExecute passthrough", () => {
  it("passes through postValidate when the capability defines it (review-task)", async () => {
    // Arrange: review-task defines postValidate
    const params = { capability: "review-task" as string, goalName: "my-feature", stepNumber: 1, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: resolved config has postValidate as a function
    expect(result).toBeDefined();
    expect(typeof result!.postValidate).toBe("function");
  });

  it("postValidate is undefined when the capability does not define it (create-goal)", async () => {
    // Arrange: create-goal does not define postValidate
    const params = { capability: "create-goal" as string, goalName: "my-feature", sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert
    expect(result!.postValidate).toBeUndefined();
  });

  it("postExecute is defined when the capability defines it (review-task)", async () => {
    // Arrange: review-task now defines postExecute (Step 6)
    const params = { capability: "review-task" as string, goalName: "my-feature", stepNumber: 1, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert
    expect(result!.postExecute).toBeDefined();
    expect(typeof result!.postExecute).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Integration — state machine transition output → capability config resolution
// ---------------------------------------------------------------------------

/**
 * These tests verify the end-to-end interaction between state machine transition
 * output (Step 2) and capability config resolution (Step 3).
 * They simulate the params shape that resolveEvolvePlanToFinalizeGoal() returns for a
 * completed goal and verify resolveCapabilityConfig() handles it correctly.
 */
describe("resolveCapabilityConfig — finalize-goal auto-transition integration", () => {
  it("finalize-goal auto-transition params default workingDir to .pio/", async () => {
    // Arrange: simulate the params shape that resolveEvolvePlanToFinalizeGoal() returns
    // for a completed goal: { goalName, goalDir } (no workingDir)
    const cwd = "/tmp/auto-transition-proj";
    const params = {
      capability: "finalize-goal" as string,
      goalName: "my-feature",
      goalDir: path.join(cwd, ".pio", "goals", "my-feature"),
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig(cwd, params);

    // Assert: workingDir defaults to .pio/ (no goal-scoped derivation)
    expect(result).toBeDefined();
    expect(result!.workingDir).toBe(path.join(cwd, ".pio"));
    expect(result!.capability).toBe("finalize-goal");
    // writeAllowlist is no longer explicit — auto-derived from CONTRACT.outputs by validation guard
    expect(result!.writeAllowlist).toBeUndefined();
    // CONTRACT.outputs declares PROJECT files with root-level paths
    const projectOutputs = result!.contract.outputs.filter((o: any) => "file" in o && o.file.startsWith("/PROJECT/"));
    expect(projectOutputs).toHaveLength(7);
    expect(projectOutputs.some((o: any) => o.file === "/PROJECT/OVERVIEW.md")).toBe(true);
  });

  it("finalize-goal initial message includes goal name via auto-transition params", async () => {
    // Arrange: same params shape as resolveEvolvePlanToFinalizeGoal() for a completed goal
    const cwd = "/tmp/auto-transition-proj";
    const params = {
      capability: "finalize-goal" as string,
      goalName: "my-feature",
      goalDir: path.join(cwd, ".pio", "goals", "my-feature"),
      sessionName: "test",
    };

    // Act
    const result = await resolveCapabilityConfig(cwd, params);

    // Assert: initialMessage includes the goal name
    expect(result).toBeDefined();
    expect(result!.initialMessage).toContain("my-feature");
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — mandatory param enforcement
// ---------------------------------------------------------------------------

describe("resolveCapabilityConfig — mandatory param enforcement", () => {
  it("throws when sessionName is missing", async () => {
    const params = { capability: "create-goal" as string, goalName: "my-feature" };

    await expect(resolveCapabilityConfig("/tmp/proj", params)).rejects.toThrow(
      /requires a session name/,
    );
  });

  it("throws when sessionName is empty string", async () => {
    const params = { capability: "create-goal" as string, sessionName: "" };

    await expect(resolveCapabilityConfig("/tmp/proj", params)).rejects.toThrow(
      /requires a session name/,
    );
  });

  it("throws when both initialMessage and defaultInitialMessage are empty", async () => {
    // test-no-initial-message is a test capability with defaultInitialMessage returning ""
    const params = { capability: "test-no-initial-message" as string, sessionName: "test" };

    await expect(resolveCapabilityConfig("/tmp/proj", params)).rejects.toThrow(
      /requires an initial message/,
    );
  });

  it("does not throw when defaultInitialMessage provides a value", async () => {
    // create-goal has defaultInitialMessage returning "Ready."
    const params = { capability: "create-goal" as string, sessionName: "test" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);
    expect(result).toBeDefined();
    expect(result!.initialMessage).toBe("Ready.");
  });

  it("does not throw when params.initialMessage is provided", async () => {
    const params = { capability: "create-goal" as string, sessionName: "test", initialMessage: "custom" };

    const result = await resolveCapabilityConfig("/tmp/proj", params);
    expect(result).toBeDefined();
    expect(result!.initialMessage).toBe("custom");
  });
});

// ---------------------------------------------------------------------------
// resolveCapabilityConfig — skills passthrough
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// resolvePaths — placeholder replacement utility
// ---------------------------------------------------------------------------

describe("resolvePaths", () => {
  it("replaces single placeholder with param value", () => {
    const result = resolvePaths(["{name}/file.md"], { name: "my-feature" });
    expect(result).toEqual(["my-feature/file.md"]);
  });

  it("replaces multiple placeholders in the same path", () => {
    const result = resolvePaths(["{dir}/{name}.md"], { dir: "docs", name: "README" });
    expect(result).toEqual(["docs/README.md"]);
  });

  it("replaces placeholders across multiple paths", () => {
    const result = resolvePaths(
      ["{dir}/a.md", "{dir}/b.md"],
      { dir: "src" },
    );
    expect(result).toEqual(["src/a.md", "src/b.md"]);
  });

  it("throws when placeholder key is missing from params", () => {
    expect(() => {
      resolvePaths(["{name}/file.md"], { otherKey: "value" });
    }).toThrow(/Unresolved placeholder \{name\}/);
    expect(() => {
      resolvePaths(["{name}/file.md"], { otherKey: "value" });
    }).toThrow(/key 'name'/);
  });

  it("returns empty array for empty input", () => {
    const result = resolvePaths([], { name: "test" });
    expect(result).toEqual([]);
  });

  it("leaves paths without placeholders unchanged", () => {
    const result = resolvePaths(["GOAL.md", "PLAN.md"], { name: "test" });
    expect(result).toEqual(["GOAL.md", "PLAN.md"]);
  });

  // Format specifier: {key:02d}

  it("zero-pads with {key:02d} format specifier", () => {
    const result = resolvePaths(["S{stepNumber:02d}/TASK.md"], { stepNumber: 3 });
    expect(result).toEqual(["S03/TASK.md"]);
  });

  it("zero-pads with {key:02d} — two-digit numbers unchanged", () => {
    const result = resolvePaths(["S{stepNumber:02d}/TASK.md"], { stepNumber: 12 });
    expect(result).toEqual(["S12/TASK.md"]);
  });

  it("zero-pads with {key:02d} — zero becomes 00", () => {
    const result = resolvePaths(["S{stepNumber:02d}/TASK.md"], { stepNumber: 0 });
    expect(result).toEqual(["S00/TASK.md"]);
  });

  it("zero-pads with {key:04d} format specifier", () => {
    const result = resolvePaths(["S{stepNumber:04d}/TASK.md"], { stepNumber: 7 });
    expect(result).toEqual(["S0007/TASK.md"]);
  });

  it("does not pad non-numeric values with :02d", () => {
    const result = resolvePaths(["{name:02d}/file.md"], { name: "abc" });
    expect(result).toEqual(["abc/file.md"]);
  });

  it("throws when placeholder key is missing (with format specifier)", () => {
    expect(() => {
      resolvePaths(["S{stepNumber:02d}/TASK.md"], { otherKey: "value" });
    }).toThrow(/Unresolved placeholder \{stepNumber:02d\}/);
    expect(() => {
      resolvePaths(["S{stepNumber:02d}/TASK.md"], { otherKey: "value" });
    }).toThrow(/key 'stepNumber'/);
  });

  it("mixes plain and formatted placeholders", () => {
    const result = resolvePaths(["{dir}/S{stepNumber:02d}/TASK.md"], { dir: "goals", stepNumber: 3 });
    expect(result).toEqual(["goals/S03/TASK.md"]);
  });

  it("throws descriptive error naming the missing key", () => {
    expect(() => {
      resolvePaths(["S{stepNumber:02d}/TASK.md"], {});
    }).toThrow(/Unresolved placeholder \{stepNumber:02d\}/);
    expect(() => {
      resolvePaths(["S{stepNumber:02d}/TASK.md"], {});
    }).toThrow(/key 'stepNumber'/);
  });

  it("throws when one of multiple paths has unresolved placeholder", () => {
    expect(() => {
      resolvePaths(["GOAL.md", "S{stepNumber:02d}/TASK.md"], {});
    }).toThrow(/Unresolved placeholder \{stepNumber:02d\}/);
  });

  it("does not throw when all placeholders resolved across multiple paths", () => {
    const result = resolvePaths(
      ["GOAL.md", "S{stepNumber:02d}/TASK.md"],
      { stepNumber: 3 },
    );
    expect(result).toEqual(["GOAL.md", "S03/TASK.md"]);
  });
});

// ---------------------------------------------------------------------------
// resolveContractPath — workspace prefix resolution layer
// ---------------------------------------------------------------------------

describe("resolveContractPath", () => {
  const workingDir = "/proj/.pio";

  it("resolves prefixed path — joins workingDir + prefix + contractPath", () => {
    const result = resolveContractPath("GOAL.md", workingDir, "goals/my-feature");
    expect(result).toBe("/proj/.pio/goals/my-feature/GOAL.md");
  });

  it("resolves root-level path — leading / strips prefix and joins with workingDir", () => {
    const result = resolveContractPath("/PROJECT/OVERVIEW.md", workingDir, "goals/my-feature");
    expect(result).toBe("/proj/.pio/PROJECT/OVERVIEW.md");
  });

  it("resolves path without prefix — joins workingDir + contractPath", () => {
    const result = resolveContractPath("GOAL.md", workingDir, undefined);
    expect(result).toBe("/proj/.pio/GOAL.md");
  });

  it("treats empty prefix same as no prefix", () => {
    const withEmpty = resolveContractPath("GOAL.md", workingDir, "");
    const withUndefined = resolveContractPath("GOAL.md", workingDir, undefined);
    expect(withEmpty).toBe(withUndefined);
    expect(withEmpty).toBe("/proj/.pio/GOAL.md");
  });

  it("resolves placeholders then applies prefix", () => {
    const result = resolveContractPath(
      "S{stepNumber:02d}/TASK.md",
      workingDir,
      "goals/my-feature",
      { stepNumber: 3 },
    );
    expect(result).toBe("/proj/.pio/goals/my-feature/S03/TASK.md");
  });

  it("resolves root-level path without prefix", () => {
    const result = resolveContractPath("/PROJECT/OVERVIEW.md", workingDir, undefined);
    expect(result).toBe("/proj/.pio/PROJECT/OVERVIEW.md");
  });

  it("resolves nested workspace prefix correctly", () => {
    const result = resolveContractPath(
      "GOAL.md",
      workingDir,
      "goals/parent/S03/subgoals/nested",
    );
    expect(result).toBe("/proj/.pio/goals/parent/S03/subgoals/nested/GOAL.md");
  });

  it("throws when placeholders present but params is undefined", () => {
    expect(() =>
      resolveContractPath(
        "S{stepNumber:02d}/TASK.md",
        workingDir,
        "goals/my-feature",
      ),
    ).toThrow(/Unresolved placeholder/);
  });

  it("propagates resolvePaths error for unresolved placeholders", () => {
    expect(() =>
      resolveContractPath(
        "S{stepNumber:02d}/TASK.md",
        workingDir,
        "goals/my-feature",
        { otherKey: "value" },
      ),
    ).toThrow(/Unresolved placeholder/);
  });
});

// ---------------------------------------------------------------------------
// Integration — custom initial message passthrough
// ---------------------------------------------------------------------------

/**
 * These tests verify the end-to-end passthrough of custom initialMessage
 * through the queue mechanism: enqueue → JSON round-trip → resolve → config.
 * This ensures the mechanism works before Step 6 starts injecting custom
 * messages in every pio-workflow transition.
 */
describe("custom initial message passthrough", () => {
  const cwd = "/tmp/pio-msg-passthrough";
  const queueKey = "test-msg-passthrough";

  afterEach(() => {
    // Clean up queue file after each test
    const queueFilePath = path.join(cwd, ".pio", "session-queue", `task-${queueKey}.json`);
    try {
      fs.unlinkSync(queueFilePath);
    } catch {
      // ignore — file may not exist
    }
  });

  it("custom initialMessage survives JSON round-trip: enqueue → readPendingTask → resolveCapabilityConfig", async () => {
    // Arrange: enqueue a task with a custom initialMessage
    const customMessage = "Build the widget factory with 42 conveyor belts";
    enqueueTask(cwd, queueKey, {
      capability: "create-goal",
      params: { goalName: "widget-factory", initialMessage: customMessage },
    });

    // Act: read it back and resolve config
    const task = readPendingTask(cwd, queueKey);
    const config = await resolveCapabilityConfig(cwd, { ...task!.params, capability: task!.capability, sessionName: "test" });

    // Assert: config.initialMessage is the custom message, not the default "Ready."
    expect(config).toBeDefined();
    expect(config!.initialMessage).toBe(customMessage);
    expect(config!.initialMessage).not.toBe("Ready.");
  });

  it("fallback chain: when no params.initialMessage, defaultInitialMessage is used", async () => {
    // Arrange: enqueue a task without initialMessage (relies on defaultInitialMessage)
    enqueueTask(cwd, queueKey, {
      capability: "create-plan",
      params: { goalName: "my-feature" },
    });

    // Act: read it back and resolve config
    const task = readPendingTask(cwd, queueKey);
    const config = await resolveCapabilityConfig(cwd, { ...task!.params, capability: task!.capability, sessionName: "test" });

    // Assert: config.initialMessage is the default ("Ready.")
    expect(config).toBeDefined();
    expect(config!.initialMessage).toBe("Ready.");
  });

  it("throw: when neither params.initialMessage nor defaultInitialMessage provides a value", async () => {
    // Arrange: test-no-initial-message has defaultInitialMessage returning ""
    enqueueTask(cwd, queueKey, {
      capability: "test-no-initial-message",
      params: {},
    });

    // Act + Assert: resolving config should throw
    const task = readPendingTask(cwd, queueKey);
    await expect(
      resolveCapabilityConfig(cwd, { ...task!.params, capability: task!.capability, sessionName: "test" }),
    ).rejects.toThrow(/requires an initial message/);
  });
});

// ---------------------------------------------------------------------------
// Integration — all real capabilities define defaultInitialMessage
// ---------------------------------------------------------------------------

describe("all real capabilities define defaultInitialMessage", () => {
  it("create-goal defaultInitialMessage returns a non-empty string", async () => {
    const config = await resolveCapabilityConfig("/tmp/proj", { capability: "create-goal" as string, sessionName: "test" });
    expect(config!.initialMessage).toBeDefined();
    expect(config!.initialMessage!.length).toBeGreaterThan(0);
  });

  it("create-plan defaultInitialMessage returns a non-empty string", async () => {
    const config = await resolveCapabilityConfig("/tmp/proj", { capability: "create-plan" as string, sessionName: "test" });
    expect(config!.initialMessage).toBeDefined();
    expect(config!.initialMessage!.length).toBeGreaterThan(0);
  });

  it("evolve-plan defaultInitialMessage returns a non-empty string", async () => {
    const config = await resolveCapabilityConfig("/tmp/proj", { capability: "evolve-plan" as string, stepNumber: 1, sessionName: "test" });
    expect(config!.initialMessage).toBeDefined();
    expect(config!.initialMessage!.length).toBeGreaterThan(0);
  });

  it("execute-task defaultInitialMessage returns a non-empty string with .pio/ workingDir", async () => {
    const config = await resolveCapabilityConfig("/tmp/proj", { capability: "execute-task" as string, stepNumber: 1, sessionName: "test" });
    expect(config!.initialMessage).toBeDefined();
    expect(config!.initialMessage!.length).toBeGreaterThan(0);
    // With fixed workingDir (.pio/), the message should reference .pio/ not a goal dir
    expect(config!.initialMessage).toContain(".pio");
  });

  it("review-task defaultInitialMessage returns a non-empty string", async () => {
    const config = await resolveCapabilityConfig("/tmp/proj", { capability: "review-task" as string, stepNumber: 1, sessionName: "test" });
    expect(config!.initialMessage).toBeDefined();
    expect(config!.initialMessage!.length).toBeGreaterThan(0);
  });

  it("revise-plan defaultInitialMessage returns a non-empty string", async () => {
    const config = await resolveCapabilityConfig("/tmp/proj", { capability: "revise-plan" as string, sessionName: "test" });
    expect(config!.initialMessage).toBeDefined();
    expect(config!.initialMessage!.length).toBeGreaterThan(0);
  });

  it("execute-plan defaultInitialMessage returns a non-empty string", async () => {
    const config = await resolveCapabilityConfig("/tmp/proj", { capability: "execute-plan" as string, sessionName: "test" });
    expect(config!.initialMessage).toBeDefined();
    expect(config!.initialMessage!.length).toBeGreaterThan(0);
  });

  it("finalize-goal defaultInitialMessage returns a non-empty string with goalDir param", async () => {
    const config = await resolveCapabilityConfig("/tmp/proj", {
      capability: "finalize-goal" as string,
      goalName: "my-feature",
      goalDir: "/tmp/proj/.pio/goals/my-feature",
      sessionName: "test",
    });
    expect(config!.initialMessage).toBeDefined();
    expect(config!.initialMessage!.length).toBeGreaterThan(0);
    // finalize-goal uses goalDir from params, should include goal name
    expect(config!.initialMessage).toContain("my-feature");
  });

  it("project-context defaultInitialMessage returns a non-empty string", async () => {
    const config = await resolveCapabilityConfig("/tmp/proj", { capability: "project-context" as string, sessionName: "test" });
    expect(config!.initialMessage).toBeDefined();
    expect(config!.initialMessage!.length).toBeGreaterThan(0);
  });
});

describe("resolveCapabilityConfig — skills passthrough", () => {
  it("skills are copied when the static config defines them (test-skills-cap)", async () => {
    // Arrange: test-skills-cap is a test-only capability with skills defined
    const params = { capability: "test-skills-cap" as string, goalName: "my-feature", sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: skills are present and match the static config
    expect(result).toBeDefined();
    expect(result!.skills).toBeDefined();
    expect(result!.skills?.mandatory).toEqual(["tdd", "pio-git"]);
    expect(result!.skills?.recommended).toEqual([{ name: "source-research", condition: "when researching external libraries" }]);
  });

  it("skills are undefined when the static config does not define them (test-no-skills-cap)", async () => {
    // Arrange: test-no-skills-cap does not define skills
    const params = { capability: "test-no-skills-cap" as string, sessionName: "test" };

    // Act
    const result = await resolveCapabilityConfig("/tmp/proj", params);

    // Assert: skills is undefined (passthrough of undefined)
    expect(result).toBeDefined();
    expect(result!.skills).toBeUndefined();
  });

  it("CapabilityConfig type accepts skills field", () => {
    // Arrange + Act: verify the CapabilityConfig type includes skills
    const config: CapabilityConfig = {
      capability: "test-cap",
      contract: { inputs: [], outputs: [] },
      skills: {
        mandatory: ["pio-planning"],
        recommended: [{ name: "ask-user", condition: "when ambiguous" }],
      },
    };

    // Assert: type-level verification — if this compiles, the field exists
    expect(config.skills?.mandatory).toEqual(["pio-planning"]);
    expect(config.skills?.recommended).toEqual([{ name: "ask-user", condition: "when ambiguous" }]);
  });

  it("CapabilityConfig type accepts skills with only mandatory", () => {
    const config: CapabilityConfig = {
      capability: "test-cap",
      contract: { inputs: [], outputs: [] },
      skills: { mandatory: ["pio-git"] },
    };

    expect(config.skills?.mandatory).toEqual(["pio-git"]);
    expect(config.skills?.recommended).toBeUndefined();
  });

  it("CapabilityConfig type accepts skills with only recommended", () => {
    const config: CapabilityConfig = {
      capability: "test-cap",
      contract: { inputs: [], outputs: [] },
      skills: { recommended: [{ name: "source-research", condition: "when researching" }] },
    };

    expect(config.skills?.mandatory).toBeUndefined();
    expect(config.skills?.recommended).toEqual([{ name: "source-research", condition: "when researching" }]);
  });
});
