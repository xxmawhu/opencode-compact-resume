import type { ResumeConfig } from "./options.js";
export type LogLevel = "debug" | "info" | "warn" | "error";
export type InjectorLog = (level: LogLevel, message: string, extra?: Record<string, unknown>) => void;
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
export declare function describeError(error: unknown): string;
/**
 * Keep the full host error for the log sink. OpenCode v1 flattens most failures
 * to "UnknownError" and stores the real reason in `error.data.message`, so
 * logging `message` alone loses the only actionable field.
 */
export declare function serializeError(error: unknown): Record<string, unknown>;
export declare function createResumeInjector(config: ResumeConfig, deps: InjectorDeps): ResumeInjector;
//# sourceMappingURL=injector.d.ts.map