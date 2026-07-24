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

  it("returns the correct object for a valid JSON file with all three fields", async () => {
    const mod = await import("./state-persistence");

    // Trigger directory creation
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    const data = { currentPhase: 2, currentIteration: 3, isAdHocInput: true };
    fs.writeFileSync(
      path.join(stateDir, "sess-1.json"),
      JSON.stringify(data),
      "utf-8",
    );

    const result = mod.loadLoopEngineState("sess-1");

    expect(result).toEqual({
      currentPhase: 2,
      currentIteration: 3,
      isAdHocInput: true,
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
      '{ "currentPhase": 2',
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

  it("returns null for missing fields (no currentPhase)", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-5.json"),
      JSON.stringify({ currentIteration: 1, isAdHocInput: false }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-5");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns null for wrong types (currentPhase is a string)", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-6.json"),
      JSON.stringify({
        currentPhase: "two",
        currentIteration: 1,
        isAdHocInput: false,
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-6");

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
        currentPhase: 1,
        currentIteration: "one",
        isAdHocInput: false,
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
        currentPhase: 1,
        currentIteration: 1,
        isAdHocInput: "true",
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-8");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns null for non-integer numbers (currentPhase is 2.5)", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-9.json"),
      JSON.stringify({
        currentPhase: 2.5,
        currentIteration: 1,
        isAdHocInput: false,
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-9");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns null for zero values (currentPhase is 0)", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-10.json"),
      JSON.stringify({
        currentPhase: 0,
        currentIteration: 0,
        isAdHocInput: false,
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-10");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns null for negative values (currentPhase is -1)", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const stateDir = getStateDir(tempDir);
    fs.writeFileSync(
      path.join(stateDir, "sess-11.json"),
      JSON.stringify({
        currentPhase: -1,
        currentIteration: 1,
        isAdHocInput: false,
      }),
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = mod.loadLoopEngineState("sess-11");

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

    const state = { currentPhase: 5, currentIteration: 3, isAdHocInput: true };
    mod.saveLoopEngineState("sess-round", state);

    const loaded = mod.loadLoopEngineState("sess-round");
    expect(loaded).toEqual(state);
  });

  it("writes pretty-printed JSON (2-space indent)", async () => {
    const mod = await import("./state-persistence");
    mod.ensureStateDir();

    const state = { currentPhase: 1, currentIteration: 1, isAdHocInput: false };
    mod.saveLoopEngineState("sess-pretty", state);

    const filePath = getStateFilePath(tempDir, "sess-pretty");
    const content = fs.readFileSync(filePath, "utf-8");
    // Pretty-printed JSON contains newlines
    expect(content).toContain("\n");
    expect(JSON.parse(content)).toEqual(state);
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
      currentPhase: 1,
      currentIteration: 1,
      isAdHocInput: false,
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
        currentPhase: 99,
        currentIteration: 99,
        isAdHocInput: true,
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
        currentPhase: 1,
        currentIteration: 1,
        isAdHocInput: false,
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
      currentPhase: 1,
      currentIteration: 5,
      isAdHocInput: false,
    };
    const stateB = { currentPhase: 3, currentIteration: 2, isAdHocInput: true };

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

  it("projects exactly the 3 persisted fields", async () => {
    const { extractPersistedState } = await import("./state-persistence");
    const { __testSetState, getState } = await import("./session-state");

    __testSetState({
      isActive: true,
      markCompleteCalled: false,
      turnCount: 10,
      currentPhase: 4,
      currentIteration: 7,
      totalPhases: 5,
      phasesList: [],
      filesWritten: ["/some/file"],
      askUserCalled: true,
      isAdHocInput: true,
      phaseWriteAllowlist: new Map(),
    });

    const result = extractPersistedState(getState());

    expect(result).toEqual({
      currentPhase: 4,
      currentIteration: 7,
      isAdHocInput: true,
    });
    // No extra keys
    expect(Object.keys(result)).toHaveLength(3);
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
