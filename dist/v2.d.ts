import { type RawOptions } from "./options.js";
export declare const V2_COMPACTION_ENDED = "session.compaction.ended";
export interface V2SessionInfo {
    parentID?: string;
    parentId?: string;
}
export type V2SessionGetResult = V2SessionInfo | {
    data?: V2SessionInfo;
} | undefined;
export interface V2Event {
    type?: string;
    data?: {
        sessionID?: string;
    };
}
export interface V2SubscribeOptions {
    types?: string[];
    signal?: AbortSignal;
}
/**
 * Minimal structural view of the v2 plugin context. Only the three domains the
 * plugin touches are declared so no runtime or type dependency on
 * `@opencode/plugin` is required.
 */
export interface V2Context {
    options?: RawOptions;
    session: {
        synthetic?(input: {
            sessionID: string;
            text: string;
            description?: string;
        }): Promise<unknown>;
        prompt?(input: {
            sessionID: string;
            text: string;
        }): Promise<unknown>;
        get?(input: {
            sessionID: string;
        }): Promise<V2SessionGetResult>;
    };
    event: {
        subscribe(options: V2SubscribeOptions): AsyncIterable<V2Event>;
    };
}
/**
 * v2 server part. Subscribes to `session.compaction.ended` and injects a
 * synthetic message (a synthetic turn schedules execution without faking a
 * user prompt). Falls back to `session.prompt` on older v2 builds.
 *
 * @returns cleanup function registered by `Plugin.define({ setup })`.
 */
export declare function setupV2(ctx: V2Context): Promise<() => void>;
//# sourceMappingURL=v2.d.ts.map