import { resolveCapabilityConfig } from "../src/utils";

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

  it("resolving review-code (no prepareSession yet) produces valid config with undefined prepareSession", async () => {
    const params = { capability: "review-code" as string, goalName: "my-feature", stepNumber: 2 };

    const result = await resolveCapabilityConfig("/tmp/proj", params);

    expect(result).toBeDefined();
    expect(result!.capability).toBe("review-code");
    expect(result!.prepareSession).toBeUndefined();
  });
});
