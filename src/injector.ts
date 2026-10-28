import type { ResumeConfig } from "./options.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type InjectorLog = (
  level: LogLevel,
  message: string,
  extra?: Record<string, unknown>,
) => void;

export interface InjectorDeps {
  /** Deliver the reminder to one session. Must reject on failure. */
  send(sessionID: string, text: string): Promise<void>;
  /** Optional child-session probe used when includeChildSessions is false. */
  isChildSession?(sessionID: string): Promise<boolean>;
  log?: InjectorLog;
  now?: () => number;
}

export interface ResumeInjector {
  /**
   * Inject once for one compaction event. Never throws: a failing plugin hook
   * must not break the host session.
   *
   * @returns true when the reminder was delivered.
   */
  handle(sessionID: string | undefined, source: string): Promise<boolean>;
}

/** Hard cap on the per-session timestamp map for long-running servers. */
const MAX_TRACKED_SESSIONS = 512;

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function createResumeInjector(config: ResumeConfig, deps: InjectorDeps): ResumeInjector {
  // Insertion order doubles as eviction order for the hard cap below.
  const lastInjectedAt = new Map<string, number>();
  const inFlight = new Set<string>();
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});

  const prune = (current: number): void => {
    const cutoff = current - Math.max(config.cooldownMs, 60_000) * 2;
    for (const [sessionID, injectedAt] of lastInjectedAt) {
      if (injectedAt < cutoff) lastInjectedAt.delete(sessionID);
    }
    // Invariant: size <= MAX_TRACKED_SESSIONS after this loop. Variant: the
    // size, which decreases by exactly one per iteration, so the loop runs at
    // most size - MAX times and terminates.
    while (lastInjectedAt.size > MAX_TRACKED_SESSIONS) {
      const oldest = lastInjectedAt.keys().next().value;
      if (oldest === undefined) break; // Unreachable: size > 0.
      lastInjectedAt.delete(oldest);
    }
  };

  return {
    async handle(sessionID, source) {
      if (!config.enabled) {
        log("debug", "plugin disabled; skipping compaction reminder", { source });
        return false;
      }
      if (!sessionID) {
        log("debug", "compaction event without sessionID; skipping", { source });
        return false;
      }
      if (inFlight.has(sessionID)) {
        log("debug", "reminder already in flight; skipping duplicate", { source, sessionID });
        return false;
      }

      const current = now();
      const previous = lastInjectedAt.get(sessionID) ?? 0;
      if (current - previous < config.cooldownMs) {
        log("debug", "cooldown active; skipping duplicate", {
          source,
          sessionID,
          elapsedMs: current - previous,
        });
        return false;
      }

      inFlight.add(sessionID);
      try {
        if (!config.includeChildSessions && deps.isChildSession) {
          let child = false;
          try {
            child = await deps.isChildSession(sessionID);
          } catch (error) {
            // [log-review] warning because: (1) a failed parent probe is an
            // expected degraded path (client without session.get), (2) the
            // reminder is still delivered, so this is not an error, (3) scope:
            // this event only, no session state is lost.
            log("warn", "child-session lookup unavailable; injecting anyway", {
              sessionID,
              error: describeError(error),
            });
          }
          if (child) {
            log("debug", "child session; skipping reminder", { source, sessionID });
            return false;
          }
        }

        await deps.send(sessionID, config.text);
        lastInjectedAt.set(sessionID, now());
        prune(now());
        log("info", "injected unfinished-task reminder after compaction", { source, sessionID });
        return true;
      } catch (error) {
        // No timestamp is recorded on failure, so a later event may retry.
        log("error", "failed to inject unfinished-task reminder", {
          source,
          sessionID,
          error: describeError(error),
        });
        return false;
      } finally {
        inFlight.delete(sessionID);
      }
    },
  };
}
