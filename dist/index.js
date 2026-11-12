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
import { createConsoleLogger } from "./log.js";
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
const plugin = {
    id: PLUGIN_ID,
    setup(ctx) {
        if (!isV1Input(ctx))
            return setupV2(ctx);
        // v1 callbacks only take effect through `server(input)`, which returns the
        // hook map. `setup` returns a cleanup callback, so this path validates the
        // classic context and then stays inert instead of subscribing to nothing.
        return Promise.resolve().then(() => {
            const logger = createConsoleLogger(false);
            try {
                assertV1Input(ctx);
                // [log-review] warning because: (1) the host passed the classic v1
                // input to the v2-only entrypoint, (2) the reminder cannot register
                // through setup's cleanup callback, (3) scope: one line per load.
                logger("warn", "setup() received the classic v1 input; v1 hooks register through server(), resume stays inert here");
            }
            catch (error) {
                // [log-review] warning because: (1) the context is v1-shaped but has no
                // send transport, (2) the plugin cannot inject anything, so this is a
                // degraded load rather than a failure, (3) scope: one line per load.
                logger("warn", "setup() received a v1-style input without session.promptAsync/prompt; resume stays inert", { error: describeError(error) });
            }
            return () => { };
        });
    },
    server(input, options) {
        // Defer validation so a bad context surfaces as a rejected promise.
        return Promise.resolve().then(() => createV1Hooks(assertV1Input(input), resolveV1Config(options)));
    },
};
export default plugin;
export { DEFAULT_TEXT, PLUGIN_ID } from "./constants.js";
//# sourceMappingURL=index.js.map