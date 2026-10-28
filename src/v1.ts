import { PluginError } from "./errors.js";
import { createResumeInjector, describeError, type InjectorLog } from "./injector.js";
import { createAppLogger, type AppLoggerLike } from "./log.js";
import { normalizeOptions, type RawOptions, type ResumeConfig } from "./options.js";

/** Post-compaction event emitted by OpenCode v1. */
export const V1_SESSION_COMPACTED = "session.compacted";

export interface V1TextPart {
  type: "text";
  text: string;
}

export interface V1PromptInput {
  path: { id: string };
  body: { parts: V1TextPart[] };
}

export interface V1SessionInfo {
  parentID?: string;
  parentId?: string;
}

export type V1SessionGetResult = V1SessionInfo | { data?: V1SessionInfo } | undefined;

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
    get?(input: { path: { id: string } }): Promise<V1SessionGetResult>;
  };
  app?: AppLoggerLike;
}

export interface V1PluginInput {
  client: V1Client;
  directory?: string;
}

export interface V1Event {
  type?: string;
  properties?: {
    sessionID?: string;
  };
}

export interface V1Hooks {
  event(input: { event: V1Event }): Promise<void>;
  "experimental.compaction.autocontinue"(
    input: { sessionID: string },
    output: { enabled: boolean },
  ): Promise<void>;
}

/**
 * v1 entrypoint hooks.
 *
 * Injection is driven by the post-compaction `session.compacted` event. The
 * `experimental.compaction.autocontinue` hook optionally suppresses OpenCode's
 * generic auto-continue so the custom reminder is the only continuation turn.
 */
export function createV1Hooks(input: V1PluginInput, config: ResumeConfig): V1Hooks {
  const logger: InjectorLog = createAppLogger(input.client.app, config.verbose);
  const injector = createResumeInjector(config, {
    send: (sessionID, text) => sendV1(input.client, sessionID, text),
    isChildSession: (sessionID) => isChildSession(input.client, sessionID),
    log: logger,
  });

  return {
    async event({ event }) {
      if (event?.type !== V1_SESSION_COMPACTED) return;
      await injector.handle(event.properties?.sessionID, "v1.session.compacted");
    },

    async "experimental.compaction.autocontinue"(hookInput, output) {
      if (!config.enabled || !config.suppressBuiltinAutoContinue) return;

      let child = false;
      try {
        child = await isChildSession(input.client, hookInput.sessionID);
      } catch (error) {
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
      if (child && !config.includeChildSessions) return;

      output.enabled = false;
      logger("debug", "suppressed built-in auto-continue", { sessionID: hookInput.sessionID });
    },
  };
}

async function sendV1(client: V1Client, sessionID: string, text: string): Promise<void> {
  const prompt: V1PromptInput = {
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

function unwrapSessionInfo(result: V1SessionGetResult): V1SessionInfo | undefined {
  if (!result) return undefined;
  if ("data" in result && result.data) return result.data;
  return result as V1SessionInfo;
}

async function isChildSession(client: V1Client, sessionID: string): Promise<boolean> {
  if (!client.session.get) return false;
  const info = unwrapSessionInfo(await client.session.get({ path: { id: sessionID } }));
  return Boolean(info?.parentID ?? info?.parentId);
}

/** Normalize v1 environment and tuple options. Exported for the hybrid entrypoint. */
export function resolveV1Config(
  raw?: RawOptions | null,
  env: Record<string, string | undefined> = process.env,
): ResumeConfig {
  return normalizeOptions(raw, env);
}
