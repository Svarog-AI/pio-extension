import * as Value from "typebox/value";
import { QUALITY_GATE_SCHEMA, type QualityGateOutputs } from "./schemas";

// ---------------------------------------------------------------------------
// QUALITY_GATE_SCHEMA — validation
// ---------------------------------------------------------------------------

describe("QUALITY_GATE_SCHEMA", () => {
  it("accepts status approved", () => {
    expect(Value.Check(QUALITY_GATE_SCHEMA, { status: "approved" })).toBe(true);
  });

  it("accepts status rejected", () => {
    expect(Value.Check(QUALITY_GATE_SCHEMA, { status: "rejected" })).toBe(true);
  });

  it("rejects unknown status values", () => {
    expect(Value.Check(QUALITY_GATE_SCHEMA, { status: "unknown" })).toBe(false);
  });

  it("rejects missing status field", () => {
    expect(Value.Check(QUALITY_GATE_SCHEMA, {})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// QualityGateOutputs — type derivation
// ---------------------------------------------------------------------------

describe("QualityGateOutputs", () => {
  it("derives a type assignable from valid schema data", () => {
    const data: QualityGateOutputs = { status: "approved" };
    expect(data.status).toBe("approved");

    const rejected: QualityGateOutputs = { status: "rejected" };
    expect(rejected.status).toBe("rejected");
  });
});
