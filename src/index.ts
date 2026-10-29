/**
 * Hybrid entrypoint: one npm package that works in OpenCode v1 and v2.
 *
 * - v2 loads the default export as a server part (`{ id, setup }`).
 * - v1 (>= 1.18.29) loads the default export as an object entrypoint and calls
 *   `server(input, options)` to obtain the classic hook map. Older v1 builds
 *   need the classic `plugin` entry instead; see README.
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
import type { RawOptions } from "./options.js";
import { createV1Hooks, resolveV1Config, type V1Hooks, type V1PluginInput } from "./v1.js";
import { setupV2, type V2Context } from "./v2.js";

export interface HybridPlugin {
  readonly id: string;
  setup(ctx: unknown): Promise<() => void>;
  server(input: unknown, options?: RawOptions): Promise<V1Hooks>;
}

function assertV1Input(input: unknown): V1PluginInput {
  const pluginInput = input as V1PluginInput | undefined;
  const session = pluginInput?.client?.session;
  if (
    !session ||
    (typeof session.promptAsync !== "function" && typeof session.prompt !== "function")
  ) {
    throw new PluginError(
      `${PLUGIN_ID}: invalid OpenCode v1 plugin context (session.promptAsync/session.prompt missing)`,
    );
  }
  return pluginInput;
}

const plugin: HybridPlugin = {
  id: PLUGIN_ID,

  setup(ctx: unknown): Promise<() => void> {
    return setupV2(ctx as V2Context);
  },

  server(input: unknown, options?: RawOptions): Promise<V1Hooks> {
    // Defer validation so a bad context surfaces as a rejected promise.
    return Promise.resolve().then(() =>
      createV1Hooks(assertV1Input(input), resolveV1Config(options)),
    );
  },
};

export default plugin;

export { DEFAULT_TEXT, PLUGIN_ID } from "./constants.js";
export type { RawOptions, ResumeConfig } from "./options.js";
