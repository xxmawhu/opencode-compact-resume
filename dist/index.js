/**
 * Hybrid entrypoint: one npm package that works in OpenCode v1 and v2.
 *
 * - v2 loads the default export as a server part (`{ id, setup }`).
 * - v1 (verified on 1.18.14) loads the default export as an object entrypoint
 *   and calls `server(input, options)` to obtain the classic hook map.
 *
 * Both implementations share `src/injector.ts` and `src/options.ts`, so
 * delivery, de-duplication and configuration behave identically.
 *
 * The default export is required by the host loader (v2 reads `{ id, setup }`,
 * v1 reads `server()`), which is the one sanctioned exception to the
 * named-exports convention.
 */
import { PLUGIN_ID } from "./constants.js";
import { PluginError } from "./errors.js";
import { describeError } from "./injector.js";
import { createAppLogger } from "./log.js";
import { createV1Hooks, resolveV1Config } from "./v1.js";
import { setupV2 } from "./v2.js";
function assertV1Input(input) {
    const pluginInput = input;
    const session = pluginInput?.client?.session;
    if (!session ||
        (typeof session.promptAsync !== "function" && typeof session.prompt !== "function")) {
        throw new PluginError(`${PLUGIN_ID}: invalid OpenCode v1 plugin context (session.promptAsync/session.prompt missing)`);
    }
    return pluginInput;
}
/**
 * A 1.x host that inspects `setup` calls it with the classic input
 * (`client` + `directory`) instead of the v2 `ctx.session`/`ctx.event`.
 * Detecting that shape keeps the v1 input out of the v2 subscription path,
 * which otherwise reports "cannot read properties of undefined (subscribe)".
 */
function isV1Input(ctx) {
    const candidate = ctx;
    return typeof candidate?.client?.session === "object" && candidate.client.session !== null;
}
function createServer(input, options) {
    // Defer validation so a bad context surfaces as a rejected promise.
    return Promise.resolve().then(() => createV1Hooks(assertV1Input(input), resolveV1Config(options)));
}
/**
 * Contract R5: a v1-shaped `setup(ctx)` call must be handed to the v1 path.
 * v1 hooks only take effect through the hook map `server()` returns, so the
 * setup call returns that map instead of subscribing to a missing event
 * stream, and hosts that only call `setup()` still get a working plugin.
 *
 * A v1-shaped input without a send transport is a designed degradation: stay
 * inert and log at `info` (visible only with `verbose`), because a warning on
 * every startup would violate contract R8.
 */
async function resolveV1Setup(ctx) {
    try {
        return await createServer(ctx);
    }
    catch (error) {
        const logger = createAppLogger(ctx.client?.app, resolveV1Config(undefined).verbose);
        logger("info", "v1 input without session.promptAsync/prompt; resume inactive", {
            error: describeError(error),
        });
        return () => { };
    }
}
const plugin = {
    id: PLUGIN_ID,
    setup(ctx) {
        if (isV1Input(ctx))
            return resolveV1Setup(ctx);
        return setupV2(ctx);
    },
    server: createServer,
};
export default plugin;
export { DEFAULT_TEXT, PLUGIN_ID } from "./constants.js";
//# sourceMappingURL=index.js.map