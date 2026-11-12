// Local plugin entry, copied to
// ~/.config/opencode/plugin/opencode-compact-resume.ts by install.sh.
//
// opencode2 requires the default export to be an object with an id and a
// setup (or effect) function. OpenCode v1 (verified on 1.18.14) accepts the
// same object and calls `server()` to obtain the classic hook map. Export the
// hybrid package default directly so both loaders see one definition.
//
// Do not add named exports: the v1 legacy loader treats every export as a
// plugin function.
// The module dir lives outside plugin/: opencode2 loads every first-level
// directory under plugin/ as a plugin package, which would load the library a
// second time and rely on undocumented id de-duplication.
import hybrid from "../opencode-compact-resume-lib/index.js";

export default hybrid;
