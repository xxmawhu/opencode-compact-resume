import { PluginError } from "./errors.js";
import { createResumeInjector, describeError } from "./injector.js";
import { createAppLogger } from "./log.js";
import { normalizeOptions } from "./options.js";
/** Post-compaction event emitted by OpenCode v1. */
export const V1_SESSION_COMPACTED = "session.compacted";
/** v1 emits this when the run for a session reaches idle. */
export const V1_SESSION_IDLE = "session.idle";
/** v1 also reports every status transition, including idle, as session.status. */
export const V1_SESSION_STATUS = "session.status";
/**
 * v1 entrypoint hooks.
 *
 * Injection is driven by the post-compaction `session.compacted` event. The
 * `experimental.compaction.autocontinue` hook optionally suppresses OpenCode's
 * generic auto-continue so the custom reminder is the only continuation turn.
 */
export function createV1Hooks(input, config) {
    const logger = createAppLogger(input.client.app, config.verbose);
    const injector = createResumeInjector(config, {
        send: (sessionID, text) => sendV1(input.client, sessionID, text),
        isChildSession: (sessionID) => isChildSession(input.client, sessionID),
        log: logger,
    });
    /**
     * Compaction is announced while its run is still `Running`. On v1,
     * `promptAsync` in that state persists the reminder as a user message but
     * never schedules a turn (opencode#46842), so the reminder would sit in the
     * transcript until the user writes again. Record the session here and deliver
     * only after the host reports it idle.
     */
    const pendingResume = new Set();
    const isIdleEvent = (event) => event.type === V1_SESSION_IDLE ||
        (event.type === V1_SESSION_STATUS && event.properties?.status?.type === "idle");
    return {
        async event({ event }) {
            if (!event)
                return;
            if (event.type === V1_SESSION_COMPACTED) {
                const sessionID = event.properties?.sessionID;
                if (!config.enabled || !sessionID)
                    return;
                if (pendingResume.has(sessionID)) {
                    logger("debug", "compaction already pending; coalescing reminder", { sessionID });
                    return;
                }
                pendingResume.add(sessionID);
                logger("debug", "compaction detected; reminder deferred until idle", { sessionID });
                return;
            }
            if (!isIdleEvent(event))
                return;
            const sessionID = event.properties?.sessionID;
            if (!sessionID || !pendingResume.has(sessionID))
                return;
            // The host publishes session.status(idle) and session.idle for the same
            // transition, so deleting before delivery keeps it to exactly one send.
            pendingResume.delete(sessionID);
            await injector.handle(sessionID, "v1.session.idle");
        },
        async "experimental.compaction.autocontinue"(hookInput, output) {
            if (!config.enabled || !config.suppressBuiltinAutoContinue)
                return;
            let child = false;
            try {
                child = await isChildSession(input.client, hookInput.sessionID);
            }
            catch (error) {
                // [log-review] warning because: (1) the probe is expected to be
                // unavailable on clients without session.get, (2) the built-in
                // continue is kept, so the session still resumes, (3) scope: the
                // auto-continue decision for this event only.
                logger("warn", "child-session lookup unavailable; keeping built-in auto-continue", {
                    sessionID: hookInput.sessionID,
                    error: describeError(error),
                });
                return;
            }
            if (child && !config.includeChildSessions)
                return;
            output.enabled = false;
            logger("debug", "suppressed built-in auto-continue", { sessionID: hookInput.sessionID });
        },
    };
}
async function sendV1(client, sessionID, text) {
    const prompt = {
        path: { id: sessionID },
        body: { parts: [{ type: "text", text }] },
    };
    if (typeof client.session.promptAsync === "function") {
        await client.session.promptAsync(prompt);
        return;
    }
    if (typeof client.session.prompt === "function") {
        await client.session.prompt(prompt);
        return;
    }
    throw new PluginError("v1 client exposes neither session.promptAsync() nor session.prompt()");
}
function unwrapSessionInfo(result) {
    if (!result)
        return undefined;
    if ("data" in result && result.data)
        return result.data;
    return result;
}
async function isChildSession(client, sessionID) {
    if (!client.session.get)
        return false;
    const info = unwrapSessionInfo(await client.session.get({ path: { id: sessionID } }));
    return Boolean(info?.parentID ?? info?.parentId);
}
/** Normalize v1 environment and tuple options. Exported for the hybrid entrypoint. */
export function resolveV1Config(raw, env = process.env) {
    return normalizeOptions(raw, env);
}
//# sourceMappingURL=v1.js.map