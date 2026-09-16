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
// 0.85.1 dist): standard-location SessionManager -> stored runtime factory ->
// createAgentSessionRuntime. Everything else stays on the disk-backed defaults
// under the agent dir (auth, provider settings, resource discovery); no
// overrides are passed anywhere in this file.
export async function createProbeSession(
  cwd: string,
): Promise<AgentSessionRuntime> {
  // Single argument on purpose: omitting the sessions-dir argument keeps
  // persistence at the standard location a host pi TUI can open afterwards.
  const sessionManager = SessionManager.create(cwd);

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
