import type { StateMachine, TransitionEdge, TransitionResult } from "./state-machines";
import { dispatch, getOutgoingEdges, registerMachine } from "./state-machines";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** A trivial context type for tests — just a string. */
interface TestContext {
  mode: string;
}

/** Build a machine with synthetic resolve functions. */
function makeMachine(
  id: string,
  edges: { from: string; to: string; resolve: TransitionEdge<TestContext>["resolve"] }[],
): StateMachine<TestContext> {
  return {
    id,
    name: id,
    description: "test machine",
    edges: edges.map((e) => ({ from: e.from, to: e.to, resolve: e.resolve })),
  };
}

// ---------------------------------------------------------------------------
// dispatch — single machine
// ---------------------------------------------------------------------------

describe("dispatch — single machine", () => {
  it("returns array with one result when exactly one edge fires", () => {
    const machine = makeMachine("test", [
      {
        from: "a",
        to: "b",
        resolve: () => ({ capability: "b", stateMachineId: "test" }),
      },
    ]);

    const results = dispatch(machine, "a", { mode: "x" });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("b");
    expect(results[0].stateMachineId).toBe("test");
  });

  it("returns empty array when no outgoing edges exist for the node", () => {
    const machine = makeMachine("test", [
      {
        from: "a",
        to: "b",
        resolve: () => ({ capability: "b", stateMachineId: "test" }),
      },
    ]);

    const results = dispatch(machine, "z", { mode: "x" });

    expect(results).toHaveLength(0);
  });

  it("returns empty array when resolve returns undefined", () => {
    const machine = makeMachine("test", [
      {
        from: "a",
        to: "b",
        resolve: () => undefined,
      },
    ]);

    const results = dispatch(machine, "a", { mode: "x" });

    expect(results).toHaveLength(0);
  });

  it("returns all matching results when multiple edges fire", () => {
    const machine = makeMachine("test", [
      {
        from: "a",
        to: "b",
        resolve: () => ({ capability: "b", stateMachineId: "test" }),
      },
      {
        from: "a",
        to: "c",
        resolve: () => ({ capability: "c", stateMachineId: "test" }),
      },
    ]);

    const results = dispatch(machine, "a", { mode: "x" });

    expect(results).toHaveLength(2);
    expect(results[0].capability).toBe("b");
    expect(results[1].capability).toBe("c");
  });

  it("preserves edge array order in results", () => {
    const machine = makeMachine("test", [
      {
        from: "a",
        to: "first",
        resolve: () => ({ capability: "first", stateMachineId: "test" }),
      },
      {
        from: "a",
        to: "second",
        resolve: () => ({ capability: "second", stateMachineId: "test" }),
      },
      {
        from: "a",
        to: "third",
        resolve: () => ({ capability: "third", stateMachineId: "test" }),
      },
    ]);

    const results = dispatch(machine, "a", { mode: "x" });

    expect(results.map((r) => r.capability)).toEqual(["first", "second", "third"]);
  });

  it("passes context and params to resolve functions", () => {
    const received: Array<{ context: TestContext; params?: Record<string, unknown> }> = [];

    const machine = makeMachine("test", [
      {
        from: "a",
        to: "b",
        resolve: (ctx, params) => {
          received.push({ context: ctx, params });
          return { capability: "b", stateMachineId: "test" };
        },
      },
    ]);

    dispatch(machine, "a", { mode: "x" }, { key: "val" });

    expect(received).toHaveLength(1);
    expect(received[0].context).toEqual({ mode: "x" });
    expect(received[0].params).toEqual({ key: "val" });
  });

  it("preserves result params from resolve functions", () => {
    const machine = makeMachine("test", [
      {
        from: "a",
        to: "b",
        resolve: () => ({
          capability: "b",
          stateMachineId: "test",
          params: { stepNumber: 3, goalName: "my-goal" },
        }),
      },
    ]);

    const results = dispatch(machine, "a", { mode: "x" });

    expect(results[0].params).toEqual({ stepNumber: 3, goalName: "my-goal" });
  });

  it("mixes firing and non-firing edges correctly", () => {
    const machine = makeMachine("test", [
      {
        from: "a",
        to: "b",
        resolve: () => undefined,
      },
      {
        from: "a",
        to: "c",
        resolve: () => ({ capability: "c", stateMachineId: "test" }),
      },
      {
        from: "a",
        to: "d",
        resolve: () => undefined,
      },
    ]);

    const results = dispatch(machine, "a", { mode: "x" });

    expect(results).toHaveLength(1);
    expect(results[0].capability).toBe("c");
  });
});

// ---------------------------------------------------------------------------
// dispatch — multi-machine (machine === undefined)
// ---------------------------------------------------------------------------

describe("dispatch — multi-machine (machine === undefined)", () => {
  it("returns empty array when no machines are registered", () => {
    // Use a unique node name that no registered machine could have.
    const results = dispatch(undefined, "__unique_node_that_does_not_exist__", {} as any);
    expect(results).toHaveLength(0);
  });

  it("aggregates results from all registered machines", () => {
    const machine1 = makeMachine("reg-test-1", [
      {
        from: "x",
        to: "y",
        resolve: () => ({ capability: "y", stateMachineId: "reg-test-1" }),
      },
    ]);
    const machine2 = makeMachine("reg-test-2", [
      {
        from: "x",
        to: "z",
        resolve: () => ({ capability: "z", stateMachineId: "reg-test-2" }),
      },
    ]);

    registerMachine(machine1);
    registerMachine(machine2);

    const results = dispatch(undefined, "x", {} as any);

    // Filter to only our test machines' results (other registered machines might exist)
    const ourResults = results.filter(
      (r) => r.stateMachineId === "reg-test-1" || r.stateMachineId === "reg-test-2",
    );

    expect(ourResults).toHaveLength(2);
    expect(ourResults.some((r) => r.stateMachineId === "reg-test-1")).toBe(true);
    expect(ourResults.some((r) => r.stateMachineId === "reg-test-2")).toBe(true);
  });

  it("each result includes the correct stateMachineId from its machine", () => {
    const machine = makeMachine("id-test-machine", [
      {
        from: "start",
        to: "end",
        resolve: () => ({ capability: "end", stateMachineId: "id-test-machine" }),
      },
    ]);

    registerMachine(machine);

    const results = dispatch(undefined, "start", {} as any);
    const ourResults = results.filter((r) => r.stateMachineId === "id-test-machine");

    expect(ourResults).toHaveLength(1);
    expect(ourResults[0].stateMachineId).toBe("id-test-machine");
  });
});

// ---------------------------------------------------------------------------
// getOutgoingEdges
// ---------------------------------------------------------------------------

describe("getOutgoingEdges", () => {
  it("returns correct subset of edges filtered by from field", () => {
    const machine = makeMachine("test", [
      { from: "a", to: "b", resolve: () => undefined },
      { from: "a", to: "c", resolve: () => undefined },
      { from: "b", to: "d", resolve: () => undefined },
    ]);

    const edges = getOutgoingEdges(machine, "a");

    expect(edges).toHaveLength(2);
    expect(edges[0].to).toBe("b");
    expect(edges[1].to).toBe("c");
  });

  it("preserves array order", () => {
    const machine = makeMachine("test", [
      { from: "a", to: "first", resolve: () => undefined },
      { from: "a", to: "second", resolve: () => undefined },
      { from: "a", to: "third", resolve: () => undefined },
    ]);

    const edges = getOutgoingEdges(machine, "a");

    expect(edges.map((e) => e.to)).toEqual(["first", "second", "third"]);
  });

  it("returns empty array for unknown nodes", () => {
    const machine = makeMachine("test", [
      { from: "a", to: "b", resolve: () => undefined },
    ]);

    const edges = getOutgoingEdges(machine, "unknown");

    expect(edges).toHaveLength(0);
  });

  it("does not call resolve functions", () => {
    let called = false;
    const machine = makeMachine("test", [
      {
        from: "a",
        to: "b",
        resolve: () => {
          called = true;
          return undefined;
        },
      },
    ]);

    getOutgoingEdges(machine, "a");

    expect(called).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// registerMachine
// ---------------------------------------------------------------------------

describe("registerMachine", () => {
  it("adds machine to registry so dispatch can find it", () => {
    const machine = makeMachine("reg-single-test", [
      {
        from: "start",
        to: "end",
        resolve: () => ({ capability: "end", stateMachineId: "reg-single-test" }),
      },
    ]);

    registerMachine(machine);

    const results = dispatch(undefined, "start", {} as any);
    const ourResults = results.filter((r) => r.stateMachineId === "reg-single-test");

    expect(ourResults).toHaveLength(1);
    expect(ourResults[0].capability).toBe("end");
  });

  it("is idempotent — registering same ID again does not duplicate results", () => {
    const machine = makeMachine("idempotent-test", [
      {
        from: "s",
        to: "e",
        resolve: () => ({ capability: "e", stateMachineId: "idempotent-test" }),
      },
    ]);

    registerMachine(machine);
    registerMachine(machine);

    const results = dispatch(undefined, "s", {} as any);
    const ourResults = results.filter((r) => r.stateMachineId === "idempotent-test");

    // Should still be exactly 1 result, not 2
    expect(ourResults).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Leaf module constraint
// ---------------------------------------------------------------------------

describe("leaf module constraint", () => {
  it("state-machines.ts has no internal pio imports", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const content = fs.readFileSync(
      path.join(import.meta.dirname, "state-machines.ts"),
      "utf-8",
    );

    // Should not have any `from "./..."` or `from "../..."` imports
    const internalImports = content.match(/from\s+["']\.[^"']+/g);
    expect(internalImports).toBeNull();
  });
});
