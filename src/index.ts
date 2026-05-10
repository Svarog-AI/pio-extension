/**
 * pio — Evolving extension for pi
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Capabilities
import { setupInit } from "./capabilities/init";
import { setupParent } from "./capabilities/parent";
import { setupCreateGoal } from "./capabilities/create-goal";
import { setupDeleteGoal } from "./capabilities/delete-goal";
import { setupCreatePlan } from "./capabilities/create-plan";
import { setupEvolvePlan } from "./capabilities/evolve-plan";
import { setupExecuteTask } from "./capabilities/execute-task";
import { setupReviewCode } from "./capabilities/review-code";
import { setupExecutePlan } from "./capabilities/execute-plan";
import { setupNextTask } from "./capabilities/next-task";
import { setupProjectContext } from "./capabilities/project-context";
import { setupCreateIssue } from "./capabilities/create-issue";
import { setupGoalFromIssue } from "./capabilities/goal-from-issue";
import { setupCapability } from "./capabilities/session-capability";
import { setupValidation } from "./capabilities/validation";

// ESM-compatible __dirname for resolving skill directories bundled with this extension
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_DIR = path.join(__dirname, "skills");

export default function (pi: ExtensionAPI) {
  // Register pio capabilities as discoverable skills so they appear in
  // the <available_skills> section of pi's default system prompt.
  const skillPaths = [
    path.join(SKILLS_DIR, "pio"),
  ];

  pi.on("resources_discover", async () => {
    return { skillPaths };
  });

  // Shared session capability handlers (wired once)
  setupCapability(pi);
  setupValidation(pi);

  setupInit(pi);
  setupParent(pi);
  setupCreateGoal(pi);
  setupDeleteGoal(pi);
  setupCreatePlan(pi);
  setupEvolvePlan(pi);
  setupExecuteTask(pi);
  setupReviewCode(pi);
  setupExecutePlan(pi);
  setupNextTask(pi);
  setupProjectContext(pi);
  setupCreateIssue(pi);
  setupGoalFromIssue(pi);
}
