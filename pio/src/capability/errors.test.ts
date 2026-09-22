// Class-shape descriptor-table suite for the shared capability error home
// (Step 1). Hermetic: no filesystem, network, env assumptions, or SDK import —
// the only import is ./errors.ts. Scope per the 2026-09-22 owner trim ruling:
// plan-AC surface plus name rows only.
import {
  CapabilityError,
  ContractViolationError,
  PhaseBudgetError,
} from "./errors.ts";

describe("CapabilityError", () => {
  it("is an instanceof CapabilityError and Error", () => {
    const err = new CapabilityError("boom");
    expect(err).toBeInstanceOf(CapabilityError);
    expect(err).toBeInstanceOf(Error);
  });

  it("preserves an explicitly passed message through Error construction", () => {
    expect(new CapabilityError("envelope message").message).toBe(
      "envelope message",
    );
  });

  it("exposes cause and partial with correct values from the options bag", () => {
    const partial = { ok: false, tokens: 0, durationMs: 0 };
    const err = new CapabilityError("killed", {
      cause: "kill",
      partial,
    });
    expect(err.cause).toEqual("kill");
    expect(err.partial).toEqual(partial);
  });

  it("has name 'CapabilityError'", () => {
    expect(new CapabilityError("x").name).toBe("CapabilityError");
  });
});

describe("ContractViolationError", () => {
  it("chains ContractViolationError -> CapabilityError -> Error", () => {
    const err = new ContractViolationError(["inputs/a.md missing"]);
    expect(err).toBeInstanceOf(ContractViolationError);
    expect(err).toBeInstanceOf(CapabilityError);
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

describe("PhaseBudgetError", () => {
  it("is an instanceof PhaseBudgetError and Error", () => {
    const err = new PhaseBudgetError(3);
    expect(err).toBeInstanceOf(PhaseBudgetError);
    expect(err).toBeInstanceOf(Error);
  });

  it("is deliberately NOT a CapabilityError (pinned negative row)", () => {
    expect(new PhaseBudgetError(3)).not.toBeInstanceOf(CapabilityError);
  });

  it("preserves an explicitly passed message through Error construction", () => {
    expect(new PhaseBudgetError(7, "pb message").message).toBe("pb message");
  });

  it("has name 'PhaseBudgetError'", () => {
    expect(new PhaseBudgetError(1).name).toBe("PhaseBudgetError");
  });
});
