import path from "node:path";
import type {
  AgentSessionRuntime,
  CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// Builds the probe's agent session runtime by mirroring pi's own CLI wiring
// seam (measured mirror points in dist/main.js ~L575–L693 against the pinned
// 0.85.1 dist): SessionManager -> stored runtime factory ->
// createAgentSessionRuntime. With a sessions root, transcript persistence is
// routed into the engagement's fixed-name `top` slot; without one, everything
// stays on the disk-backed defaults under the agent dir (auth, provider
// settings, resource discovery); no other overrides are passed anywhere in
// this file.
export async function createProbeSession(
  cwd: string,
  sessionsRoot?: string,
): Promise<AgentSessionRuntime> {
  // Conditional on purpose: with a sessions root the transcripts persist in
  // the engagement's `top` slot; without it the single-argument call keeps
  // persistence at the standard location a host pi TUI can open afterwards.
  const sessionManager = sessionsRoot
    ? SessionManager.create(cwd, path.join(sessionsRoot, "top"))
    : SessionManager.create(cwd);

  // Stored factory closure — the runtime stores it and reuses it for /new,
  // /resume, /fork, and import flows. Destructured names intentionally shadow
  // the locals: verbatim shape of the pin's main.js factory.
  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd,
    agentDir,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({ cwd, agentDir });
    const created = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
    });
    // CreateAgentSessionRuntimeResult extends the result with services and
    // diagnostics; R1 collects no custom diagnostics (nothing ships without a
    // named consumer).
    return { ...created, services, diagnostics: [] };
  };

  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd: sessionManager.getCwd(),
    agentDir: getAgentDir(),
    sessionManager,
  });
  return runtime;
}
