import { DEFAULT_TEXT, ENV_PREFIX } from "./constants.js";
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);
function toBoolean(value) {
    if (typeof value === "boolean")
        return value;
    if (typeof value !== "string")
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized))
        return true;
    if (FALSE_VALUES.has(normalized))
        return false;
    return undefined;
}
function toText(value) {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
/**
 * Precedence: explicit plugin options > environment variables > defaults.
 *
 * Environment variables (v1 has no options channel):
 *   OPENCODE_COMPACT_RESUME_DISABLED
 *   OPENCODE_COMPACT_RESUME_TEXT
 *   OPENCODE_COMPACT_RESUME_INCLUDE_CHILD_SESSIONS
 *   OPENCODE_COMPACT_RESUME_SUPPRESS_BUILTIN_AUTO_CONTINUE
 *   OPENCODE_COMPACT_RESUME_VERBOSE
 */
export function normalizeOptions(raw, env = process.env) {
    const options = raw ?? {};
    const disabled = toBoolean(env[`${ENV_PREFIX}DISABLED`]);
    return {
        enabled: toBoolean(options.enabled) ?? (disabled === undefined ? true : !disabled),
        text: toText(options.text) ?? toText(env[`${ENV_PREFIX}TEXT`]) ?? DEFAULT_TEXT,
        includeChildSessions: toBoolean(options.includeChildSessions) ??
            toBoolean(env[`${ENV_PREFIX}INCLUDE_CHILD_SESSIONS`]) ??
            false,
        suppressBuiltinAutoContinue: toBoolean(options.suppressBuiltinAutoContinue) ??
            toBoolean(env[`${ENV_PREFIX}SUPPRESS_BUILTIN_AUTO_CONTINUE`]) ??
            false,
        verbose: toBoolean(options.verbose) ?? toBoolean(env[`${ENV_PREFIX}VERBOSE`]) ?? false,
    };
}
//# sourceMappingURL=options.js.map