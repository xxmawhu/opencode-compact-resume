import { DEFAULT_COOLDOWN_MS, DEFAULT_TEXT, ENV_PREFIX } from "./constants.js";

/**
 * Resolved runtime configuration. Both entrypoints normalize to this shape so
 * v1 (environment only) and v2 (plugin options + environment) behave alike.
 */
export interface ResumeConfig {
  /** Master switch. When false the plugin registers nothing that can inject. */
  readonly enabled: boolean;
  /** Text injected into the session after compaction completes. */
  readonly text: string;
  /** Minimum interval between injections into the same session. */
  readonly cooldownMs: number;
  /** Inject into child (subagent) sessions as well. Defaults to false. */
  readonly includeChildSessions: boolean;
  /**
   * v1 only: disable OpenCode's built-in generic auto-continue so the custom
   * reminder is the single continuation turn. Defaults to false for safety.
   */
  readonly suppressBuiltinAutoContinue: boolean;
  /** Emit info/debug diagnostics in addition to warnings and errors. */
  readonly verbose: boolean;
}

/** Options accepted from OpenCode v2 (`ctx.options`) or from tests. */
export interface RawOptions {
  readonly enabled?: unknown;
  readonly text?: unknown;
  readonly cooldownMs?: unknown;
  readonly includeChildSessions?: unknown;
  readonly suppressBuiltinAutoContinue?: unknown;
  readonly verbose?: unknown;
}

type Env = Record<string, string | undefined>;

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return undefined;
}

function toCooldown(value: unknown): number | undefined {
  let candidate = Number.NaN;
  if (typeof value === "number") {
    candidate = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    candidate = Number(value);
  }
  if (!Number.isFinite(candidate) || candidate < 0) return undefined;
  return Math.floor(candidate);
}

function toText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Precedence: explicit plugin options > environment variables > defaults.
 *
 * Environment variables (v1 has no options channel):
 *   OPENCODE_COMPACT_RESUME_DISABLED
 *   OPENCODE_COMPACT_RESUME_TEXT
 *   OPENCODE_COMPACT_RESUME_COOLDOWN_MS
 *   OPENCODE_COMPACT_RESUME_INCLUDE_CHILD_SESSIONS
 *   OPENCODE_COMPACT_RESUME_SUPPRESS_BUILTIN_AUTO_CONTINUE
 *   OPENCODE_COMPACT_RESUME_VERBOSE
 */
export function normalizeOptions(raw?: RawOptions | null, env: Env = process.env): ResumeConfig {
  const options = raw ?? {};
  const disabled = toBoolean(env[`${ENV_PREFIX}DISABLED`]);

  return {
    enabled: toBoolean(options.enabled) ?? (disabled === undefined ? true : !disabled),
    text: toText(options.text) ?? toText(env[`${ENV_PREFIX}TEXT`]) ?? DEFAULT_TEXT,
    cooldownMs:
      toCooldown(options.cooldownMs) ??
      toCooldown(env[`${ENV_PREFIX}COOLDOWN_MS`]) ??
      DEFAULT_COOLDOWN_MS,
    includeChildSessions:
      toBoolean(options.includeChildSessions) ??
      toBoolean(env[`${ENV_PREFIX}INCLUDE_CHILD_SESSIONS`]) ??
      false,
    suppressBuiltinAutoContinue:
      toBoolean(options.suppressBuiltinAutoContinue) ??
      toBoolean(env[`${ENV_PREFIX}SUPPRESS_BUILTIN_AUTO_CONTINUE`]) ??
      false,
    verbose: toBoolean(options.verbose) ?? toBoolean(env[`${ENV_PREFIX}VERBOSE`]) ?? false,
  };
}
