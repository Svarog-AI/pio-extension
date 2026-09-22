// Descriptor-table suite for the capability contract module.
// Hermetic: pure rows need no fixtures; the input-validator rows touch the
// real filesystem only inside fresh tmpdirs; the cwd-default row mocks
// process.cwd. The single deliberate `as` below feeds unproven values
// through the load-time checker's runtime gate instead of its annotation.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import type { Contract, ContractSpec } from "./contract.ts";
import { checkContract, classifySpec, validateInputs } from "./contract.ts";
import { ContractViolationError } from "./errors.ts";

/** One documented cast seam: feed unproven values to the runtime checks. */
const unchecked = (v: unknown): Contract => v as Contract;

function mkContract(inputs: ContractSpec[]): Contract {
  return { name: "cap", version: "1.0.0", inputs, outputs: [], writes: [] };
}

/** Runs the validator and returns the thrown instance (undefined on pass). */
function catchViolation(
  target: () => void,
): ContractViolationError | undefined {
  try {
    target();
  } catch (err) {
    return err instanceof ContractViolationError ? err : undefined;
  }
}

describe("classifySpec", () => {
  it("treats a name-only entry as a value slot", () => {
    expect(classifySpec({ name: "topic" }, { topic: "hello" })).toEqual({
      mode: "value",
      value: "hello",
    });
  });

  it("treats an entry with a file key as file-mode", () => {
    expect(classifySpec({ name: "a", file: "a.md" }, {})).toEqual({
      mode: "file",
      path: "a.md",
    });
  });

  it("treats an entry with a paramKey key as file-mode", () => {
    expect(
      classifySpec({ name: "a", paramKey: "pk" }, { pk: "dyn.md" }),
    ).toEqual({ mode: "file", path: "dyn.md" });
  });

  it("treats an entry carrying both keys as file-mode", () => {
    expect(
      classifySpec(
        { name: "a", file: "a.md", paramKey: "pk" },
        { pk: "dyn.md" },
      ),
    ).toEqual({ mode: "file", path: "dyn.md" });
  });

  it("lets a non-empty paramKey value beat file when both are set", () => {
    expect(
      classifySpec(
        { name: "a", file: "a.md", paramKey: "pk" },
        {
          pk: "wins.md",
        },
      ),
    ).toEqual({ mode: "file", path: "wins.md" });
  });

  it("falls back to file when the paramKey value is unusable", () => {
    const unusable: Record<string, unknown>[] = [
      {}, // absent
      { pk: "" }, // empty string
      { pk: 42 }, // number
      { pk: null }, // null
      { pk: {} }, // object
    ];
    for (const values of unusable) {
      expect(
        classifySpec({ name: "a", file: "a.md", paramKey: "pk" }, values),
      ).toEqual({ mode: "file", path: "a.md" });
    }
  });

  it("resolves a paramKey-only entry to the value's path", () => {
    expect(
      classifySpec({ name: "a", paramKey: "pk" }, { pk: "dyn.md" }),
    ).toEqual({ mode: "file", path: "dyn.md" });
  });

  it("marks a paramKey-only entry unresolvable when the value is unusable", () => {
    expect(classifySpec({ name: "a", paramKey: "pk" }, {})).toEqual({
      mode: "unresolvable",
    });
  });

  it("resolves a file-only entry to its static path", () => {
    expect(classifySpec({ name: "a", file: "a.md" }, {})).toEqual({
      mode: "file",
      path: "a.md",
    });
  });

  it("marks an entry with neither usable source unresolvable", () => {
    expect(
      classifySpec({ name: "a", file: "", paramKey: "pk" }, { pk: 42 }),
    ).toEqual({ mode: "unresolvable" });
  });

  it("marks the degenerate empty-file entry unresolvable", () => {
    expect(classifySpec({ name: "a", file: "" }, {})).toEqual({
      mode: "unresolvable",
    });
  });

  it("returns the raw relative path without any base-dir joining", () => {
    expect(classifySpec({ name: "a", file: "sub/dir/a.md" }, {})).toEqual({
      mode: "file",
      path: "sub/dir/a.md",
    });
  });

  it("returns the value for a populated value slot", () => {
    expect(
      classifySpec({ name: "topic" }, { topic: "search the web" }),
    ).toEqual({ mode: "value", value: "search the web" });
  });

  it("reports missing-value for absent, empty, or non-string slot values", () => {
    const unfilled: Record<string, unknown>[] = [
      {}, // absent
      { topic: "" }, // empty string
      { topic: 42 }, // number
      { topic: null }, // null
      { topic: {} }, // object
    ];
    for (const values of unfilled) {
      expect(classifySpec({ name: "topic" }, values)).toEqual({
        mode: "missing-value",
      });
    }
  });
});

describe("validateInputs", () => {
  let tmp: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    tmp = mkdtempSync(join(os.tmpdir(), "contract-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("collects every missing file into ONE throw in declaration order", () => {
    const c = mkContract([
      { name: "a", file: "a.md" },
      { name: "b", file: "b.md" },
    ]);
    const err = catchViolation(() => validateInputs(c, {}, tmp));
    expect(err?.violations.length).toBe(2);
    expect(err?.violations).toEqual([
      `input 'a' file not found: ${join(tmp, "a.md")}`,
      `input 'b' file not found: ${join(tmp, "b.md")}`,
    ]);
  });

  it("names only the failing file slot when a healthy value slot shares the contract", () => {
    const c = mkContract([{ name: "topic" }, { name: "doc", file: "doc.md" }]);
    const err = catchViolation(() =>
      validateInputs(c, { topic: "hello" }, tmp),
    );
    expect(err?.violations).toEqual([
      `input 'doc' file not found: ${join(tmp, "doc.md")}`,
    ]);
  });

  it("reports a bad value and a missing file together in declaration order", () => {
    const c = mkContract([{ name: "topic" }, { name: "doc", file: "doc.md" }]);
    const err = catchViolation(() => validateInputs(c, {}, tmp));
    expect(err?.violations).toEqual([
      "input 'topic' expects a non-empty string value",
      `input 'doc' file not found: ${join(tmp, "doc.md")}`,
    ]);
  });

  it("flags an unresolvable file slot with the pinned violation text", () => {
    const c = mkContract([{ name: "x", file: "" }]);
    const err = catchViolation(() => validateInputs(c, {}, tmp));
    expect(err?.violations).toEqual([
      "input 'x' cannot be resolved (missing 'file' and no usable 'paramKey' value)",
    ]);
  });

  it("passes silently when every input resolves (materialized files + value slot)", () => {
    writeFileSync(join(tmp, "doc.md"), "# doc\n");
    const c = mkContract([{ name: "topic" }, { name: "doc", file: "doc.md" }]);
    expect(() => validateInputs(c, { topic: "hi" }, tmp)).not.toThrow();
  });

  it("never touches the filesystem for a pure-value contract", () => {
    const c = mkContract([{ name: "topic" }, { name: "goal" }]);
    const absentBase = join(tmp, "absent-root");
    expect(() =>
      validateInputs(c, { topic: "a", goal: "b" }, absentBase),
    ).not.toThrow();
  });

  it("names the actual checked path in the file-not-found violation", () => {
    const c = mkContract([{ name: "doc", file: "doc.md" }]);
    const err = catchViolation(() => validateInputs(c, {}, tmp));
    expect(err?.violations[0]).toContain(join(tmp, "doc.md"));
  });

  it("honors the baseDir override (same fixture, different root)", () => {
    const other = mkdtempSync(join(os.tmpdir(), "contract-test-"));
    try {
      writeFileSync(join(other, "doc.md"), "# doc\n");
      const c = mkContract([{ name: "doc", file: "doc.md" }]);
      const err = catchViolation(() => validateInputs(c, {}, tmp));
      expect(err?.violations).toEqual([
        `input 'doc' file not found: ${join(tmp, "doc.md")}`,
      ]);
      expect(() => validateInputs(c, {}, other)).not.toThrow();
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("resolves against process.cwd() when baseDir is omitted", () => {
    writeFileSync(join(tmp, "doc.md"), "# doc\n");
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmp);
    const c = mkContract([{ name: "doc", file: "doc.md" }]);
    expect(() => validateInputs(c, {})).not.toThrow();
    expect(cwdSpy).toHaveBeenCalled();
  });

  it("reports the cwd-joined path when the default-resolved file is absent", () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmp);
    const c = mkContract([{ name: "doc", file: "doc.md" }]);
    const err = catchViolation(() => validateInputs(c, {}));
    expect(err?.violations[0]).toBe(
      `input 'doc' file not found: ${join(tmp, "doc.md")}`,
    );
    expect(cwdSpy).toHaveBeenCalled();
  });

  it("passes vacuously for an empty inputs array", () => {
    expect(() => validateInputs(mkContract([]), {}, tmp)).not.toThrow();
  });
});

describe("checkContract", () => {
  it("accepts a minimal well-formed contract", () => {
    expect(
      checkContract({
        name: "cap",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      }),
    ).toEqual({ ok: true });
  });

  it("accepts name-only value-slot elements in inputs and outputs", () => {
    expect(
      checkContract({
        name: "cap",
        version: "1.0.0",
        inputs: [{ name: "topic" }],
        outputs: [{ name: "summary" }],
        writes: [],
      }),
    ).toEqual({ ok: true });
  });

  it("ignores unknown extra keys on the contract and on elements", () => {
    expect(
      checkContract(
        unchecked({
          name: "cap",
          version: "1.0.0",
          inputs: [
            { name: "a", file: "a.md", schema: "yaml", requiredWhen: "x" },
          ],
          outputs: [],
          writes: [],
          sandbox: { cwd: "workdir" },
        }),
      ),
    ).toEqual({ ok: true });
  });

  it("does not reject duplicate spec names within inputs", () => {
    expect(
      checkContract({
        name: "cap",
        version: "1.0.0",
        inputs: [{ name: "a" }, { name: "a" }],
        outputs: [],
        writes: [],
      }),
    ).toEqual({ ok: true });
  });

  const rejects: Array<[string, unknown, string]> = [
    [
      "missing version",
      { name: "cap", inputs: [], outputs: [], writes: [] },
      "contract.version",
    ],
    [
      "empty version",
      { name: "cap", version: "", inputs: [], outputs: [], writes: [] },
      "contract.version",
    ],
    [
      "missing name",
      { version: "1", inputs: [], outputs: [], writes: [] },
      "contract.name",
    ],
    [
      "empty name",
      { name: "", version: "1", inputs: [], outputs: [], writes: [] },
      "contract.name",
    ],
    [
      "non-array inputs",
      { name: "c", version: "1", inputs: "nope", outputs: [], writes: [] },
      "contract.inputs",
    ],
    [
      "non-array outputs",
      { name: "c", version: "1", inputs: [], outputs: {}, writes: [] },
      "contract.outputs",
    ],
    [
      "non-array writes",
      { name: "c", version: "1", inputs: [], outputs: [], writes: "nope" },
      "contract.writes",
    ],
    [
      "non-string writes element",
      { name: "c", version: "1", inputs: [], outputs: [], writes: ["ok", 7] },
      "contract.writes[1]",
    ],
    [
      "element that is not an object",
      { name: "c", version: "1", inputs: [42], outputs: [], writes: [] },
      "inputs[0] must be a plain object",
    ],
    [
      "element with empty name",
      {
        name: "c",
        version: "1",
        inputs: [{ name: "" }],
        outputs: [],
        writes: [],
      },
      "inputs[0].name",
    ],
    [
      "file key present but non-string",
      {
        name: "c",
        version: "1",
        inputs: [{ name: "a", file: 42 }],
        outputs: [],
        writes: [],
      },
      "inputs[0].file",
    ],
    [
      "file key present but empty",
      {
        name: "c",
        version: "1",
        inputs: [{ name: "a", file: "" }],
        outputs: [],
        writes: [],
      },
      "inputs[0].file",
    ],
    [
      "paramKey key present but non-string in inputs",
      {
        name: "c",
        version: "1",
        inputs: [{ name: "a", paramKey: 42 }],
        outputs: [],
        writes: [],
      },
      "inputs[0].paramKey",
    ],
    [
      "paramKey key present but empty in outputs",
      {
        name: "c",
        version: "1",
        inputs: [],
        outputs: [{ name: "o", paramKey: "" }],
        writes: [],
      },
      "outputs[0].paramKey",
    ],
  ];

  it.each(
    rejects,
  )("rejects %s with a problem naming the offending location", (_label, raw, needle) => {
    const verdict = checkContract(unchecked(raw));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.problems.some((p) => p.includes(needle))).toBe(true);
    }
  });

  it("rejects a non-object contract (null, string, array, function)", () => {
    const nonObjects: unknown[] = [null, "contract", [], () => 0];
    for (const raw of nonObjects) {
      const verdict = checkContract(unchecked(raw));
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) {
        expect(verdict.problems).toEqual(["contract must be a plain object"]);
      }
    }
  });

  it("collects every failed check into one verdict", () => {
    const verdict = checkContract(
      unchecked({ version: "", inputs: "nope", writes: [1] }),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.problems.length).toBeGreaterThanOrEqual(2);
    }
  });
});
