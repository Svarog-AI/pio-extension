// Session host for capability authoring: wraps one constructed agent
// session runtime BY REFERENCE and feeds its counters store from the single
// instance-scoped listener threaded through the construction seam.
//
// The listener is the sole event feed: it is minted here, passed as a
// sessionListener option (attached exactly once at construction by the
// seam), and routes events into instance-owned observation state. There is
// no other subscription site and no module-level mutable state.
//
// Token aggregation is local on purpose: the platform's usage-totals helper
// is not exported from the installed package root (deep-importing it is
// blocked by its exports map), and the stats accessor aggregates on a
// different channel that cannot supply per-run deltas. The local accumulator
// mirrors the platform's five-field additive rules, and the exposed token
// scalar applies the same derivation the platform uses for its own stats
// total.

import type {
  AgentSessionEvent,
  AgentSessionEventListener,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";
import { createProbeSession } from "../session.ts";

/** Tool names whose successful executions commit a file path. */
const FILE_TOOL_NAMES: ReadonlySet<string> = new Set(["write", "edit"]);

/** Exact tool name matched for the ask-user counter. */
const ASK_USER_TOOL_NAME = "ask_user";

/** Cumulative run-observation counters over one session lifetime. */
export interface SessionCounters {
  /** Committed successful write/edit end count; equals the master path-list length. */
  readonly filesWritten: number;
  /** Tool executions started under the matched ask-user name. */
  readonly askUserCalls: number;
  /** Per-name count of started tool executions, failures included. */
  readonly toolUses: Record<string, number>;
  /** Sum of observed assistant usages: input + output + cacheRead + cacheWrite. */
  readonly tokens: number;
}

/**
 * Minimal instance variable store (get/set/list over a Map). Deliberately
 * distinct from the root tree's richer same-named class (different
 * package, different surface); later work wraps this same store rather
 * than renaming it.
 */
export class SessionVariableStore {
  #entries: Map<string, unknown> = new Map();

  /** Stored value, or undefined when the name is absent. */
  get(name: string): unknown {
    return this.#entries.get(name);
  }

  /** Raw assignment — value-shape coercion belongs to the wrapping layer. */
  set(name: string, value: unknown): void {
    this.#entries.set(name, value);
  }

  /** Insertion-ordered, deduplicated key list. */
  list(): string[] {
    return [...this.#entries.keys()];
  }
}

// Additive usage totals mirroring the platform's five-field struct. Cost is
// tracked to keep the struct shape identical, though nothing exposes it yet.
interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

// Instance-owned observation state fed exclusively by the single
// instance-scoped listener. Owns the per-tool start counts, the
// toolCallId-correlated pending-path map (interrupted starts are drained at
// each run start), the monotonic committed-path master list with its
// consuming take cursor, and the assistant usage accumulator.
class SessionObserver {
  #toolUses: Record<string, number> = {};
  #filesWritten = 0;
  #askUserCalls = 0;
  #pendingPaths: Map<string, string> = new Map();
  #masterList: string[] = [];
  #takenUpTo = 0;
  #usageTotals: UsageTotals = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  };

  handle(event: AgentSessionEvent): void {
    switch (event.type) {
      case "agent_start":
        // An interrupted execution's dangling start must not leak into a
        // later run's committed-path partition.
        this.#pendingPaths.clear();
        break;
      case "tool_execution_start": {
        const { toolCallId, toolName, args } = event;
        this.#toolUses[toolName] = (this.#toolUses[toolName] ?? 0) + 1;
        if (toolName === ASK_USER_TOOL_NAME) {
          this.#askUserCalls += 1;
        }
        if (FILE_TOOL_NAMES.has(toolName)) {
          // Optional chaining keeps this null-safe; duplicate call ids
          // overwrite.
          const path = args?.path;
          if (typeof path === "string" && path.length > 0) {
            this.#pendingPaths.set(toolCallId, path);
          }
        }
        break;
      }
      case "tool_execution_end":
        // The end event carries no args: the path came from the matching
        // start, and the outcome decides whether it commits.
        this.#resolveEnd(event.toolCallId, event.isError);
        break;
      case "message_end": {
        // Only assistant persistence carries main-LLM usage; tool results
        // carry their own tool-execution accounting and must stay out.
        const message = event.message;
        if (message.role === "assistant") {
          const totals = this.#usageTotals;
          totals.input += message.usage.input;
          totals.output += message.usage.output;
          totals.cacheRead += message.usage.cacheRead;
          totals.cacheWrite += message.usage.cacheWrite;
          totals.cost += message.usage.cost.total;
        }
        break;
      }
      default:
        // Everything else — tool_execution_update, turn_*, agent_end,
        // agent_settled, queue/compaction/retry/summarization events — is
        // observation-neutral.
        break;
    }
  }

  /** Fresh snapshot object; callers may retain or mutate it freely. */
  snapshot(): SessionCounters {
    const totals = this.#usageTotals;
    return {
      filesWritten: this.#filesWritten,
      askUserCalls: this.#askUserCalls,
      toolUses: { ...this.#toolUses },
      tokens:
        totals.input + totals.output + totals.cacheRead + totals.cacheWrite,
    };
  }

  /** Consuming partition of committed paths since the last take. */
  takeFilesWrittenDelta(): string[] {
    const delta = this.#masterList.slice(this.#takenUpTo);
    this.#takenUpTo = this.#masterList.length;
    return delta;
  }

  #resolveEnd(toolCallId: string, isError: boolean): void {
    const path = this.#pendingPaths.get(toolCallId);
    this.#pendingPaths.delete(toolCallId);
    if (!isError && path !== undefined) {
      this.#masterList.push(path);
      this.#filesWritten += 1;
    }
  }
}

/**
 * Host for one capability engagement: owns the constructed session runtime
 * by reference plus the run observation fed by its single attached
 * listener. Construction settles before an instance is ever handed out.
 */
export class PioSession {
  /** Identity of the settled session handle. */
  readonly id: string;
  /** Constructed runtime by reference — reach path for runs and teardown. */
  readonly runtime: AgentSessionRuntime;
  /** Fresh per-instance variable store (hooks consume it by reference). */
  readonly vars: SessionVariableStore;

  #observer: SessionObserver;

  private constructor(runtime: AgentSessionRuntime, observer: SessionObserver) {
    this.id = runtime.session.sessionId;
    this.runtime = runtime;
    this.vars = new SessionVariableStore();
    this.#observer = observer;
  }

  /**
   * The only construction path: mints the observer and its single
   * instance-scoped listener, threads the listener through the
   * construction seam (exactly one subscription across the instance
   * lifetime), and returns the ready instance.
   */
  static async create(cwd: string, sessionsRoot?: string): Promise<PioSession> {
    const observer = new SessionObserver();
    const listener: AgentSessionEventListener = (event) => {
      observer.handle(event);
    };
    const runtime = await createProbeSession(cwd, sessionsRoot, {
      sessionListener: listener,
    });
    return new PioSession(runtime, observer);
  }

  /** Session-cumulative snapshot (fresh object per call). */
  counters(): SessionCounters {
    return this.#observer.snapshot();
  }

  /** Consuming partition of committed file paths since the last take. */
  takeFilesWrittenDelta(): string[] {
    return this.#observer.takeFilesWrittenDelta();
  }
}
