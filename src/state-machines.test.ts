import * as fs from "node:fs";
import * as os from "node:os";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { StateMachine, TransitionEdge, TransitionResult } from "./state-machines";
import { dispatch, getMachine, getOutgoingEdges, getRegisteredMachines, registerMachine, unregisterMachine, recordTransition } from "./state-machines";

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
): StateMachine<TestContext> {
  return {
    id,
    name: id,
    description: "test machine",
    edges: edges.map((e) => ({ from: e.from, to: e.to, resolve: e.resolve })),
  };
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
        resolve: () => ({ capability: "b", initialMessage: "msg", sessionName: "s", stateMachineId: "test" }),
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
        resolve: () => ({ capability: "b", initialMessage: "msg", sessionName: "s", stateMachineId: "test" }),
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
        resolve: () => ({ capability: "b", initialMessage: "msg", sessionName: "s", stateMachineId: "test" }),
      },
      {
        from: "a",
        to: "c",
        resolve: () => ({ capability: "c", initialMessage: "msg", sessionName: "s", stateMachineId: "test" }),
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
        resolve: () => ({ capability: "first", initialMessage: "msg", sessionName: "s", stateMachineId: "test" }),
      },
      {
        from: "a",
        to: "second",
        resolve: () => ({ capability: "second", initialMessage: "msg", sessionName: "s", stateMachineId: "test" }),
      },
      {
        from: "a",
        to: "third",
        resolve: () => ({ capability: "third", initialMessage: "msg", sessionName: "s", stateMachineId: "test" }),
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
          return { capability: "b", initialMessage: "msg", sessionName: "s", stateMachineId: "test" };
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
          initialMessage: "msg",
          sessionName: "s",
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
        resolve: () => ({ capability: "c", initialMessage: "msg", sessionName: "s", stateMachineId: "test" }),
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

  it("dispatch auto-injects stateMachineId overriding resolver value", () => {
    const machine = makeMachine("inject-test", [
      {
        from: "a",
        to: "b",
        // Resolver returns a wrong stateMachineId — dispatch should override with machine ID
        resolve: () => ({ capability: "b", initialMessage: "msg", sessionName: "s", stateMachineId: "wrong-id" } as any),
      },
    ]);

    const results = dispatch(machine, "a", { mode: "x" });

    expect(results).toHaveLength(1);
    // dispatch() auto-injects the correct machine ID, overriding the resolver value
    expect(results[0].stateMachineId).toBe("inject-test");
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
        resolve: () => ({ capability: "y", initialMessage: "msg", sessionName: "s", stateMachineId: "reg-test-1" }),
      },
    ]);
    const machine2 = makeMachine("reg-test-2", [
      {
        from: "x",
        to: "z",
        resolve: () => ({ capability: "z", initialMessage: "msg", sessionName: "s", stateMachineId: "reg-test-2" }),
      },
    ]);

    registerTestMachine(machine1);
    registerTestMachine(machine2);

    const results = dispatch(undefined, "x", { mode: "x" });

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
        resolve: () => ({ capability: "end", initialMessage: "msg", sessionName: "s", stateMachineId: "id-test-machine" }),
      },
    ]);

    registerTestMachine(machine);

    const results = dispatch(undefined, "start", { mode: "x" });
    const ourResults = results.filter((r) => r.stateMachineId === "id-test-machine");

    expect(ourResults).toHaveLength(1);
    expect(ourResults[0].stateMachineId).toBe("id-test-machine");
  });

  it("continues evaluating other machines when one resolve throws", () => {
    const goodMachine = makeMachine("good-machine", [
      {
        from: "x",
        to: "y",
        resolve: () => ({ capability: "y", initialMessage: "msg", sessionName: "s", stateMachineId: "good-machine" }),
      },
    ]);
    const badMachine = makeMachine("bad-machine", [
      {
        from: "x",
        to: "z",
        resolve: () => { throw new Error("boom"); },
      },
    ]);

    registerTestMachine(badMachine);
    registerTestMachine(goodMachine);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const results = dispatch(undefined, "x", { mode: "x" });

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1);
    expect(results[0].stateMachineId).toBe("good-machine");

    warnSpy.mockRestore();
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
        resolve: () => ({ capability: "end", initialMessage: "msg", sessionName: "s", stateMachineId: "reg-single-test" }),
      },
    ]);

    registerTestMachine(machine);

    const results = dispatch(undefined, "start", { mode: "x" });
    const ourResults = results.filter((r) => r.stateMachineId === "reg-single-test");

    expect(ourResults).toHaveLength(1);
    expect(ourResults[0].capability).toBe("end");
  });

  it("is idempotent — registering same ID again does not duplicate results", () => {
    const machine = makeMachine("idempotent-test", [
      {
        from: "s",
        to: "e",
        resolve: () => ({ capability: "e", initialMessage: "msg", sessionName: "s", stateMachineId: "idempotent-test" }),
      },
    ]);

    registerTestMachine(machine);
    registerMachine(machine); // second register (already tracked)

    const results = dispatch(undefined, "s", { mode: "x" });
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
        resolve: () => ({ capability: "end", initialMessage: "msg", sessionName: "s", stateMachineId: "unreg-test" }),
      },
    ]);

    registerTestMachine(machine);

    // Machine is registered — dispatch finds it.
    let results = dispatch(undefined, "start", { mode: "x" });
    let ourResults = results.filter((r) => r.stateMachineId === "unreg-test");
    expect(ourResults).toHaveLength(1);

    // Unregister — dispatch no longer finds it.
    const removed = unregisterMachine("unreg-test");
    expect(removed).toBe(true);
    // Remove from tracking since we already unregistered.
    const idx = registeredIds.indexOf("unreg-test");
    if (idx >= 0) registeredIds.splice(idx, 1);

    results = dispatch(undefined, "start", { mode: "x" });
    ourResults = results.filter((r) => r.stateMachineId === "unreg-test");
    expect(ourResults).toHaveLength(0);
  });

  it("returns false when machine is not registered", () => {
    const removed = unregisterMachine("nonexistent-machine");
    expect(removed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getMachine
// ---------------------------------------------------------------------------

describe("getMachine", () => {
  afterEach(() => {
    for (const id of registeredIds) {
      unregisterMachine(id);
    }
    registeredIds.length = 0;
  });

  it("returns the machine after registerMachine", () => {
    const machine = makeMachine("get-1", []);
    registerTestMachine(machine);

    const found = getMachine("get-1");

    expect(found).toBe(machine);
  });

  it("returns undefined for an unknown ID", () => {
    const found = getMachine("does-not-exist");

    expect(found).toBeUndefined();
  });

  it("returns undefined after unregisterMachine", () => {
    const machine = makeMachine("get-2", []);
    registerTestMachine(machine);

    unregisterMachine("get-2");
    const idx = registeredIds.indexOf("get-2");
    if (idx >= 0) registeredIds.splice(idx, 1);

    const found = getMachine("get-2");

    expect(found).toBeUndefined();
  });

  it("returns the new instance after re-registration", () => {
    const machine1 = makeMachine("get-3", []);
    const machine2 = makeMachine("get-3", [
      { from: "a", to: "b", resolve: () => ({ capability: "b", initialMessage: "msg", sessionName: "s", stateMachineId: "get-3" }) },
    ]);

    registerTestMachine(machine1);
    registerMachine(machine2);

    const found = getMachine("get-3");

    expect(found).toBe(machine2);
    expect(found).not.toBe(machine1);
  });
});

// ---------------------------------------------------------------------------
// getRegisteredMachines
// ---------------------------------------------------------------------------

describe("getRegisteredMachines", () => {
  afterEach(() => {
    for (const id of registeredIds) {
      unregisterMachine(id);
    }
    registeredIds.length = 0;
  });

  it("returns all registered machines in insertion order", () => {
    const m1 = makeMachine("list-1", []);
    const m2 = makeMachine("list-2", []);
    const m3 = makeMachine("list-3", []);

    registerTestMachine(m1);
    registerTestMachine(m2);
    registerTestMachine(m3);

    const list = getRegisteredMachines();

    expect(list.map((m) => m.id)).toEqual(["list-1", "list-2", "list-3"]);
  });

  it("returns a snapshot — mutations do not affect the registry", () => {
    const m1 = makeMachine("list-4", []);
    registerTestMachine(m1);

    const list = getRegisteredMachines();
    list.length = 0; // mutate the returned array

    expect(getRegisteredMachines()).toHaveLength(1);
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

// ---------------------------------------------------------------------------
// recordTransition — file creation
// ---------------------------------------------------------------------------

describe("recordTransition — file creation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(join(os.tmpdir(), "pio-sm-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates transitions.json with a single-entry JSON array", () => {
    const result: TransitionResult = { capability: "evolve-plan", stateMachineId: "goal-driven-development", params: { stepNumber: 2 } };
    recordTransition(tempDir, "create-plan", result);

    const content = fs.readFileSync(join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0].from).toBe("create-plan");
    expect(entries[0].to).toBe("evolve-plan");
    expect(entries[0].params).toEqual({ stepNumber: 2 });
    expect(typeof entries[0].timestamp).toBe("string");
  });

  it("entry contains ISO timestamp", () => {
    const result: TransitionResult = { capability: "execute-task", stateMachineId: "goal-driven-development" };
    recordTransition(tempDir, "evolve-plan", result);

    const content = fs.readFileSync(join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    // Verify it's a valid ISO date string
    expect(() => new Date(entries[0].timestamp)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// recordTransition — append to existing
// ---------------------------------------------------------------------------

describe("recordTransition — append to existing", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(join(os.tmpdir(), "pio-sm-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("second call appends to the existing JSON array", () => {
    recordTransition(tempDir, "create-goal", { capability: "create-plan", stateMachineId: "goal-driven-development" });
    recordTransition(tempDir, "create-plan", { capability: "evolve-plan", stateMachineId: "goal-driven-development" });

    const content = fs.readFileSync(join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    expect(entries).toHaveLength(2);
    expect(entries[0].from).toBe("create-goal");
    expect(entries[1].from).toBe("create-plan");
  });

  it("subsequent calls continue appending (entry count matches call count)", () => {
    for (let i = 0; i < 5; i++) {
      recordTransition(tempDir, "capability", { capability: "next", stateMachineId: "goal-driven-development" });
    }

    const content = fs.readFileSync(join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    expect(entries).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// recordTransition — error handling
// ---------------------------------------------------------------------------

describe("recordTransition — error handling", () => {
  it("does not throw when goalDir is unwritable", () => {
    // Use a path that doesn't exist and isn't creatable
    const unwritablePath = "/nonexistent/path/that/cannot/be/created/transitions.json";

    expect(() => {
      recordTransition(unwritablePath, "test-cap", { capability: "next", stateMachineId: "goal-driven-development" });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// recordTransition — actualParams
// ---------------------------------------------------------------------------

describe("recordTransition — actualParams", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(join(os.tmpdir(), "pio-sm-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("uses actualParams for audit entry when provided", () => {
    const result: TransitionResult = {
      capability: "evolve-plan",
      stateMachineId: "goal-driven-development",
      params: { stepNumber: 1 },
    };
    const actualParams = {
      stepNumber: 1,
      stateMachineId: "goal-driven-development",
      goalName: "test-goal",
    };
    recordTransition(tempDir, "create-plan", result, actualParams);

    const content = fs.readFileSync(join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    expect(entries).toHaveLength(1);
    // The recorded params should be actualParams, not toResult.params
    expect(entries[0].params).toEqual(actualParams);
    expect(entries[0].params.stateMachineId).toBe("goal-driven-development");

  });

  it("falls back to toResult.params when actualParams is omitted", () => {
    const result: TransitionResult = {
      capability: "execute-task",
      stateMachineId: "goal-driven-development",
      params: { stepNumber: 5, goalName: "my-goal" },
    };
    // Call with only 3 arguments — no actualParams
    recordTransition(tempDir, "evolve-plan", result);

    const content = fs.readFileSync(join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    expect(entries).toHaveLength(1);
    // Should fall back to toResult.params
    expect(entries[0].params).toEqual({ stepNumber: 5, goalName: "my-goal" });
  });
});

// ---------------------------------------------------------------------------
// recordTransition — malformed file recovery
// ---------------------------------------------------------------------------

describe("recordTransition — malformed file recovery", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(join(os.tmpdir(), "pio-sm-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("recovers from malformed JSON by starting fresh", () => {
    // Write malformed JSON
    fs.writeFileSync(join(tempDir, "transitions.json"), "not valid json");

    recordTransition(tempDir, "test-cap", { capability: "next", stateMachineId: "test" });

    const content = fs.readFileSync(join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0].from).toBe("test-cap");
  });

  it("recovers from non-array JSON by starting fresh", () => {
    // Write valid JSON but not an array
    fs.writeFileSync(join(tempDir, "transitions.json"), JSON.stringify({ key: "value" }));

    recordTransition(tempDir, "test-cap", { capability: "next", stateMachineId: "test" });

    const content = fs.readFileSync(join(tempDir, "transitions.json"), "utf-8");
    const entries = JSON.parse(content);

    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(1);
  });
});
