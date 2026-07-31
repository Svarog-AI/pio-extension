/**
 * Verification test: resolver functions return `additionalContext`.
 * Created for Step 4 of workflow-initial-message-delivery.
 */
import { describe, expect, it } from "vitest";
import { goalDrivenDevelopment } from "./pio-workflow-machine";

describe("pio-workflow-machine resolver additionalContext", () => {
  const dummyCtx = { workspaceDir: "/tmp/test" };

  // Resolve an edge by calling its resolve function with test params.
  function resolveEdge(
    from: string,
    to: string,
    params?: Record<string, unknown>,
  ) {
    const edge = goalDrivenDevelopment.edges.find(
      (e) => e.from === from && e.to === to,
    );
    if (!edge) throw new Error(`Edge not found: ${from} → ${to}`);
    return edge.resolve(dummyCtx, params);
  }

  // These resolvers don't call getCapState, so they work without contracts loaded.
  it("create-goal → create-plan returns additionalContext", () => {
    const result = resolveEdge("create-goal", "create-plan", {
      queueKey: "test-goal",
    });
    expect(result).toBeDefined();
    expect(result?.additionalContext).toBeDefined();
  });

  it("create-plan → evolve-plan returns additionalContext", () => {
    const result = resolveEdge("create-plan", "evolve-plan", {
      queueKey: "test-goal",
    });
    expect(result).toBeDefined();
    expect(result?.additionalContext).toBeDefined();
  });

  it("evolve-plan → create-goal (deprecated) returns undefined", () => {
    const result = resolveEdge("evolve-plan", "create-goal", {
      queueKey: "test-goal",
    });
    expect(result).toBeUndefined();
  });

  // Structural check: verify all edges exist and can be called (some may throw without contracts)
  it("all edges have resolve functions", () => {
    for (const edge of goalDrivenDevelopment.edges) {
      expect(edge.resolve).toBeTypeOf("function");
    }
  });
});
