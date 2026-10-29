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

/**
 * Backoff between delivery attempts. A rejected send means the host never
 * accepted the reminder, so retrying is what turns "compaction happened but no
 * reminder" into "exactly one reminder". The delays stay short because the
 * host waits for this hook.
 */
const RETRY_DELAYS_MS = [150, 400];

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function createResumeInjector(config: ResumeConfig, deps: InjectorDeps): ResumeInjector {
  // Only overlapping deliveries of one event need guarding: a second event
  // means a second compaction, which must inject again. No time window is
  // used because two compactions cannot happen seconds apart, so a window
  // would only ever suppress legitimate reminders.
  const inFlight = new Set<string>();
  const log = deps.log ?? (() => {});

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const sendWithRetry = async (sessionID: string, text: string): Promise<void> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await deps.send(sessionID, text);
        return;
      } catch (error) {
        lastError = error;
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined) break;
        // [log-review] warning because: (1) a single rejected send is a
        // transient transport problem, (2) the retry usually succeeds, (3)
        // the final failure is logged as error by the caller.
        log("warn", "reminder delivery rejected; retrying", {
          sessionID,
          attempt: attempt + 1,
          retryInMs: delay,
          error: describeError(error),
        });
        await sleep(delay);
      }
    }
    throw lastError;
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
        log("debug", "reminder already in flight; skipping duplicate delivery", {
          source,
          sessionID,
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

        await sendWithRetry(sessionID, config.text);
        log("info", "injected unfinished-task reminder after compaction", { source, sessionID });
        return true;
      } catch (error) {
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
