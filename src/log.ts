import { PLUGIN_ID } from "./constants.js";
import type { InjectorLog, LogLevel } from "./injector.js";

export interface AppLogInput {
  body: {
    service: string;
    level: LogLevel;
    message: string;
    extra?: Record<string, unknown>;
  };
}

export interface AppLoggerLike {
  log?(input: AppLogInput): Promise<unknown>;
}

/**
 * v1 logger: route diagnostics through `client.app.log` so they land in the
 * OpenCode server log instead of the user's terminal.
 */
export function createAppLogger(app: AppLoggerLike | undefined, verbose: boolean): InjectorLog {
  return (level, message, extra) => {
    if (!verbose && (level === "debug" || level === "info")) return;
    if (!app?.log) return;

    const body: AppLogInput["body"] = { service: PLUGIN_ID, level, message };
    if (extra) body.extra = extra;

    try {
      void app.log({ body }).catch(() => {
        // Logging must never affect session execution.
      });
    } catch {
      // A synchronous logger failure is equally harmless.
    }
  };
}

/**
 * v2 logger: the v2 plugin context exposes no log API, and `console` output is
 * captured by the OpenCode server log, so it is the only available sink.
 *
 * Console usage is a deliberate, single-module exception to the "no console"
 * rule; warnings and errors are the only levels emitted by default.
 */
export function createConsoleLogger(verbose: boolean): InjectorLog {
  return (level, message, extra) => {
    if (!verbose && level !== "warn" && level !== "error") return;
    const suffix = extra ? ` ${safeStringify(extra)}` : "";
    const line = `${PLUGIN_ID}: ${message}${suffix}`;
    if (level === "warn" || level === "error") {
      // Level mapping only; the degradation rationale lives at each call site
      // and is marked with [log-review].
      console.error(line);
    } else {
      console.log(line);
    }
  };
}

function safeStringify(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}
