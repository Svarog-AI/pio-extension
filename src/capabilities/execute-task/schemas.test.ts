import * as Value from "typebox/value";
import {
  EXECUTION_SUMMARY_SCHEMA,
  type ExecutionSummaryOutputs,
} from "./schemas";

// ---------------------------------------------------------------------------
// EXECUTION_SUMMARY_SCHEMA — validation
// ---------------------------------------------------------------------------

describe("EXECUTION_SUMMARY_SCHEMA", () => {
  it("accepts status completed", () => {
    expect(Value.Check(EXECUTION_SUMMARY_SCHEMA, { status: "completed" })).toBe(
      true,
    );
  });

  it("accepts status blocked", () => {
    expect(Value.Check(EXECUTION_SUMMARY_SCHEMA, { status: "blocked" })).toBe(
      true,
    );
  });

  it("rejects unknown status values", () => {
    expect(Value.Check(EXECUTION_SUMMARY_SCHEMA, { status: "unknown" })).toBe(
      false,
    );
  });

  it("rejects missing status field", () => {
    expect(Value.Check(EXECUTION_SUMMARY_SCHEMA, {})).toBe(false);
  });

  it("accepts a commit hash alongside status", () => {
    expect(
      Value.Check(EXECUTION_SUMMARY_SCHEMA, {
        status: "completed",
        commit: "abc123def456",
      }),
    ).toBe(true);
  });

  it("accepts status blocked with a commit hash", () => {
    expect(
      Value.Check(EXECUTION_SUMMARY_SCHEMA, {
        status: "blocked",
        commit: "abc123def456",
      }),
    ).toBe(true);
  });

  it("accepts status without commit (commit is optional)", () => {
    expect(Value.Check(EXECUTION_SUMMARY_SCHEMA, { status: "completed" })).toBe(
      true,
    );
    expect(Value.Check(EXECUTION_SUMMARY_SCHEMA, { status: "blocked" })).toBe(
      true,
    );
  });

  it("rejects a non-string commit", () => {
    expect(
      Value.Check(EXECUTION_SUMMARY_SCHEMA, {
        status: "completed",
        commit: 12345,
      }),
    ).toBe(false);
    expect(
      Value.Check(EXECUTION_SUMMARY_SCHEMA, {
        status: "completed",
        commit: {},
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ExecutionSummaryOutputs — type derivation
// ---------------------------------------------------------------------------

describe("ExecutionSummaryOutputs", () => {
  it("derives a type assignable from valid schema data", () => {
    const data: ExecutionSummaryOutputs = { status: "completed" };
    expect(data.status).toBe("completed");

    const blocked: ExecutionSummaryOutputs = { status: "blocked" };
    expect(blocked.status).toBe("blocked");

    const withCommit: ExecutionSummaryOutputs = {
      status: "completed",
      commit: "abc123def456",
    };
    expect(withCommit.commit).toBe("abc123def456");
  });
});
