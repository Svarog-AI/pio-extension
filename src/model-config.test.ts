import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Shared helpers — use env var to control config path (no native module spying)
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-model-test-"));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Write a pio-config.yaml into the given temp dir under .pi/ */
function writeConfig(dir: string, content: string): void {
  const piDir = path.join(dir, ".pi");
  fs.mkdirSync(piDir, { recursive: true });
  fs.writeFileSync(path.join(piDir, "pio-config.yaml"), content, "utf-8");
}

// ---------------------------------------------------------------------------
// readConfig — no config file exists
// ---------------------------------------------------------------------------

describe("readConfig — no config file exists", () => {
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

  it("returns undefined when file doesn't exist", async () => {
    const mod = await import("./model-config");
    expect(mod.readConfig()).toBeUndefined();
  });

  it("returns undefined when file is empty", async () => {
    writeConfig(tempDir, "");
    const mod = await import("./model-config");
    expect(mod.readConfig()).toBeUndefined();
  });

  it("returns undefined when file contains only whitespace", async () => {
    writeConfig(tempDir, "   \n  ");
    const mod = await import("./model-config");
    expect(mod.readConfig()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// readConfig — malformed YAML
// ---------------------------------------------------------------------------

describe("readConfig — malformed YAML", () => {
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

  it("returns undefined for syntactically invalid YAML without throwing", async () => {
    writeConfig(tempDir, "{ invalid: yaml: broken");
    const mod = await import("./model-config");
    expect(() => mod.readConfig()).not.toThrow();
    expect(mod.readConfig()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// readConfig — valid config parsing
// ---------------------------------------------------------------------------

describe("readConfig — valid config parsing", () => {
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

  it("parses a config with only default:", async () => {
    writeConfig(tempDir, "default:\n  provider: j6000\n  modelId: my-model");
    const mod = await import("./model-config");
    const result = mod.readConfig();
    expect(result).toBeDefined();
    expect(result?.default).toEqual({ provider: "j6000", modelId: "my-model" });
  });

  it("parses a config with default: and capabilities: entries", async () => {
    writeConfig(
      tempDir,
      [
        "default:",
        "  provider: j6000",
        "  modelId: general",
        "capabilities:",
        "  execute-task:",
        "    provider: j6000",
        "    modelId: coding-model",
      ].join("\n"),
    );

    const mod = await import("./model-config");
    const result = mod.readConfig();
    expect(result?.capabilities?.["execute-task"]).toEqual({
      provider: "j6000",
      modelId: "coding-model",
    });
  });

  it("caches result — second call returns same object reference", async () => {
    writeConfig(tempDir, "default:\n  provider: j6000\n  modelId: my-model");
    const mod = await import("./model-config");

    const first = mod.readConfig();
    const second = mod.readConfig();

    // Both calls return the exact same object (cached)
    expect(first).toBe(second);
  });

  it("returns undefined when config has only unrecognized keys", async () => {
    writeConfig(tempDir, "random: key\nother: value");
    const mod = await import("./model-config");
    expect(mod.readConfig()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveModelForCapability — no config
// ---------------------------------------------------------------------------

describe("resolveModelForCapability — no config", () => {
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

  it("returns undefined when no config file exists", async () => {
    const mod = await import("./model-config");
    expect(mod.resolveModelForCapability("create-plan")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveModelForCapability — default only
// ---------------------------------------------------------------------------

describe("resolveModelForCapability — default only", () => {
  let tempDir: string;
  const origEnv = process.env.PIO_CONFIG_TEST_HOME;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempDir;
    writeConfig(tempDir, "default:\n  provider: j6000\n  modelId: general");
  });

  afterEach(() => {
    process.env.PIO_CONFIG_TEST_HOME = origEnv;
    cleanup(tempDir);
  });

  it("returns default for create-plan", async () => {
    const mod = await import("./model-config");
    expect(mod.resolveModelForCapability("create-plan")).toEqual({
      provider: "j6000",
      modelId: "general",
    });
  });

  it("returns default for execute-task", async () => {
    const mod = await import("./model-config");
    expect(mod.resolveModelForCapability("execute-task")).toEqual({
      provider: "j6000",
      modelId: "general",
    });
  });

  it("returns default for review-task", async () => {
    const mod = await import("./model-config");
    expect(mod.resolveModelForCapability("review-task")).toEqual({
      provider: "j6000",
      modelId: "general",
    });
  });
});

// ---------------------------------------------------------------------------
// resolveModelForCapability — per-capability override
// ---------------------------------------------------------------------------

describe("resolveModelForCapability — per-capability override", () => {
  let tempDir: string;
  const origEnv = process.env.PIO_CONFIG_TEST_HOME;

  beforeEach(() => {
    vi.resetModules();
    tempDir = createTempDir();
    process.env.PIO_CONFIG_TEST_HOME = tempDir;
    writeConfig(
      tempDir,
      [
        "default:",
        "  provider: j6000",
        "  modelId: general",
        "capabilities:",
        "  execute-task:",
        "    provider: j6000",
        "    modelId: coding",
      ].join("\n"),
    );
  });

  afterEach(() => {
    process.env.PIO_CONFIG_TEST_HOME = origEnv;
    cleanup(tempDir);
  });

  it("per-capability entry takes precedence over default", async () => {
    const mod = await import("./model-config");
    expect(mod.resolveModelForCapability("execute-task")).toEqual({
      provider: "j6000",
      modelId: "coding",
    });
  });

  it("unmatched capability falls back to default", async () => {
    const mod = await import("./model-config");
    expect(mod.resolveModelForCapability("create-plan")).toEqual({
      provider: "j6000",
      modelId: "general",
    });
  });

  it("unknown capability with only capabilities (no default) returns undefined", async () => {
    // Write config without default — fresh module for new config
    vi.resetModules();
    writeConfig(
      tempDir,
      [
        "capabilities:",
        "  execute-task:",
        "    provider: j6000",
        "    modelId: coding",
      ].join("\n"),
    );

    const mod = await import("./model-config");
    expect(mod.resolveModelForCapability("unknown-capability")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_TURN_THRESHOLD
// ---------------------------------------------------------------------------

describe("DEFAULT_TURN_THRESHOLD", () => {
  it("equals 15", async () => {
    vi.resetModules();
    const mod = await import("./model-config");
    expect(mod.DEFAULT_TURN_THRESHOLD).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_MAX_ITERATIONS
// ---------------------------------------------------------------------------

describe("DEFAULT_MAX_ITERATIONS", () => {
  it("equals 15", async () => {
    vi.resetModules();
    const mod = await import("./model-config");
    expect(mod.DEFAULT_MAX_ITERATIONS).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// readLoopConfig — valid values
// ---------------------------------------------------------------------------

describe("readLoopConfig — valid values", () => {
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

  it("returns loop config when loop.maxIterations is a positive integer", async () => {
    writeConfig(tempDir, ["loop:", "  maxIterations: 10"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readLoopConfig()).toEqual({ maxIterations: 10 });
  });

  it("returns loop config alongside other config keys", async () => {
    writeConfig(
      tempDir,
      [
        "default:",
        "  provider: j6000",
        "  modelId: general",
        "loop:",
        "  maxIterations: 20",
      ].join("\n"),
    );

    const mod = await import("./model-config");
    expect(mod.readLoopConfig()).toEqual({ maxIterations: 20 });
  });

  it("returns loop config with only loop block (no other keys)", async () => {
    writeConfig(tempDir, ["loop:", "  maxIterations: 8"].join("\n"));

    const mod = await import("./model-config");
    const result = mod.readLoopConfig();
    expect(result).toEqual({ maxIterations: 8 });
  });
});

// ---------------------------------------------------------------------------
// readLoopConfig — fallback and invalid values
// ---------------------------------------------------------------------------

describe("readLoopConfig — fallback and invalid values", () => {
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

  it("returns undefined when no config file exists", async () => {
    const mod = await import("./model-config");
    expect(mod.readLoopConfig()).toBeUndefined();
  });

  it("returns undefined when config has no loop block", async () => {
    writeConfig(tempDir, "default:\n  provider: j6000\n  modelId: general");

    const mod = await import("./model-config");
    expect(mod.readLoopConfig()).toBeUndefined();
  });

  it("returns undefined when loop block is empty", async () => {
    writeConfig(
      tempDir,
      ["default:", "  provider: j6000", "  modelId: general", "loop:"].join(
        "\n",
      ),
    );

    const mod = await import("./model-config");
    expect(mod.readLoopConfig()).toBeUndefined();
  });

  it("returns undefined when maxIterations is 0", async () => {
    writeConfig(tempDir, ["loop:", "  maxIterations: 0"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readLoopConfig()).toBeUndefined();
  });

  it("returns undefined when maxIterations is negative", async () => {
    writeConfig(tempDir, ["loop:", "  maxIterations: -5"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readLoopConfig()).toBeUndefined();
  });

  it("returns undefined when maxIterations is a float", async () => {
    writeConfig(tempDir, ["loop:", "  maxIterations: 3.5"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readLoopConfig()).toBeUndefined();
  });

  it("returns undefined when maxIterations is a string", async () => {
    writeConfig(tempDir, ["loop:", '  maxIterations: "ten"'].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readLoopConfig()).toBeUndefined();
  });

  it("returns undefined when maxIterations is null", async () => {
    writeConfig(tempDir, ["loop:", "  maxIterations: null"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readLoopConfig()).toBeUndefined();
  });

  it("returns undefined when loop is an array", async () => {
    writeConfig(tempDir, ["loop:", "  - maxIterations: 10"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readLoopConfig()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveMaxIterations — per-step override
// ---------------------------------------------------------------------------

describe("resolveMaxIterations — per-step override", () => {
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

  it("per-step override beats global config and default", async () => {
    writeConfig(tempDir, ["loop:", "  maxIterations: 10"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.resolveMaxIterations(5)).toBe(5);
  });

  it("per-step override works without config", async () => {
    const mod = await import("./model-config");
    expect(mod.resolveMaxIterations(7)).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// resolveMaxIterations — global config
// ---------------------------------------------------------------------------

describe("resolveMaxIterations — global config", () => {
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

  it("global config beats built-in default", async () => {
    writeConfig(tempDir, ["loop:", "  maxIterations: 10"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.resolveMaxIterations()).toBe(10);
  });

  it("global config works alongside other config keys", async () => {
    writeConfig(
      tempDir,
      [
        "default:",
        "  provider: j6000",
        "  modelId: general",
        "loop:",
        "  maxIterations: 20",
      ].join("\n"),
    );

    const mod = await import("./model-config");
    expect(mod.resolveMaxIterations()).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// resolveMaxIterations — fallback to default
// ---------------------------------------------------------------------------

describe("resolveMaxIterations — fallback to default", () => {
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

  it("returns DEFAULT_MAX_ITERATIONS when no config exists", async () => {
    const mod = await import("./model-config");
    expect(mod.resolveMaxIterations()).toBe(mod.DEFAULT_MAX_ITERATIONS);
  });

  it("returns DEFAULT_MAX_ITERATIONS when config has no loop block", async () => {
    writeConfig(tempDir, "default:\n  provider: j6000\n  modelId: general");

    const mod = await import("./model-config");
    expect(mod.resolveMaxIterations()).toBe(mod.DEFAULT_MAX_ITERATIONS);
  });

  it("returns DEFAULT_MAX_ITERATIONS when loop block is empty", async () => {
    writeConfig(tempDir, ["loop:"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.resolveMaxIterations()).toBe(mod.DEFAULT_MAX_ITERATIONS);
  });
});

// ---------------------------------------------------------------------------
// resolveMaxIterations — invalid per-step values fall through
// ---------------------------------------------------------------------------

describe("resolveMaxIterations — invalid per-step values fall through", () => {
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

  it("per-step 0 falls through to global config", async () => {
    writeConfig(tempDir, ["loop:", "  maxIterations: 10"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.resolveMaxIterations(0)).toBe(10);
  });

  it("per-step negative falls through to global config", async () => {
    writeConfig(tempDir, ["loop:", "  maxIterations: 10"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.resolveMaxIterations(-3)).toBe(10);
  });

  it("per-step float falls through to global config", async () => {
    writeConfig(tempDir, ["loop:", "  maxIterations: 10"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.resolveMaxIterations(3.5)).toBe(10);
  });

  it("per-step 0 falls through to default when no global config", async () => {
    const mod = await import("./model-config");
    expect(mod.resolveMaxIterations(0)).toBe(mod.DEFAULT_MAX_ITERATIONS);
  });
});

// ---------------------------------------------------------------------------
// readTurnThreshold — valid values
// ---------------------------------------------------------------------------

describe("readTurnThreshold — valid values", () => {
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

  it("returns configured value when guards.turnThreshold is a positive integer", async () => {
    writeConfig(tempDir, ["guards:", "  turnThreshold: 20"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readTurnThreshold()).toBe(20);
  });

  it("returns 1 when guards.turnThreshold is 1", async () => {
    writeConfig(tempDir, ["guards:", "  turnThreshold: 1"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readTurnThreshold()).toBe(1);
  });

  it("returns configured value alongside other config keys", async () => {
    writeConfig(
      tempDir,
      [
        "default:",
        "  provider: j6000",
        "  modelId: general",
        "guards:",
        "  turnThreshold: 15",
      ].join("\n"),
    );

    const mod = await import("./model-config");
    expect(mod.readTurnThreshold()).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// readDebugDisplay — valid values
// ---------------------------------------------------------------------------

describe("readDebugDisplay — valid values", () => {
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

  it("returns true when loop.debugDisplay is true", async () => {
    writeConfig(tempDir, ["loop:", "  debugDisplay: true"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readDebugDisplay()).toBe(true);
  });

  it("returns false when loop.debugDisplay is false", async () => {
    writeConfig(tempDir, ["loop:", "  debugDisplay: false"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readDebugDisplay()).toBe(false);
  });

  it("works alongside maxIterations — both fields parsed correctly", async () => {
    writeConfig(
      tempDir,
      ["loop:", "  maxIterations: 10", "  debugDisplay: true"].join("\n"),
    );

    const mod = await import("./model-config");
    expect(mod.readDebugDisplay()).toBe(true);
    expect(mod.readLoopConfig()).toEqual({
      maxIterations: 10,
      debugDisplay: true,
    });
  });
});

// ---------------------------------------------------------------------------
// readDebugDisplay — defaults and invalid values
// ---------------------------------------------------------------------------

describe("readDebugDisplay — defaults and invalid values", () => {
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

  it("returns false when no config file exists", async () => {
    const mod = await import("./model-config");
    expect(mod.readDebugDisplay()).toBe(false);
  });

  it("returns false when config has no loop block", async () => {
    writeConfig(tempDir, "default:\n  provider: j6000\n  modelId: general");

    const mod = await import("./model-config");
    expect(mod.readDebugDisplay()).toBe(false);
  });

  it("returns false when loop block has no debugDisplay field", async () => {
    writeConfig(tempDir, ["loop:", "  maxIterations: 10"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readDebugDisplay()).toBe(false);
  });

  it('returns false when debugDisplay is a string "true"', async () => {
    writeConfig(tempDir, ["loop:", '  debugDisplay: "true"'].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readDebugDisplay()).toBe(false);
  });

  it("returns false when debugDisplay is a number", async () => {
    writeConfig(tempDir, ["loop:", "  debugDisplay: 1"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readDebugDisplay()).toBe(false);
  });

  it("debugDisplay alone (no maxIterations) creates valid config.loop", async () => {
    writeConfig(tempDir, ["loop:", "  debugDisplay: true"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readDebugDisplay()).toBe(true);
    expect(mod.readLoopConfig()).toEqual({ debugDisplay: true });
  });
});

// ---------------------------------------------------------------------------
// readTurnThreshold — fallback to default
// ---------------------------------------------------------------------------

describe("readTurnThreshold — fallback to default", () => {
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

  it("returns DEFAULT_TURN_THRESHOLD when no config file exists", async () => {
    const mod = await import("./model-config");
    expect(mod.readTurnThreshold()).toBe(mod.DEFAULT_TURN_THRESHOLD);
  });

  it("returns DEFAULT_TURN_THRESHOLD when config file is empty", async () => {
    writeConfig(tempDir, "");

    const mod = await import("./model-config");
    expect(mod.readTurnThreshold()).toBe(mod.DEFAULT_TURN_THRESHOLD);
  });

  it("returns DEFAULT_TURN_THRESHOLD when guards block has no turnThreshold", async () => {
    writeConfig(
      tempDir,
      ["default:", "  provider: j6000", "  modelId: general", "guards:"].join(
        "\n",
      ),
    );

    const mod = await import("./model-config");
    expect(mod.readTurnThreshold()).toBe(mod.DEFAULT_TURN_THRESHOLD);
  });

  it("returns DEFAULT_TURN_THRESHOLD when turnThreshold is 0", async () => {
    writeConfig(tempDir, ["guards:", "  turnThreshold: 0"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readTurnThreshold()).toBe(mod.DEFAULT_TURN_THRESHOLD);
  });

  it("returns DEFAULT_TURN_THRESHOLD when turnThreshold is negative", async () => {
    writeConfig(tempDir, ["guards:", "  turnThreshold: -5"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readTurnThreshold()).toBe(mod.DEFAULT_TURN_THRESHOLD);
  });

  it("returns DEFAULT_TURN_THRESHOLD when turnThreshold is a float", async () => {
    writeConfig(tempDir, ["guards:", "  turnThreshold: 3.5"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readTurnThreshold()).toBe(mod.DEFAULT_TURN_THRESHOLD);
  });

  it("returns DEFAULT_TURN_THRESHOLD when turnThreshold is null", async () => {
    writeConfig(tempDir, ["guards:", "  turnThreshold: null"].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readTurnThreshold()).toBe(mod.DEFAULT_TURN_THRESHOLD);
  });

  it("returns DEFAULT_TURN_THRESHOLD when turnThreshold is a string", async () => {
    writeConfig(tempDir, ["guards:", '  turnThreshold: "twelve"'].join("\n"));

    const mod = await import("./model-config");
    expect(mod.readTurnThreshold()).toBe(mod.DEFAULT_TURN_THRESHOLD);
  });
});
