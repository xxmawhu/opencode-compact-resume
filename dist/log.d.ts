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
export declare function createAppLogger(app: AppLoggerLike | undefined, verbose: boolean): InjectorLog;
/**
 * v2 logger: the v2 plugin context exposes no log API, and `console` output is
 * captured by the OpenCode server log, so it is the only available sink.
 *
 * Console usage is a deliberate, single-module exception to the "no console"
 * rule; warnings and errors are the only levels emitted by default.
 */
export declare function createConsoleLogger(verbose: boolean): InjectorLog;
//# sourceMappingURL=log.d.ts.map