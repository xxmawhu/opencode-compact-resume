import { PLUGIN_ID } from "./constants.js";
import { PluginError } from "./errors.js";
import { createResumeInjector, describeError, type InjectorLog } from "./injector.js";
import { createConsoleLogger } from "./log.js";
import { normalizeOptions, type RawOptions } from "./options.js";

export const V2_COMPACTION_ENDED = "session.compaction.ended";

export interface V2SessionInfo {
  parentID?: string;
  parentId?: string;
}

export type V2SessionGetResult = V2SessionInfo | { data?: V2SessionInfo } | undefined;

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
    synthetic?(input: { sessionID: string; text: string; description?: string }): Promise<unknown>;
    prompt?(input: { sessionID: string; text: string }): Promise<unknown>;
    get?(input: { sessionID: string }): Promise<V2SessionGetResult>;
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
export function setupV2(ctx: V2Context): Promise<() => void> {
  const config = normalizeOptions(ctx.options);
  if (!config.enabled) return Promise.resolve(() => {});

  const logger: InjectorLog = createConsoleLogger(config.verbose);
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

async function consumeCompactionEvents(
  ctx: V2Context,
  injector: ReturnType<typeof createResumeInjector>,
  controller: AbortController,
  logger: InjectorLog,
): Promise<void> {
  try {
    const stream = ctx.event.subscribe({
      types: [V2_COMPACTION_ENDED],
      signal: controller.signal,
    });
    // Terminates when the host closes the stream or the cleanup function aborts
    // the subscription; there is no cycle guard because the stream owns it.
    for await (const event of stream) {
      if (event?.type !== V2_COMPACTION_ENDED) continue;
      await injector.handle(event.data?.sessionID, `v2.${V2_COMPACTION_ENDED}`);
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      logger("error", "compaction event subscription failed", {
        error: describeError(error),
      });
    }
  }
}

async function sendV2(ctx: V2Context, sessionID: string, text: string): Promise<void> {
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

function unwrapSessionInfo(result: V2SessionGetResult): V2SessionInfo | undefined {
  if (!result) return undefined;
  if ("data" in result && result.data) return result.data;
  return result as V2SessionInfo;
}

async function isChildSession(ctx: V2Context, sessionID: string): Promise<boolean> {
  if (typeof ctx.session.get !== "function") return false;
  const info = unwrapSessionInfo(await ctx.session.get({ sessionID }));
  return Boolean(info?.parentID ?? info?.parentId);
}
