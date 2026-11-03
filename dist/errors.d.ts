/**
 * Error raised when the plugin cannot fulfill its host contract, e.g. an
 * invalid plugin context or a client without any prompt transport.
 *
 * The host only surfaces the message, but a distinct class keeps failures
 * identifiable in logs and tests.
 */
export declare class PluginError extends Error {
    constructor(message: string);
}
//# sourceMappingURL=errors.d.ts.map