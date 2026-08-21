import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:fs to allow specific functions to be overridden per-test.
// The mock re-exports everything from the real module except the functions
// we want to override, which default to the real implementation.
vi.mock("node:fs", async (importActual) => {
  const actualFs = (await importActual()) as typeof fs;
  return {
    ...actualFs,
    writeFileSync: actualFs.writeFileSync,
    renameSync: actualFs.renameSync,
    readFileSync: actualFs.readFileSync,
    existsSync: actualFs.existsSync,
  };
});

// Hold references to real implementations for restore.
const _realWriteFileSync = fs.writeFileSync;
const _realReadFileSync = fs.readFileSync;
const _realExistsSync = fs.existsSync;

// ---------------------------------------------------------------------------
// Shared helpers — use `fs` (the mocked import) for direct operations
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-persist-test-"));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Resolve the state directory for a given temp home. */
function getStateDir(tempHome: string): string {
  return path.join(tempHome, ".pi", "pio", "state");
}

function getStateFilePath(tempHome: string, sessionId: string): string {
  return path.join(getStateDir(tempHome), `${sessionId}.json`);
}

// ---------------------------------------------------------------------------
// loadLoopEngineState — valid file
// ---------------------------------------------------------------------------

describe("loadLoopEngineState — valid file", () => {
  let tempDir: string;
  const origEnv = process.env.PIO_CONFIG_TEST_HOME;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempDir;
  });

  afterEach(() => {
    process.env.PIO_CONFIG_TEST_HOME = origEnv;
    cleanup(tempDir);
  });

  it("returns the correct object for a valid JSON file with all four fields", async () => {
    const mod = await import("./state-persistence");

    // Trigger directory creation
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    const data = {
      currentIteration: 3,
      isAdHocInput: true,
      currentPhaseId: "phase-a",
    };
    fs.writeFileSync(
      path.join(stateDir, "sess-1.json"),
      JSON.stringify(data),
      "utf-8",
    );

    const result = mod.loadLoopEngineState("sess-1");

    expect(result).toEqual({
      currentIteration: 3,
      isAdHocInput: true,
      currentPhaseId: "phase-a",
    });
  });

  it("returns null when the file doesn't exist", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const result = mod.loadLoopEngineState("nonexistent");

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadLoopEngineState — error handling
// ---------------------------------------------------------------------------

describe("loadLoopEngineState — error handling", () => {
  let tempDir: string;
  const origEnv = process.env.PIO_CONFIG_TEST_HOME;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempDir;
  });

  afterEach(() => {
    process.env.PIO_CONFIG_TEST_HOME = origEnv;
    (fs.readFileSync as any) = _realReadFileSync; // restore from any override
    (fs.existsSync as any) = _realExistsSync;
    cleanup(tempDir);
  });

  it("returns null and logs a warning for corrupt JSON", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-2.json"),
      '{ "currentPhaseId": null',
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-2");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns null and logs a warning for non-JSON content", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(path.join(stateDir, "sess-3.json"), "not json", "utf-8");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-3");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns null and logs a warning for empty file", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(path.join(stateDir, "sess-4.json"), "", "utf-8");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-4");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns null for wrong types (currentIteration is a string)", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-7.json"),
      JSON.stringify({
        currentIteration: "one",
        isAdHocInput: false,
        currentPhaseId: "",
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-7");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns null for wrong types (isAdHocInput is a string)", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-8.json"),
      JSON.stringify({
        currentIteration: 1,
        isAdHocInput: "true",
        currentPhaseId: "",
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-8");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("accepts persisted objects with a valid vars field", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-vars-ok.json"),
      JSON.stringify({
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: "create-goal",
        vars: {
          count: { value: 42, type: "number" },
          name: { value: "hello", type: "string" },
        },
      }),
      "utf-8",
    );

    const result = mod.loadLoopEngineState("sess-vars-ok");

    expect(result).toEqual({
      currentIteration: 1,
      isAdHocInput: false,
      currentPhaseId: "create-goal",
      vars: {
        count: { value: 42, type: "number" },
        name: { value: "hello", type: "string" },
      },
    });
  });

  it("accepts persisted objects with an empty vars object", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-vars-empty.json"),
      JSON.stringify({
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: "",
        vars: {},
      }),
      "utf-8",
    );

    const result = mod.loadLoopEngineState("sess-vars-empty");

    expect(result).toEqual({
      currentIteration: 1,
      isAdHocInput: false,
      currentPhaseId: "",
      vars: {},
    });
  });

  it("accepts persisted objects without vars field (vars is optional)", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-no-vars.json"),
      JSON.stringify({
        currentIteration: 3,
        isAdHocInput: true,
        currentPhaseId: "phase-b",
      }),
      "utf-8",
    );

    const result = mod.loadLoopEngineState("sess-no-vars");

    expect(result).toEqual({
      currentIteration: 3,
      isAdHocInput: true,
      currentPhaseId: "phase-b",
    });
    expect(result).not.toHaveProperty("vars");
  });

  it("rejects persisted objects without currentPhaseId (old file)", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-old.json"),
      JSON.stringify({
        currentIteration: 3,
        isAdHocInput: true,
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-old");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("rejects persisted objects where currentPhaseId is not a string", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-bad-phase-id.json"),
      JSON.stringify({
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: 123,
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-bad-phase-id");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("rejects persisted objects where vars is an array", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-vars-array.json"),
      JSON.stringify({
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: "",
        vars: [{ value: 1, type: "number" }],
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-vars-array");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("rejects persisted objects where vars entries lack a type field", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-vars-no-type.json"),
      JSON.stringify({
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: "",
        vars: { count: { value: 42 } },
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-vars-no-type");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("rejects persisted objects where vars entries lack a value field", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-vars-no-value.json"),
      JSON.stringify({
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: "",
        vars: { count: { type: "number" } },
      }),
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-vars-no-value");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("rejects persisted objects where vars entries have non-string type", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-vars-num-type.json"),
      JSON.stringify({
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: "",
        vars: { count: { value: 42, type: 123 } },
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-vars-num-type");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("rejects persisted objects where vars is null", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-vars-null.json"),
      JSON.stringify({
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: "",
        vars: null,
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-vars-null");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("rejects persisted objects where vars entries are non-objects", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-vars-str-entry.json"),
      JSON.stringify({
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: "",
        vars: { count: "hello" },
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-vars-str-entry");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("does not throw on file read error (permission denied)", async () => {
    // Override existsSync to return true (file exists) and readFileSync to throw
    (fs.existsSync as any) = () => true;
    (fs.readFileSync as any) = () => {
      throw new Error("EACCES: permission denied");
    };

    vi.resetModules();
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => mod.loadLoopEngineState("sess-err")).not.toThrow();
    expect(mod.loadLoopEngineState("sess-err")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();

    // Restore
    (fs.existsSync as any) = _realExistsSync;
    (fs.readFileSync as any) = _realReadFileSync;
  });
});

// ---------------------------------------------------------------------------
// saveLoopEngineState — basic and atomic write
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Round-trip: save with vars, load back
// ---------------------------------------------------------------------------

describe("round-trip with vars", () => {
  let tempDir: string;
  const origEnv = process.env.PIO_CONFIG_TEST_HOME;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempDir;
  });

  afterEach(() => {
    process.env.PIO_CONFIG_TEST_HOME = origEnv;
    cleanup(tempDir);
  });

  it("save state with vars, load it back, and verify vars are preserved", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const state = {
      currentIteration: 5,
      isAdHocInput: false,
      currentPhaseId: "phase-a",
      vars: {
        count: { value: 42, type: "number" },
        name: { value: "hello", type: "string" },
        flag: { value: true, type: "boolean" },
      },
    };

    mod.saveLoopEngineState("sess-rt", state);
    const loaded = mod.loadLoopEngineState("sess-rt");

    expect(loaded).toEqual(state);
  });

  it("save state without vars, load it back, and verify no vars field", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const state = {
      currentIteration: 1,
      isAdHocInput: false,
      currentPhaseId: "phase-a",
    };

    mod.saveLoopEngineState("sess-rt-no-vars", state);
    const loaded = mod.loadLoopEngineState("sess-rt-no-vars");

    expect(loaded).toEqual(state);
    expect(loaded).not.toHaveProperty("vars");
  });
});

describe("saveLoopEngineState — basic write", () => {
  let tempDir: string;
  const origEnv = process.env.PIO_CONFIG_TEST_HOME;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempDir;
  });

  afterEach(() => {
    process.env.PIO_CONFIG_TEST_HOME = origEnv;
    cleanup(tempDir);
  });

  it("writes a valid JSON file that can be round-tripped", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const state = {
      currentIteration: 3,
      isAdHocInput: true,
      currentPhaseId: "phase-a",
    };
    mod.saveLoopEngineState("sess-round", state);

    const loaded = mod.loadLoopEngineState("sess-round");
    expect(loaded).toEqual(state);
  });

  it("writes pretty-printed JSON (2-space indent)", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const state = {
      currentIteration: 1,
      isAdHocInput: false,
      currentPhaseId: "",
    };
    mod.saveLoopEngineState("sess-pretty", state);

    const filePath = getStateFilePath(tempDir, "sess-pretty");
    const content = fs.readFileSync(filePath, "utf-8");
    // Pretty-printed JSON contains newlines
    expect(content).toContain("\n");
    expect(JSON.parse(content)).toEqual(state);
  });

  it("round-trips an empty currentPhaseId correctly", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const state = {
      currentIteration: 1,
      isAdHocInput: false,
      currentPhaseId: "",
    };
    mod.saveLoopEngineState("sess-empty-phase-id", state);

    const loaded = mod.loadLoopEngineState("sess-empty-phase-id");

    expect(loaded).not.toBeNull();
    expect(loaded!.currentPhaseId).toBe("");
    expect(loaded).toEqual(state);
  });
});

describe("saveLoopEngineState — atomic write", () => {
  let tempDir: string;
  const origEnv = process.env.PIO_CONFIG_TEST_HOME;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempDir;
  });

  afterEach(() => {
    process.env.PIO_CONFIG_TEST_HOME = origEnv;
    (fs.writeFileSync as any) = _realWriteFileSync;
    cleanup(tempDir);
  });

  it("old file is intact if write fails midway", async () => {
    // Write an initial state file first
    vi.resetModules();
    const mod1 = await import("./state-persistence");
    mod1.ensureStateDir();

    const initState = {
      currentIteration: 1,
      isAdHocInput: false,
      currentPhaseId: "",
    };
    mod1.saveLoopEngineState("sess-atomic", initState);

    const filePath = getStateFilePath(tempDir, "sess-atomic");
    expect(fs.readFileSync(filePath, "utf-8")).toBe(
      JSON.stringify(initState, null, 2),
    );

    // Now mock writeFileSync to throw — simulates mid-write failure
    (fs.writeFileSync as any) = () => {
      throw new Error("disk full");
    };

    vi.resetModules();
    const mod2 = await import("./state-persistence");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // This should not throw
    expect(() =>
      mod2.saveLoopEngineState("sess-atomic", {
        currentIteration: 99,
        isAdHocInput: true,
        currentPhaseId: "phase-x",
      }),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();

    // The old file should still be intact
    const content = fs.readFileSync(filePath, "utf-8");
    expect(JSON.parse(content)).toEqual(initState);

    // Restore
    (fs.writeFileSync as any) = _realWriteFileSync;
  });
});

describe("saveLoopEngineState — error handling", () => {
  let tempDir: string;
  const origEnv = process.env.PIO_CONFIG_TEST_HOME;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempDir;
  });

  afterEach(() => {
    process.env.PIO_CONFIG_TEST_HOME = origEnv;
    (fs.writeFileSync as any) = _realWriteFileSync;
    cleanup(tempDir);
  });

  it("does not throw on directory/permission errors", async () => {
    (fs.writeFileSync as any) = () => {
      throw new Error("EACCES: permission denied");
    };

    vi.resetModules();
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() =>
      mod.saveLoopEngineState("sess-err", {
        currentIteration: 1,
        isAdHocInput: false,
        currentPhaseId: "",
      }),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();

    // Restore
    (fs.writeFileSync as any) = _realWriteFileSync;
  });
});

// ---------------------------------------------------------------------------
// Concurrent sessions
// ---------------------------------------------------------------------------

describe("concurrent sessions", () => {
  let tempDir: string;
  const origEnv = process.env.PIO_CONFIG_TEST_HOME;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempDir;
  });

  afterEach(() => {
    process.env.PIO_CONFIG_TEST_HOME = origEnv;
    cleanup(tempDir);
  });

  it("two different session IDs read/write independently without interference", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateA = {
      currentIteration: 5,
      isAdHocInput: false,
      currentPhaseId: "phase-a",
    };
    const stateB = {
      currentIteration: 2,
      isAdHocInput: true,
      currentPhaseId: "phase-b",
    };

    mod.saveLoopEngineState("session-a", stateA);
    mod.saveLoopEngineState("session-b", stateB);

    const loadedA = mod.loadLoopEngineState("session-a");
    const loadedB = mod.loadLoopEngineState("session-b");

    expect(loadedA).toEqual(stateA);
    expect(loadedB).toEqual(stateB);
  });
});

// ---------------------------------------------------------------------------
// extractPersistedState
// ---------------------------------------------------------------------------

describe("extractPersistedState", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("projects exactly the 4 persisted fields when store is absent", async () => {
    const { extractPersistedState } = await import("./state-persistence");
    const { __testSetState, getState } = await import("./session-state");

    __testSetState({
      isActive: true,
      markCompleteCalled: false,
      turnCount: 10,

      currentIteration: 7,
      totalPhases: 5,
      phasesList: [],
      filesWritten: ["/some/file"],
      askUserCalled: true,
      isAdHocInput: true,
      adHocPhaseNotified: false,
      currentPhaseId: "",
      programmaticLog: [],
    });

    const result = extractPersistedState(getState());

    expect(result).toEqual({
      currentIteration: 7,
      isAdHocInput: true,
      currentPhaseId: "",
    });
    // No vars key when store is absent
    expect(result).not.toHaveProperty("vars");
  });

  it("includes vars field when store exists and has writable vars", async () => {
    const { extractPersistedState } = await import("./state-persistence");
    const { __testSetState, getState } = await import("./session-state");
    const { SessionVariableStore } = await import("./session-store");

    const store = new SessionVariableStore({});
    store.set("count", "number", 42);
    store.set("name", "string", "hello");

    __testSetState({
      isActive: true,
      markCompleteCalled: false,
      turnCount: 10,

      currentIteration: 3,
      totalPhases: 5,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      adHocPhaseNotified: false,
      currentPhaseId: "",
      programmaticLog: [],
      store,
    });

    const result = extractPersistedState(getState());

    expect(result).toEqual({
      currentIteration: 3,
      isAdHocInput: false,
      currentPhaseId: "",
      vars: {
        count: { value: 42, type: "number" },
        name: { value: "hello", type: "string" },
      },
    });
  });

  it("omits vars field when store is null", async () => {
    const { extractPersistedState } = await import("./state-persistence");
    const { __testSetState, getState } = await import("./session-state");

    __testSetState({
      isActive: true,
      markCompleteCalled: false,
      turnCount: 10,

      currentIteration: 1,
      totalPhases: 3,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      adHocPhaseNotified: false,
      currentPhaseId: "",
      programmaticLog: [],
      store: null,
    });

    const result = extractPersistedState(getState());

    expect(result).not.toHaveProperty("vars");
  });

  it("omits vars field when store is undefined", async () => {
    const { extractPersistedState } = await import("./state-persistence");
    const { __testSetState, getState } = await import("./session-state");

    __testSetState({
      isActive: true,
      markCompleteCalled: false,
      turnCount: 10,

      currentIteration: 1,
      totalPhases: 3,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      adHocPhaseNotified: false,
      currentPhaseId: "",
      programmaticLog: [],
      store: undefined,
    });

    const result = extractPersistedState(getState());

    expect(result).not.toHaveProperty("vars");
  });

  it("includes empty vars object when store exists but has no writable vars", async () => {
    const { extractPersistedState } = await import("./state-persistence");
    const { __testSetState, getState } = await import("./session-state");
    const { SessionVariableStore } = await import("./session-store");

    const store = new SessionVariableStore({ param: "val" });

    __testSetState({
      isActive: true,
      markCompleteCalled: false,
      turnCount: 1,

      currentIteration: 1,
      totalPhases: 3,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: false,
      adHocPhaseNotified: false,
      currentPhaseId: "",
      programmaticLog: [],
      store,
    });

    const result = extractPersistedState(getState());

    expect(result.vars).toEqual({});
  });

  it("never projects in-memory exit fields (lastLlmPhaseId / exitOutcome / exitFailureMessage)", async () => {
    const { extractPersistedState } = await import("./state-persistence");
    const { __testSetState, getState } = await import("./session-state");

    __testSetState({
      isActive: true,
      markCompleteCalled: false,
      turnCount: 10,

      currentIteration: 2,
      totalPhases: 3,
      phasesList: [],
      filesWritten: [],
      askUserCalled: false,
      isAdHocInput: true,
      adHocPhaseNotified: false,
      currentPhaseId: "step-2",
      programmaticLog: [],
      // All three new in-memory fields set — none may leak into the projection
      lastLlmPhaseId: "step-2",
      exitOutcome: "failed",
      exitFailureMessage: "Validation failed.",
    });

    const result = extractPersistedState(getState());

    expect(result).toEqual({
      currentIteration: 2,
      isAdHocInput: true,
      currentPhaseId: "step-2",
    });
    // Exactly the persisted keys — no new fields appear as keys in the output
    expect(Object.keys(result).sort()).toEqual([
      "currentIteration",
      "currentPhaseId",
      "isAdHocInput",
    ]);
    expect(result).not.toHaveProperty("lastLlmPhaseId");
    expect(result).not.toHaveProperty("exitOutcome");
    expect(result).not.toHaveProperty("exitFailureMessage");
  });
});

// ---------------------------------------------------------------------------
// ensureStateDir
// ---------------------------------------------------------------------------

describe("ensureStateDir", () => {
  let tempDir: string;
  const origEnv = process.env.PIO_CONFIG_TEST_HOME;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempDir;
  });

  afterEach(() => {
    process.env.PIO_CONFIG_TEST_HOME = origEnv;
    cleanup(tempDir);
  });

  it("does not throw when called", async () => {
    const mod = await import("./state-persistence");

    expect(() => mod.ensureStateDir()).not.toThrow();
  });

  it("creates the state directory on first call", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    expect(fs.existsSync(stateDir)).toBe(true);
  });
});
