// Local OpenCode v1 plugin entry, copied to
// ~/.config/opencode/plugin/opencode-compact-resume.ts by install.sh.
//
// The v1 legacy loader treats every export of a local plugin module as a
// plugin function, so this file must not export constants or types. The hybrid
// package default export is an object ({ id, setup, server }); `server()` is
// the classic v1 hook factory, which is the form host builds older than
// 1.18.29 load (see README).
import hybrid from "./opencode-compact-resume/index.js";

const createPlugin = (input) => hybrid.server(input);

export const Plugin = createPlugin;
export default createPlugin;
