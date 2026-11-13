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
    const rawOptions = ctx?.options;
    const config = normalizeOptions(rawOptions);
    if (!config.enabled)
        return Promise.resolve(() => { });
    // A non-v2 context (the host inspecting the entrypoint, a client-side call)
    // has no session domain at all. Reporting it as a v2 context that lacks
    // event.subscribe is startup noise: it says nothing about the real v2 server
    // context the user is trying to diagnose.
    if (!hasSessionDomain(ctx))
        return Promise.resolve(() => { });
    const logger = createConsoleLogger(config.verbose);
    // The v2 contract is structural: older builds may miss any of these members.
    // Detect a missing capability before subscribing so the plugin stays inert
    // with one diagnostic instead of failing mid-setup.
    if (!hasEventSubscription(ctx)) {
        // [log-review] warning because: (1) the context is v2-shaped but exposes no
        // event stream, (2) the reminder can never fire, (3) scope: one line per
        // load. The payload lets the user report which host path produced it.
        logger("warn", "v2 context has no event.subscribe(); resume inactive", describeContext(ctx));
        return Promise.resolve(() => { });
    }
    if (!hasSendTransport(ctx)) {
        // [log-review] warning because: (1) neither send transport exists, (2) the
        // reminder could never be delivered, (3) scope: one line per load.
        logger("warn", "v2 context exposes neither session.synthetic() nor session.prompt(); resume inactive");
        return Promise.resolve(() => { });
    }
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
/**
 * A v2 server context always carries a `session` domain. Anything else (the
 * classic v1 input, a bare probe object, `undefined`) is not a v2 context and
 * must not be reported as one.
 */
function hasSessionDomain(ctx) {
    const candidate = ctx;
    return typeof candidate?.session === "object" && candidate.session !== null;
}
function hasEventSubscription(ctx) {
    const candidate = ctx;
    return typeof candidate?.event?.subscribe === "function";
}
function hasSendTransport(ctx) {
    const candidate = ctx;
    return (typeof candidate?.session?.synthetic === "function" ||
        typeof candidate?.session?.prompt === "function");
}
/**
 * Shape snapshot attached to the missing-capability warning. The host path is
 * otherwise invisible to users, so these fields distinguish "a v2 build
 * without event.subscribe" from "some other host calling setup".
 */
function describeContext(ctx) {
    const candidate = ctx;
    return {
        keys: Object.keys(candidate),
        session: typeof candidate.session,
        event: typeof candidate.event,
        subscribe: typeof candidate.event?.subscribe,
        directory: candidate.location?.directory,
    };
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