import { PLUGIN_ID } from "./constants.js";
import { PluginError } from "./errors.js";
import { createResumeInjector, describeError } from "./injector.js";
import { createConsoleLogger } from "./log.js";
import { normalizeOptions } from "./options.js";
export const V2_COMPACTION_ENDED = "session.compaction.ended";
/**
 * v2 server part. Subscribes to `session.compaction.ended` and injects a
 * synthetic message (a synthetic turn schedules execution without faking a
 * user prompt). Falls back to `session.prompt` on older v2 builds.
 *
 * @returns cleanup function registered by `Plugin.define({ setup })`.
 */
export function setupV2(ctx) {
    const config = normalizeOptions(ctx.options);
    if (!config.enabled)
        return Promise.resolve(() => { });
    const logger = createConsoleLogger(config.verbose);
    const injector = createResumeInjector(config, {
        send: (sessionID, text) => sendV2(ctx, sessionID, text),
        isChildSession: (sessionID) => isChildSession(ctx, sessionID),
        log: logger,
    });
    const controller = new AbortController();
    void consumeCompactionEvents(ctx, injector, controller, logger);
    return Promise.resolve(() => {
        controller.abort();
    });
}
async function consumeCompactionEvents(ctx, injector, controller, logger) {
    try {
        const stream = ctx.event.subscribe({
            types: [V2_COMPACTION_ENDED],
            signal: controller.signal,
        });
        // Terminates when the host closes the stream or the cleanup function aborts
        // the subscription; there is no cycle guard because the stream owns it.
        for await (const event of stream) {
            if (event?.type !== V2_COMPACTION_ENDED)
                continue;
            await injector.handle(event.data?.sessionID, `v2.${V2_COMPACTION_ENDED}`);
        }
    }
    catch (error) {
        if (!controller.signal.aborted) {
            logger("error", "compaction event subscription failed", {
                error: describeError(error),
            });
        }
    }
}
async function sendV2(ctx, sessionID, text) {
    if (typeof ctx.session.synthetic === "function") {
        await ctx.session.synthetic({
            sessionID,
            text,
            description: PLUGIN_ID,
        });
        return;
    }
    if (typeof ctx.session.prompt === "function") {
        await ctx.session.prompt({ sessionID, text });
        return;
    }
    throw new PluginError("v2 session context exposes neither synthetic() nor prompt()");
}
function unwrapSessionInfo(result) {
    if (!result)
        return undefined;
    if ("data" in result && result.data)
        return result.data;
    return result;
}
async function isChildSession(ctx, sessionID) {
    if (typeof ctx.session.get !== "function")
        return false;
    const info = unwrapSessionInfo(await ctx.session.get({ sessionID }));
    return Boolean(info?.parentID ?? info?.parentId);
}
//# sourceMappingURL=v2.js.map