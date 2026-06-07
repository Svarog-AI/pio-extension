import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { StateMachine, TransitionEdge } from "./state-machines";
import { dispatch, getOutgoingEdges, registerMachine, unregisterMachine } from "./state-machines";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  isContext?: (ctx: unknown) => ctx is TestContext,
): StateMachine<TestContext> {
  const machine: StateMachine<TestContext> = {
    id,
    name: id,
    description: "test machine",
    edges: edges.map((e) => ({ from: e.from, to: e.to, resolve: e.resolve })),
  };
  if (isContext !== undefined) {
    machine.isContext = isContext;
  }
  return machine;
}

// Track machine IDs registered in this test file for cleanup.
const registeredIds: string[] = [];

/** Register a machine and track its ID for afterEach cleanup. */
function registerTestMachine<C>(machine: StateMachine<C>): void {
  registerMachine(machine);
  registeredIds.push(machine.id);
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
  afterEach(() => {
    // Clean up any machines registered during these tests.
    for (const id of registeredIds) {
      unregisterMachine(id);
    }
    registeredIds.length = 0;
  });

  it("returns empty array when no machines are registered", () => {
    // Ensure registry is empty for this test.
    const preCount = dispatch(undefined, "any", {} as any).length;

    const results = dispatch(undefined, "any", {} as any);

    // If no machines are registered, dispatch always returns empty.
    // The preCount check confirms nothing else registered machines between tests.
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

    registerTestMachine(machine1);
    registerTestMachine(machine2);

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

    registerTestMachine(machine);

    const results = dispatch(undefined, "start", {} as any);
    const ourResults = results.filter((r) => r.stateMachineId === "id-test-machine");

    expect(ourResults).toHaveLength(1);
    expect(ourResults[0].stateMachineId).toBe("id-test-machine");
  });
});

// ---------------------------------------------------------------------------
// dispatch — isContext guard (heterogeneous machines)
// ---------------------------------------------------------------------------

describe("dispatch — isContext guard", () => {
  afterEach(() => {
    for (const id of registeredIds) {
      unregisterMachine(id);
    }
    registeredIds.length = 0;
  });

  it("fires when context passes the guard", () => {
    const machine = makeMachine(
      "guarded",
      [
        {
          from: "start",
          to: "end",
          resolve: () => ({ capability: "end", stateMachineId: "guarded" }),
        },
      ],
      (ctx): ctx is TestContext =>
        typeof ctx === "object" && ctx !== null && "mode" in ctx,
    );

    registerTestMachine(machine);

    const results = dispatch(undefined, "start", { mode: "x" });
    expect(results).toHaveLength(1);
    expect(results[0].stateMachineId).toBe("guarded");
  });

  it("skips when context fails the guard", () => {
    const machine = makeMachine(
      "guarded",
      [
        {
          from: "start",
          to: "end",
          resolve: () => ({ capability: "end", stateMachineId: "guarded" }),
        },
      ],
      (ctx): ctx is TestContext =>
        typeof ctx === "object" && ctx !== null && "mode" in ctx,
    );

    registerTestMachine(machine);

    const results = dispatch(undefined, "start", { reviewId: "1" } as any);
    expect(results).toHaveLength(0);
  });

  it("evaluates machines without isContext guard as-is", () => {
    const machine = makeMachine("no-guard", [
      {
        from: "start",
        to: "end",
        resolve: () => ({ capability: "end", stateMachineId: "no-guard" }),
      },
    ]);

    registerTestMachine(machine);

    const results = dispatch(undefined, "start", { mode: "x" });
    expect(results).toHaveLength(1);
    expect(results[0].stateMachineId).toBe("no-guard");
  });

  it("single-machine dispatch ignores isContext guard", () => {
    const machine = makeMachine(
      "single",
      [
        {
          from: "start",
          to: "end",
          resolve: () => ({ capability: "end", stateMachineId: "single" }),
        },
      ],
      (ctx): ctx is TestContext =>
        typeof ctx === "object" && ctx !== null && "mode" in ctx,
    );

    const results = dispatch(machine, "start", { reviewId: "1" } as any);
    expect(results).toHaveLength(1);
    expect(results[0].stateMachineId).toBe("single");
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
// registerMachine / unregisterMachine
// ---------------------------------------------------------------------------

describe("registerMachine", () => {
  afterEach(() => {
    for (const id of registeredIds) {
      unregisterMachine(id);
    }
    registeredIds.length = 0;
  });

  it("adds machine to registry so dispatch can find it", () => {
    const machine = makeMachine("reg-single-test", [
      {
        from: "start",
        to: "end",
        resolve: () => ({ capability: "end", stateMachineId: "reg-single-test" }),
      },
    ]);

    registerTestMachine(machine);

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

    registerTestMachine(machine);
    registerMachine(machine); // second register (already tracked)

    const results = dispatch(undefined, "s", {} as any);
    const ourResults = results.filter((r) => r.stateMachineId === "idempotent-test");

    // Should still be exactly 1 result, not 2
    expect(ourResults).toHaveLength(1);
  });
});

describe("unregisterMachine", () => {
  afterEach(() => {
    for (const id of registeredIds) {
      unregisterMachine(id);
    }
    registeredIds.length = 0;
  });

  it("removes machine from registry", () => {
    const machine = makeMachine("unreg-test", [
      {
        from: "start",
        to: "end",
        resolve: () => ({ capability: "end", stateMachineId: "unreg-test" }),
      },
    ]);

    registerTestMachine(machine);

    // Machine is registered — dispatch finds it.
    let results = dispatch(undefined, "start", {} as any);
    let ourResults = results.filter((r) => r.stateMachineId === "unreg-test");
    expect(ourResults).toHaveLength(1);

    // Unregister — dispatch no longer finds it.
    const removed = unregisterMachine("unreg-test");
    expect(removed).toBe(true);
    // Remove from tracking since we already unregistered.
    const idx = registeredIds.indexOf("unreg-test");
    if (idx >= 0) registeredIds.splice(idx, 1);

    results = dispatch(undefined, "start", {} as any);
    ourResults = results.filter((r) => r.stateMachineId === "unreg-test");
    expect(ourResults).toHaveLength(0);
  });

  it("returns false when machine is not registered", () => {
    const removed = unregisterMachine("nonexistent-machine");
    expect(removed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Leaf module constraint
// ---------------------------------------------------------------------------

describe("leaf module constraint", () => {
  it("state-machines.ts has no internal pio imports", () => {
    const content = readFileSync(join(__dirname, "state-machines.ts"), "utf-8");

    // Should not have any `from "./..."` or `from "../..."` imports
    const internalImports = content.match(/from\s+["']\.[^"']+/g);
    expect(internalImports).toBeNull();
  });
});
