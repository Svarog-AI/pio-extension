/**
 * pio — Evolving extension for pi
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Capabilities
import { setupInit } from "./capabilities/init";
import { setupParent } from "./capabilities/parent";
import { setupCreateGoal } from "./capabilities/create-goal";
import { setupDeleteGoal } from "./capabilities/delete-goal";
import { setupCreatePlan } from "./capabilities/create-plan";
import { setupEvolvePlan } from "./capabilities/evolve-plan";
import { setupExecutePlan } from "./capabilities/execute-plan";
import { setupNextTask } from "./capabilities/next-task";
import { setupProjectContext } from "./capabilities/project-context";
import { setupCapability } from "./capabilities/session-capability";
import { setupValidation } from "./capabilities/validation";

export default function (pi: ExtensionAPI) {
  // Shared session capability handlers (wired once)
  setupCapability(pi);
  setupValidation(pi);

  setupInit(pi);
  setupParent(pi);
  setupCreateGoal(pi);
  setupDeleteGoal(pi);
  setupCreatePlan(pi);
  setupEvolvePlan(pi);
  setupExecutePlan(pi);
  setupNextTask(pi);
  setupProjectContext(pi);
}
