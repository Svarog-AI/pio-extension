/**
 * pio — Evolving extension for pi
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
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
import { setupReviewTask } from "./capabilities/review-task";
import { setupRevisePlan } from "./capabilities/revise-plan";
import { setupExecutePlan } from "./capabilities/execute-plan";
import { setupNextTask } from "./capabilities/next-task";
import { setupProjectContext } from "./capabilities/project-context";
import { setupCreateIssue } from "./capabilities/create-issue";
import { setupJiraToIssue } from "./capabilities/jira-to-issue";
import { setupGoalFromIssue } from "./capabilities/goal-from-issue";
import { setupListGoals } from "./capabilities/list-goals";
import { setupFinalizeGoal } from "./capabilities/finalize-goal";
import { setupCapability } from "./capabilities/session-capability";
import { setupValidation } from "./guards/validation";
import { setupSessionGuard } from "./guards/session-guard";

// ESM-compatible __dirname for resolving skill directories bundled with this extension
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_DIR = path.join(__dirname, "skills");

/**
 * Discover skills by scanning SKILLS_DIR for subdirectories containing SKILL.md.
 * Registers a resources_discover handler that returns the discovered skill paths.
 * No hardcoded skill names — adding a new skill requires only creating its directory and SKILL.md.
 */
function setupSkills(api: ExtensionAPI): void {
  const skillPaths: string[] = [];

  try {
    const entries = fs.readdirSync(SKILLS_DIR);

    for (const entry of entries) {
      const skillMdPath = path.join(SKILLS_DIR, entry, "SKILL.md");
      if (fs.existsSync(skillMdPath)) {
        skillPaths.push(path.join(SKILLS_DIR, entry));
      }
    }
  } catch {
    // SKILLS_DIR doesn't exist or is unreadable — skip skill registration
    // rather than crashing at startup
  }

  api.on("resources_discover", async () => {
    return { skillPaths };
  });
}

export default function (pi: ExtensionAPI) {
  // Register pio capabilities as discoverable skills so they appear in
  // the <available_skills> section of pi's default system prompt.
  setupSkills(pi);

  // Shared session capability handlers (wired once)
  setupCapability(pi);
  setupValidation(pi);
  setupSessionGuard(pi);

  setupInit(pi);
  setupParent(pi);
  setupCreateGoal(pi);
  setupDeleteGoal(pi);
  setupCreatePlan(pi);
  setupEvolvePlan(pi);
  setupExecuteTask(pi);
  setupReviewTask(pi);
  setupRevisePlan(pi);
  setupExecutePlan(pi);
  setupNextTask(pi);
  setupProjectContext(pi);
  setupCreateIssue(pi);
  setupJiraToIssue(pi);
  setupGoalFromIssue(pi);
  setupListGoals(pi);
  setupFinalizeGoal(pi);
}
