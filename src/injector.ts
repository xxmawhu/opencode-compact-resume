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
 * One retry after a second. A rejected send means the host never accepted the
 * reminder, so a single retry turns transient transport failures into
 * "exactly one reminder"; further attempts are pointless because v1 can also
 * accept a prompt and still drop the turn (see opencode#46842), which no
 * client-side retry can detect. The hook is awaited by the host, so the wait
 * stays short.
 */
const RETRY_DELAY_MS = 1_000;
/** First attempt plus one retry. */
const MAX_ATTEMPTS = 2;

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Keep the full host error for the log sink. OpenCode v1 flattens most failures
 * to "UnknownError" and stores the real reason in `error.data.message`, so
 * logging `message` alone loses the only actionable field.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: String(error) };

  const serialized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };
  const data = (error as { data?: unknown }).data;
  if (data !== undefined) serialized.data = data;
  const code = (error as { code?: unknown }).code;
  if (code !== undefined) serialized.code = code;
  if (error.stack) serialized.stack = error.stack;
  return serialized;
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
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await deps.send(sessionID, text);
        if (attempt > 1) {
          // [log-review] warning because: (1) the first attempt was rejected,
          // (2) the session resumes, so this is not an error, (3) the operator
          // still needs the recovery visible in the default log.
          log("warn", "reminder delivery recovered on retry", {
            sessionID,
            attempts: attempt,
            error: serializeError(lastError),
          });
        }
        return;
      } catch (error) {
        lastError = error;
        if (attempt === MAX_ATTEMPTS) break;
        // [log-review] warning because: (1) a single rejected send is a
        // transient transport problem, (2) the retry may still succeed, (3)
        // the final failure is logged as error by the caller.
        log("warn", "reminder delivery rejected; retrying in 1s", {
          sessionID,
          attempt,
          retryInMs: RETRY_DELAY_MS,
          error: serializeError(error),
        });
        await sleep(RETRY_DELAY_MS);
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
              error: serializeError(error),
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
          attempts: MAX_ATTEMPTS,
          error: serializeError(error),
        });
        return false;
      } finally {
        inFlight.delete(sessionID);
      }
    },
  };
}
