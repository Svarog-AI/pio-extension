// Class-shape suite for the shared capability error home.
// Hermetic: no filesystem, no network, no environment assumptions — the only
// module import is ./errors.ts. Covers the inheritance chain, explicit-
// message preservation, the violations payload round-trip, the class `name`
// value, the default-message composition goldens, and the mechanical
// surface guards (runtime export surface, closed-union source scan). The
// source-guard row reads the module source via node:fs (descriptor read,
// no import).
import { readFileSync } from "node:fs";
import {
  ContractViolationError,
  MissingVariableError,
  PhaseInterruptionError,
  VariableRejectionError,
} from "./errors.ts";

describe("ContractViolationError", () => {
  it("is an instanceof ContractViolationError and Error", () => {
    const err = new ContractViolationError(["inputs/a.md missing"]);
    expect(err).toBeInstanceOf(ContractViolationError);
    expect(err).toBeInstanceOf(Error);
  });

  it("preserves an explicitly passed message through Error construction", () => {
    expect(new ContractViolationError(["v"], "cv message").message).toBe(
      "cv message",
    );
  });

  it("exposes violations with the values passed in", () => {
    const violations = ["inputs/a.md missing", "outputs/b.md missing"];
    expect(new ContractViolationError(violations).violations).toEqual(
      violations,
    );
  });

  it("has name 'ContractViolationError'", () => {
    expect(new ContractViolationError(["v"]).name).toBe(
      "ContractViolationError",
    );
  });
});

describe("VariableRejectionError", () => {
  it("is an instanceof VariableRejectionError and Error", () => {
    const err = new VariableRejectionError(["line"]);
    expect(err).toBeInstanceOf(VariableRejectionError);
    expect(err).toBeInstanceOf(Error);
  });

  it("has name 'VariableRejectionError'", () => {
    expect(new VariableRejectionError(["v"]).name).toBe(
      "VariableRejectionError",
    );
  });

  it("preserves an explicitly passed message through Error construction", () => {
    expect(new VariableRejectionError(["v"], "custom voice").message).toBe(
      "custom voice",
    );
  });

  it("exposes violations with the values passed in", () => {
    const violations = [
      "variable 'a' has no declared base type \u2014 a base type must be declared before writing",
      "variable 'b' has no declared base type \u2014 a base type must be declared before writing",
    ];
    expect(new VariableRejectionError(violations).violations).toEqual(
      violations,
    );
  });

  it("composes the default message with the pinned prefix over '; '-joined violations (one representative exemplar line per concern shape)", () => {
    // Representative exemplar lines, one per store-side concern shape:
    // this home pins the COMPOSITION mechanic (prefix + join); the emitted
    // store-side clause bytes are goldened in pio-session.test.ts (sole
    // owners: the module-private renderers there).
    const lines = [
      "variable 'enabled' cannot take a value of type 'string' as declared type 'boolean' \u2014 token is not a recognized boolean form",
      "read of variable 'count' as 'number' failed \u2014 variable is absent",
      "read of variable 'flag' as 'boolean' failed \u2014 stored value of type 'string' cannot convert to 'boolean'",
    ];
    expect(new VariableRejectionError(lines).message).toBe(
      `Variable rejection: ${lines.join("; ")}`,
    );
    expect(new VariableRejectionError([lines[0]]).message).toBe(
      `Variable rejection: ${lines[0]}`,
    );
  });

  it("carries NO cause member (the closed five-member vocabulary adoption stays out of reach)", () => {
    expect("cause" in new VariableRejectionError(["v"])).toBe(false);
  });
});

describe("MissingVariableError", () => {
  it("is an instanceof MissingVariableError, ContractViolationError AND Error (subclass identity keeps every pre-existing instanceof consumer green verbatim)", () => {
    const err = new MissingVariableError(
      ["phase 'p' variable 'a' missing"],
      ["a"],
    );
    expect(err).toBeInstanceOf(MissingVariableError);
    expect(err).toBeInstanceOf(ContractViolationError);
    expect(err).toBeInstanceOf(Error);
  });

  it("has name 'MissingVariableError'", () => {
    expect(new MissingVariableError(["l"], ["a"]).name).toBe(
      "MissingVariableError",
    );
  });

  it("exposes the structured names datum alongside the inherited violations (both pass through with the values given)", () => {
    const err = new MissingVariableError(["l1", "l2"], ["a", "b"]);
    expect(err.names).toEqual(["a", "b"]);
    expect(err.violations).toEqual(["l1", "l2"]);
  });

  it("composes the default message from the SAME engine-owned line renderers as the legacy throw (prefix over '; '-joined lines - zero drift on the line bytes)", () => {
    const lines = [
      "phase 'g' variable 'a' missing \u2014 still undefined after 3 variable expectation re-run(s); the ceiling is exhausted",
      "phase 'g' variable 'b' missing \u2014 still undefined after 3 variable expectation re-run(s); the ceiling is exhausted",
    ];
    expect(new MissingVariableError(lines, ["a", "b"]).message).toBe(
      `Contract violation: ${lines.join("; ")}`,
    );
    expect(new MissingVariableError([lines[0]], ["a"]).message).toBe(
      `Contract violation: ${lines[0]}`,
    );
  });

  it("preserves an explicitly passed message through Error construction", () => {
    expect(
      new MissingVariableError(["l"], ["a"], "explicit verdict voice").message,
    ).toBe("explicit verdict voice");
  });
});

describe("PhaseInterruptionError", () => {
  it("is an instanceof PhaseInterruptionError and Error", () => {
    const err = new PhaseInterruptionError();
    expect(err).toBeInstanceOf(PhaseInterruptionError);
    expect(err).toBeInstanceOf(Error);
  });

  it("has name 'PhaseInterruptionError'", () => {
    expect(new PhaseInterruptionError().name).toBe("PhaseInterruptionError");
  });

  it("carries the pinned ONE-form message (U+2014 escaped identically on both sides; no interpolation, single concern)", () => {
    const message = new PhaseInterruptionError().message;
    expect(message).toBe(
      "Phase interruption: the settling run ended on a user abort \u2014 the phase settles as cancelled",
    );
    expect(message.charCodeAt(59)).toBe(0x2014);
    expect(message.length).toBe(91);
  });

  it("carries NO cause member (the closed five-member vocabulary adoption stays out of reach — bare-identity reduction is the detection channel)", () => {
    expect("cause" in new PhaseInterruptionError()).toBe(false);
  });
});

describe("mechanical discipline over the error-home surface", () => {
  it("runtime export surface is EXACTLY ['ContractViolationError', 'MissingVariableError', 'PhaseInterruptionError', 'VariableRejectionError'] sorted (types erase under erasable syntax)", async () => {
    expect(Object.keys(await import("./errors.ts")).sort()).toEqual(
      [
        "ContractViolationError",
        "MissingVariableError",
        "PhaseInterruptionError",
        "VariableRejectionError",
      ].sort(),
    );
  });

  it("the CapabilityErrorCause union stays byte-identical: the five closed members in the pinned order (normalized whitespace)", () => {
    const src = readFileSync(new URL("./errors.ts", import.meta.url), "utf8");
    const declaration = src.match(
      /export type CapabilityErrorCause =[^;]*;/,
    )?.[0];
    expect(declaration?.replace(/\s+/g, " ").trim()).toBe(
      'export type CapabilityErrorCause = | "budget" | "kill" | "spawn" | "contract" | "author-halt";',
    );
    // Five and only five members (the post-retirement "budget" survivor
    // keeps its slot).
    expect(declaration?.match(/\| "[a-z-]+"/g)?.length).toBe(5);
  });
});
