import { type AppLoggerLike } from "./log.js";
import { type RawOptions, type ResumeConfig } from "./options.js";
/** Post-compaction event emitted by OpenCode v1. */
export declare const V1_SESSION_COMPACTED = "session.compacted";
/** v1 emits this when the run for a session reaches idle. */
export declare const V1_SESSION_IDLE = "session.idle";
/** v1 also reports every status transition, including idle, as session.status. */
export declare const V1_SESSION_STATUS = "session.status";
export interface V1TextPart {
    type: "text";
    text: string;
}
export interface V1PromptInput {
    path: {
        id: string;
    };
    body: {
        parts: V1TextPart[];
    };
}
export interface V1SessionInfo {
    parentID?: string;
    parentId?: string;
}
export type V1SessionGetResult = V1SessionInfo | {
    data?: V1SessionInfo;
} | undefined;
/**
 * Minimal structural view of the v1 `client` handed to plugins. Keeping it
 * local means the published package has zero runtime dependencies.
 *
 * `promptAsync` is preferred (non-blocking admission); older 1.x clients only
 * expose `prompt`, so both are optional and resolved at call time.
 */
export interface V1Client {
    session: {
        promptAsync?(input: V1PromptInput): Promise<unknown>;
        prompt?(input: V1PromptInput): Promise<unknown>;
        get?(input: {
            path: {
                id: string;
            };
        }): Promise<V1SessionGetResult>;
    };
    app?: AppLoggerLike;
}
export interface V1PluginInput {
    client: V1Client;
    directory?: string;
}
export interface V1SessionStatus {
    type?: string;
}
export interface V1Event {
    type?: string;
    properties?: {
        sessionID?: string;
        status?: V1SessionStatus;
    };
}
export interface V1Hooks {
    event(input: {
        event: V1Event;
    }): Promise<void>;
    "experimental.compaction.autocontinue"(input: {
        sessionID: string;
    }, output: {
        enabled: boolean;
    }): Promise<void>;
}
/**
 * v1 entrypoint hooks.
 *
 * Injection is driven by the post-compaction `session.compacted` event. The
 * `experimental.compaction.autocontinue` hook optionally suppresses OpenCode's
 * generic auto-continue so the custom reminder is the only continuation turn.
 */
export declare function createV1Hooks(input: V1PluginInput, config: ResumeConfig): V1Hooks;
/** Normalize v1 environment and tuple options. Exported for the hybrid entrypoint. */
export declare function resolveV1Config(raw?: RawOptions | null, env?: Record<string, string | undefined>): ResumeConfig;
//# sourceMappingURL=v1.d.ts.map