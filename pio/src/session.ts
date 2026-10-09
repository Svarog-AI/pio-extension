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
// capability authoring hosts. With a sessions root, transcript persistence
// is routed into the engagement's fixed-name `top` slot; without one,
// everything stays on the disk-backed defaults under the agent dir (auth,
// provider settings, resource discovery). An optional guard install threads
// one inline extension factory into the construction: its tool_call
// interceptor consults the caller's handler list, and its /exit command
// delegates the dispatch context's shutdown; the install stamps the caller's
// execution state onto every created handle; no other overrides are passed
// anywhere in this file.

/** Guard handler consulted for every tool call. The runner forwards each
 * event's tool name and raw input verbatim and filters nothing, so handlers
 * self-filter by tool name; a returned refusal blocks the call, `undefined`
 * allows it. */
export type GuardHandler = (
  toolName: string,
  input: unknown,
) => { block: true; reason: string } | undefined;

/** Optional guard installation threaded into the session construction. */
export interface GuardInstallOptions {
  /** Opaque identity value stamped onto every created handle; discovery reads
   * it back through the stamp symbol. Deliberately unconstrained: installers
   * supply the concrete object, this module imports none of their types. */
  readonly executionState: unknown;
  /** Handlers consulted in order for every tool call; the first refusal wins. */
  readonly handlers: readonly GuardHandler[];
}

/** Property key carrying the guard execution state on handles built with a
 * guard install: non-enumerable own data property, re-stamped with the same
 * value whenever the runtime re-mints a handle. */
export const EXECUTION_STATE_STAMP: unique symbol = Symbol("execution-state");

/** Optional session-construction extras (additive — callers passing none
 * behave exactly as before). */
export interface CreatePioSessionOptions {
  /** Session event listener attached exactly once to the constructed session. Absent → no subscription. */
  readonly sessionListener?: AgentSessionEventListener;
  /** Custom tools registered into the constructed session; threaded through to the session only when provided. */
  readonly customTools?: ToolDefinition[];
  /** Optional guard install: threads one inline extension factory whose
   * single tool_call interceptor consults the handler list, and stamps
   * executionState onto every created handle. Absent → no factory, no stamp. */
  // Runtimes constructed elsewhere cannot gain a gate after the fact; the
  // factory installs only at construction time.
  readonly guardInstall?: GuardInstallOptions;
}

export async function createPioSession(
  cwd: string,
  sessionsRoot?: string,
  opts?: CreatePioSessionOptions,
): Promise<AgentSessionRuntime> {
  // Conditional on purpose: with a sessions root the transcripts persist in
  // the engagement's `top` slot; without it the single-argument call keeps
  // persistence at the standard location a host pi TUI can open afterwards.
  const sessionManager = sessionsRoot
    ? SessionManager.create(cwd, path.join(sessionsRoot, "top"))
    : SessionManager.create(cwd);

  const guardInstall = opts?.guardInstall;

  // Stored factory closure — the runtime stores it and reuses it for /new,
  // /resume, /fork, and import flows. Destructured names intentionally shadow
  // the locals: verbatim shape of the pin's main.js factory.
  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd,
    agentDir,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = guardInstall
      ? await createAgentSessionServices({
          cwd,
          agentDir,
          resourceLoaderOptions: {
            extensionFactories: [
              (pi) => {
                pi.on("tool_call", (event) => {
                  for (const handler of guardInstall.handlers) {
                    const verdict = handler(event.toolName, event.input);
                    if (verdict !== undefined) return verdict;
                  }
                });
                pi.registerCommand("exit", {
                  handler: async (_args, ctx) => {
                    ctx.shutdown();
                  },
                });
              },
            ],
          },
        })
      : await createAgentSessionServices({ cwd, agentDir });
    const created = await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
      ...(opts?.customTools ? { customTools: opts.customTools } : {}),
    });
    if (guardInstall) {
      Object.defineProperty(created.session, EXECUTION_STATE_STAMP, {
        value: guardInstall.executionState,
        enumerable: false,
        configurable: true,
      });
    }
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
