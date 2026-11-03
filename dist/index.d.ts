import type { RawOptions } from "./options.js";
import { type V1Hooks } from "./v1.js";
export interface HybridPlugin {
    readonly id: string;
    setup(ctx: unknown): Promise<() => void>;
    server(input: unknown, options?: RawOptions): Promise<V1Hooks>;
}
declare const plugin: HybridPlugin;
export default plugin;
export { DEFAULT_TEXT, PLUGIN_ID } from "./constants.js";
export type { RawOptions, ResumeConfig } from "./options.js";
//# sourceMappingURL=index.d.ts.map