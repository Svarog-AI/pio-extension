import path from "node:path";
import type {
  AgentSessionEventListener,
  AgentSessionRuntime,
  CreateAgentSessionRuntimeFactory,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// Builds an agent session runtime by mirroring pi's own CLI wiring seam
// (measured mirror points in dist/main.js ~L575–L693 against the pinned
// 0.85.1 dist): SessionManager -> stored runtime factory ->
// createAgentSessionRuntime. Shared session-construction seam for the
// built-in probe target and capability authoring hosts. With a sessions
// root, transcript persistence is routed into the engagement's fixed-name
// `top` slot; without one, everything stays on the disk-backed defaults
// under the agent dir (auth, provider settings, resource discovery); no
// other overrides are passed anywhere in this file.

/** Optional session-construction extras (additive — callers passing none
 * behave exactly as before). */
export interface CreateProbeSessionOptions {
  /** Session event listener attached exactly once to the constructed session. Absent → no subscription. */
  readonly sessionListener?: AgentSessionEventListener;
  /** Custom tools registered into the constructed session; threaded through to the session only when provided. */
  readonly customTools?: ToolDefinition[];
}

export async function createProbeSession(
  cwd: string,
  sessionsRoot?: string,
  opts?: CreateProbeSessionOptions,
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
      ...(opts?.customTools ? { customTools: opts.customTools } : {}),
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
  // Attach on the settled runtime's initial session handle, outside the
  // stored factory closure: the closure re-runs for /new, /resume, /fork,
  // and import flows, so attaching inside it would subscribe a duplicate
  // listener on every re-created session. This covers the initial session
  // only. The unsubscribe handle is deliberately dropped.
  const listener = opts?.sessionListener;
  if (listener) {
    runtime.session.subscribe(listener);
  }
  return runtime;
}
