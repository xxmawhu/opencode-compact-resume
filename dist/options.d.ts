/**
 * Resolved runtime configuration. Both entrypoints normalize to this shape so
 * v1 (environment only) and v2 (plugin options + environment) behave alike.
 */
export interface ResumeConfig {
    /** Master switch. When false the plugin registers nothing that can inject. */
    readonly enabled: boolean;
    /** Text injected into the session after compaction completes. */
    readonly text: string;
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
    readonly includeChildSessions?: unknown;
    readonly suppressBuiltinAutoContinue?: unknown;
    readonly verbose?: unknown;
}
type Env = Record<string, string | undefined>;
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
export declare function normalizeOptions(raw?: RawOptions | null, env?: Env): ResumeConfig;
export {};
//# sourceMappingURL=options.d.ts.map