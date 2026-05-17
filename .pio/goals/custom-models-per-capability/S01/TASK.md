# Task: Create `src/model-config.ts` — config reader and resolver

New module to read `~/.pi/pio-config.yaml`, parse it, and provide a lookup function for resolving AI model overrides per pio capability.

## Context

Currently all pio capability sub-sessions inherit whatever model is active in the parent session. The goal is to allow users to configure different models per capability via `~/.pi/pio-config.yaml`. This step creates the foundation: the config reader and resolver module that downstream steps will import.

The config file lives at `~/.pi/pio-config.yaml` (user global, not project-local) and uses YAML format. The `js-yaml` package is already a dependency (`package.json`).

## What to Build

A new module `src/model-config.ts` that exports:

1. **Types** — `PioModelEntry` and `PioConfig` interfaces describing the config file shape.
2. **`getConfigPath(): string`** — resolves `~/.pi/pio-config.yaml` using `os.homedir()`.
3. **`readConfig(): PioConfig | undefined`** — reads and parses the YAML file. Lazy-loaded on first call, then cached for the module lifetime. Returns `undefined` if the file doesn't exist, is empty, or is malformed (no exceptions thrown).
4. **`resolveModelForCapability(capabilityName: string): PioModelEntry | undefined`** — implements the resolution order: per-capability override → default → undefined.

### Code Components

#### `getConfigPath()`

Returns an absolute path string by joining `os.homedir()`, `.pi`, and `pio-config.yaml`. Pure function — no side effects, always returns the same path for a given home directory.

#### `readConfig()`

- Calls `getConfigPath()` to find the file.
- Checks `fs.existsSync()` — returns `undefined` if missing.
- Reads file with `fs.readFileSync()` (synchronous is fine — called once per session).
- Parses YAML with `js-yaml.load()`. On parse error, catches and returns `undefined`.
- Validates shape: checks for `default` and/or `capabilities` keys. Each entry must have `provider: string` and `modelId: string`. Invalid entries are silently ignored (return `undefined`).
- Caches the parsed result in a module-level variable so subsequent calls skip I/O.

#### `resolveModelForCapability(capabilityName)`

1. Call `readConfig()` to get cached config.
2. If config is `undefined`, return `undefined`.
3. Look up `config.capabilities?.[capabilityName]` — if found and valid, return it.
4. Fall back to `config.default` — if found and valid, return it.
5. Otherwise return `undefined`.

### Interface signatures

```ts
export interface PioModelEntry {
  provider: string;
  modelId: string;
}

export interface PioConfig {
  default?: PioModelEntry;
  capabilities?: Record<string, PioModelEntry>;
}

/** Resolves ~/.pi/pio-config.yaml path. */
export function getConfigPath(): string;

/** Reads and caches the config file. Returns undefined if missing/malformed. */
export function readConfig(): PioConfig | undefined;

/** Returns the resolved model for a capability name, or undefined if no mapping exists. */
export function resolveModelForCapability(capabilityName: string): PioModelEntry | undefined;
```

### Approach and Decisions

- **File path resolution:** Use `os.homedir()` directly (no environment variable tricks). This matches Node.js conventions and works cross-platform.
- **Synchronous file I/O:** The config is read once per session lifetime and cached. Using `fs.readFileSync` is acceptable — no need for async overhead on a small static file.
- **Error tolerance:** Any error (missing file, malformed YAML, missing required fields) silently returns `undefined`. No `console.error` needed — the absence of a model override simply means "use parent model" which is correct backwards-compatible behavior.
- **Cache invalidation:** Not implemented. The config is cached for the module/session lifetime. If a user edits the file mid-session, changes take effect on the next sub-session launch (new process = new cache). This is documented expected behavior.
- **Module structure:** Follow existing patterns in `src/` — export interfaces and functions at the top level. No default export. Colocated test file following the convention (`model-config.test.ts`).

## Dependencies

None. This is Step 1 with no prior dependencies.

## Files Affected

- `src/model-config.ts` — created: new config reader and resolver module
- `src/model-config.test.ts` — created: unit tests for all exported functions

## Acceptance Criteria

- [ ] `npm run check` reports no type errors
- [ ] `resolveModelForCapability` is exported and importable from `src/model-config.ts`
- [ ] When config file doesn't exist, `resolveModelForCapability("any-capability")` returns `undefined` without throwing
- [ ] When only `default:` is set, `resolveModelForCapability("any-capability")` returns that default
- [ ] When a per-capability override exists, it takes precedence over `default:`
- [ ] The config path resolves correctly via `os.homedir() + "/.pi/pio-config.yaml"`
- [ ] `npm run test` passes for `src/model-config.test.ts` with all tests green

## Risks and Edge Cases

- **Malformed YAML:** `js-yaml.load()` can throw on invalid syntax. Must be caught and return `undefined`.
- **Non-YAML file content:** If the file exists but isn't valid YAML, treat as missing (return `undefined`).
- **Missing fields:** A config entry like `{ provider: "j6000" }` without `modelId` should be treated as invalid. The resolver should skip such entries and fall through to the next resolution level.
- **Empty file / whitespace-only file:** Should return `undefined` (no config).
- **Config with only `capabilities:` but no `default`:** Should still work — resolve from capabilities, return `undefined` for unmatched names.
- **Config with only `default:` and no `capabilities`:** Should resolve all capability names to the default.
