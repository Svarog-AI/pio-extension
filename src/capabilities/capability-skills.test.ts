import { CAPABILITY_CONFIG as CREATE_GOAL_CONFIG } from "./create-goal";
import { CAPABILITY_CONFIG as CREATE_PLAN_CONFIG } from "./create-plan";
import { CAPABILITY_CONFIG as EVOLVE_PLAN_CONFIG } from "./evolve-plan";
import { CAPABILITY_CONFIG as EXECUTE_TASK_CONFIG } from "./execute-task";
import { CAPABILITY_CONFIG as REVIEW_TASK_CONFIG } from "./review-task";
import { CAPABILITY_CONFIG as EXECUTE_PLAN_CONFIG } from "./execute-plan";
import { CAPABILITY_CONFIG as REVISE_PLAN_CONFIG } from "./revise-plan";
import { CAPABILITY_CONFIG as PROJECT_CONTEXT_CONFIG } from "./project-context";
import { CAPABILITY_CONFIG as FINALIZE_GOAL_CONFIG } from "./finalize-goal";

// ---------------------------------------------------------------------------
// create-goal: mandatory [pio-planning, grill-me, pio-git], recommended [source-research]
// ---------------------------------------------------------------------------

describe("create-goal CAPABILITY_CONFIG.skills", () => {
  it("has mandatory skills [pio-planning, grill-me, pio-git]", () => {
    // Act & Assert
    expect(CREATE_GOAL_CONFIG.skills?.mandatory).toEqual([
      "pio-planning",
      "grill-me",
      "pio-git",
    ]);
  });

  it("has recommended skill source-research with correct condition", () => {
    // Act & Assert
    expect(CREATE_GOAL_CONFIG.skills?.recommended).toEqual([
      { name: "source-research", condition: "when researching existing solutions or libraries" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// create-plan: mandatory [pio-planning, grill-me], recommended [source-research]
// ---------------------------------------------------------------------------

describe("create-plan CAPABILITY_CONFIG.skills", () => {
  it("has mandatory skills [pio-planning, grill-me]", () => {
    // Act & Assert
    expect(CREATE_PLAN_CONFIG.skills?.mandatory).toEqual([
      "pio-planning",
      "grill-me",
    ]);
  });

  it("has recommended skill source-research with correct condition", () => {
    // Act & Assert
    expect(CREATE_PLAN_CONFIG.skills?.recommended).toEqual([
      { name: "source-research", condition: "when researching existing solutions or libraries" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// evolve-plan: mandatory [pio-planning, grill-me], no recommended
// ---------------------------------------------------------------------------

describe("evolve-plan CAPABILITY_CONFIG.skills", () => {
  it("has mandatory skills [pio-planning, grill-me]", () => {
    // Act & Assert
    expect(EVOLVE_PLAN_CONFIG.skills?.mandatory).toEqual([
      "pio-planning",
      "grill-me",
    ]);
  });

  it("omits the recommended key entirely", () => {
    // Act & Assert
    expect(EVOLVE_PLAN_CONFIG.skills?.recommended).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// execute-task: mandatory [test-driven-development, pio-git], no recommended
// ---------------------------------------------------------------------------

describe("execute-task CAPABILITY_CONFIG.skills", () => {
  it("has mandatory skills [test-driven-development, pio-git]", () => {
    // Act & Assert
    expect(EXECUTE_TASK_CONFIG.skills?.mandatory).toEqual([
      "test-driven-development",
      "pio-git",
    ]);
  });

  it("omits the recommended key entirely", () => {
    // Act & Assert
    expect(EXECUTE_TASK_CONFIG.skills?.recommended).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// review-task: mandatory [test-driven-development], no recommended
// ---------------------------------------------------------------------------

describe("review-task CAPABILITY_CONFIG.skills", () => {
  it("has mandatory skills [test-driven-development]", () => {
    // Act & Assert
    expect(REVIEW_TASK_CONFIG.skills?.mandatory).toEqual([
      "test-driven-development",
    ]);
  });

  it("omits the recommended key entirely", () => {
    // Act & Assert
    expect(REVIEW_TASK_CONFIG.skills?.recommended).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// execute-plan: mandatory [test-driven-development, pio-git], no recommended
// ---------------------------------------------------------------------------

describe("execute-plan CAPABILITY_CONFIG.skills", () => {
  it("has mandatory skills [test-driven-development, pio-git]", () => {
    // Act & Assert
    expect(EXECUTE_PLAN_CONFIG.skills?.mandatory).toEqual([
      "test-driven-development",
      "pio-git",
    ]);
  });

  it("omits the recommended key entirely", () => {
    // Act & Assert
    expect(EXECUTE_PLAN_CONFIG.skills?.recommended).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// revise-plan: mandatory [pio-planning, grill-me], recommended [source-research]
// ---------------------------------------------------------------------------

describe("revise-plan CAPABILITY_CONFIG.skills", () => {
  it("has mandatory skills [pio-planning, grill-me]", () => {
    // Act & Assert
    expect(REVISE_PLAN_CONFIG.skills?.mandatory).toEqual([
      "pio-planning",
      "grill-me",
    ]);
  });

  it("has recommended skill source-research with correct condition", () => {
    // Act & Assert
    expect(REVISE_PLAN_CONFIG.skills?.recommended).toEqual([
      { name: "source-research", condition: "when researching existing solutions or libraries" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// project-context: mandatory [pio-project-knowledge], recommended [source-research]
// ---------------------------------------------------------------------------

describe("project-context CAPABILITY_CONFIG.skills", () => {
  it("has mandatory skills [pio-project-knowledge]", () => {
    // Act & Assert
    expect(PROJECT_CONTEXT_CONFIG.skills?.mandatory).toEqual([
      "pio-project-knowledge",
    ]);
  });

  it("has recommended skill source-research with project-specific condition", () => {
    // Act & Assert
    expect(PROJECT_CONTEXT_CONFIG.skills?.recommended).toEqual([
      { name: "source-research", condition: "when researching project dependencies or external tools" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// finalize-goal: mandatory [pio-project-knowledge, pio-git], no recommended
// ---------------------------------------------------------------------------

describe("finalize-goal CAPABILITY_CONFIG.skills", () => {
  it("has mandatory skills [pio-project-knowledge, pio-git]", () => {
    // Act & Assert
    expect(FINALIZE_GOAL_CONFIG.skills?.mandatory).toEqual([
      "pio-project-knowledge",
      "pio-git",
    ]);
  });

  it("omits the recommended key entirely", () => {
    // Act & Assert
    expect(FINALIZE_GOAL_CONFIG.skills?.recommended).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Cross-capability: source-research condition consistency
// ---------------------------------------------------------------------------

describe("source-research condition text consistency", () => {
  it("create-goal, create-plan, and revise-plan use identical condition text", () => {
    const expectedCondition = "when researching existing solutions or libraries";

    expect(CREATE_GOAL_CONFIG.skills?.recommended?.[0]?.condition).toBe(expectedCondition);
    expect(CREATE_PLAN_CONFIG.skills?.recommended?.[0]?.condition).toBe(expectedCondition);
    expect(REVISE_PLAN_CONFIG.skills?.recommended?.[0]?.condition).toBe(expectedCondition);
  });

  it("project-context uses a different project-specific condition", () => {
    const expectedCondition = "when researching project dependencies or external tools";

    expect(PROJECT_CONTEXT_CONFIG.skills?.recommended?.[0]?.condition).toBe(expectedCondition);
  });
});
