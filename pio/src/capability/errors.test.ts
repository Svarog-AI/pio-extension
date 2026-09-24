// Class-shape suite for the shared capability error home.
// Hermetic: no filesystem, no network, no environment assumptions — the only
// import is ./errors.ts. Covers the inheritance chains, explicit-message
// preservation, the violations payload round-trip, and class `name` values.
import { ContractViolationError, PhaseBudgetError } from "./errors.ts";

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

describe("PhaseBudgetError", () => {
  it("is an instanceof PhaseBudgetError and Error", () => {
    const err = new PhaseBudgetError(3);
    expect(err).toBeInstanceOf(PhaseBudgetError);
    expect(err).toBeInstanceOf(Error);
  });

  it("preserves an explicitly passed message through Error construction", () => {
    expect(new PhaseBudgetError(7, "pb message").message).toBe("pb message");
  });

  it("has name 'PhaseBudgetError'", () => {
    expect(new PhaseBudgetError(1).name).toBe("PhaseBudgetError");
  });
});
