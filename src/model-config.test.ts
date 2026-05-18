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
    expect(result!.default).toEqual({ provider: "j6000", modelId: "my-model" });
  });

  it("parses a config with default: and capabilities: entries", async () => {
    writeConfig(tempDir, [
      "default:",
      "  provider: j6000",
      "  modelId: general",
      "capabilities:",
      "  execute-task:",
      "    provider: j6000",
      "    modelId: coding-model",
    ].join("\n"));

    const mod = await import("./model-config");
    const result = mod.readConfig();
    expect(result!.capabilities?.["execute-task"]).toEqual({
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
    writeConfig(tempDir, [
      "default:",
      "  provider: j6000",
      "  modelId: general",
      "capabilities:",
      "  execute-task:",
      "    provider: j6000",
      "    modelId: coding",
    ].join("\n"));
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
    writeConfig(tempDir, [
      "capabilities:",
      "  execute-task:",
      "    provider: j6000",
      "    modelId: coding",
    ].join("\n"));

    const mod = await import("./model-config");
    expect(mod.resolveModelForCapability("unknown-capability")).toBeUndefined();
  });
});
